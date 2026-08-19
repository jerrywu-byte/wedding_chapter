import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const serverSource = read("google-apps-script/followup-auth-test/Code.gs");
const clientHtml = read("google-apps-script/followup-auth-test/Client.html");
const indexHtml = read("google-apps-script/followup-auth-test/Index.html");
const manifest = JSON.parse(read("google-apps-script/followup-auth-test/appsscript.json"));

const HEADERS = [
  "正式流水號",
  "提交時間",
  "防重複識別碼",
  "新郎姓名",
  "新郎電話",
  "新娘姓名",
  "新娘電話",
  "主要聯絡人姓名",
  "主要聯絡人電話",
  "婚宴日期",
  "日期未定",
  "婚宴時段",
  "預計桌數",
  "業務代碼",
  "業務姓名",
  "第一次洽談",
  "第二次洽談",
  "第三次洽談",
  "狀態",
  "結案日期",
];

const SECRET = "test-only-identity-secret-at-least-32-characters";

function makeRow(overrides = {}) {
  const row = [
    "115DX2031",
    "2026/08/19 10:00:00",
    "private-duplicate-key-one",
    "王大明",
    "0911-111-111",
    "林小美",
    "0922-222-222",
    "林小美",
    "0922-222-222",
    "2027/03/20",
    "FALSE",
    "晚",
    "20",
    "JW",
    "Jerry",
    "第一次原始內容",
    "",
    "",
    "",
    "",
  ];
  Object.entries(overrides).forEach(([index, value]) => {
    row[Number(index)] = value;
  });
  return row;
}

function createRuntime(options = {}) {
  const state = {
    email: options.email ?? "jerry@company.example",
    headers: options.headers ?? HEADERS.slice(),
    rows: options.rows ?? [makeRow()],
    batchGetCalls: 0,
    updateCalls: 0,
    updates: [],
    lockWaitCalls: 0,
    lockReleaseCalls: 0,
    locked: false,
    updateObservedLock: false,
    properties: {
      FOLLOWUP_ALLOWED_DOMAIN: "company.example",
      FOLLOWUP_ALLOWED_EMAILS: "jerry@company.example,april@company.example",
      FOLLOWUP_SPREADSHEET_ID: "test-spreadsheet-id",
      FOLLOWUP_IDENTITY_SECRET: SECRET,
      ...(options.properties ?? {}),
    },
  };

  function valuesForRange(range) {
    if (range.endsWith("A1:T1")) return [state.headers];
    if (range.endsWith("A2:O")) return state.rows.map((row) => row.slice(0, 15));
    if (range.endsWith("S2:S")) return state.rows.map((row) => [row[18]]);
    if (range.endsWith("A2:T")) return state.rows.map((row) => row.slice(0, 20));
    throw new Error(`Unexpected test range: ${range}`);
  }

  const context = vm.createContext({
    console: { warn() {} },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            return state.properties[key] ?? null;
          },
        };
      },
    },
    Session: {
      getActiveUser() {
        return { getEmail: () => state.email };
      },
    },
    LockService: {
      getScriptLock() {
        return {
          waitLock(timeout) {
            assert.equal(timeout, 30000);
            state.lockWaitCalls += 1;
            state.locked = true;
          },
          releaseLock() {
            state.lockReleaseCalls += 1;
            state.locked = false;
          },
        };
      },
    },
    Utilities: {
      Charset: { UTF_8: "UTF_8" },
      computeHmacSha256Signature(value, secret) {
        return Array.from(crypto.createHmac("sha256", secret).update(value).digest());
      },
      base64EncodeWebSafe(bytes) {
        return Buffer.from(bytes).toString("base64url");
      },
    },
    Sheets: {
      Spreadsheets: {
        Values: {
          batchGet(spreadsheetId, request) {
            state.batchGetCalls += 1;
            assert.equal(spreadsheetId, "test-spreadsheet-id");
            return {
              valueRanges: request.ranges.map((range) => ({
                range,
                values: valuesForRange(range),
              })),
            };
          },
          update(resource, spreadsheetId, range, request) {
            state.updateCalls += 1;
            state.updateObservedLock = state.locked;
            assert.equal(spreadsheetId, "test-spreadsheet-id");
            assert.equal(request.valueInputOption, "USER_ENTERED");
            assert.equal(request.includeValuesInResponse, false);

            const match = range.match(/!P(\d+):T\1$/);
            assert.ok(match, `Write range must be P:T on one row: ${range}`);
            const rowIndex = Number(match[1]) - 2;
            const values = resource.values[0].slice();
            assert.equal(values.length, 5);
            state.rows[rowIndex].splice(15, 5, ...values);
            state.updates.push({ range, values });
            return { updatedRange: range };
          },
        },
      },
    },
  });

  vm.runInContext(serverSource, context, { filename: "Code.gs" });
  return { context, state };
}

function payloadFor(context, overrides = {}) {
  const detail = context.getCase(overrides.serialNumber ?? "115DX2031");
  return {
    serialNumber: detail.serialNumber,
    identityToken: detail.identityToken,
    revisionToken: detail.revisionToken,
    firstConsultation: detail.firstConsultation,
    secondConsultation: detail.secondConsultation,
    thirdConsultation: detail.thirdConsultation,
    status: detail.status,
    closedDate: detail.closedDate,
    ...overrides,
  };
}

test("1 授權帳號可 update", () => {
  const { context, state } = createRuntime();
  const payload = payloadFor(context, { firstConsultation: "更新內容" });
  const result = context.updateCase(payload);
  assert.equal(result.firstConsultation, "更新內容");
  assert.equal(state.updateCalls, 1);
});

test("2 未授權帳號不可 update 且不讀寫 Sheet", () => {
  const { context, state } = createRuntime({ email: "other@company.example" });
  const payload = {
    serialNumber: "115DX2031",
    identityToken: "a".repeat(43),
    revisionToken: "b".repeat(43),
    firstConsultation: "",
    secondConsultation: "",
    thirdConsultation: "",
    status: "洽談中",
    closedDate: "",
  };
  assert.throws(() => context.updateCase(payload), /AUTH_EMAIL_DENIED/);
  assert.equal(state.batchGetCalls, 0);
  assert.equal(state.updateCalls, 0);
  assert.equal(state.lockWaitCalls, 0);
});

test("3 payload 只允許固定 P:T 編輯欄位與安全識別欄位", () => {
  const { context } = createRuntime();
  const payload = payloadFor(context);
  assert.deepEqual(Object.keys(payload).sort(), [
    "closedDate",
    "firstConsultation",
    "identityToken",
    "revisionToken",
    "secondConsultation",
    "serialNumber",
    "status",
    "thirdConsultation",
  ]);
});

test("4 payload 含 A:O 欄位更新值會拒絕", () => {
  const { context, state } = createRuntime();
  const payload = payloadFor(context);
  payload.groomName = "不可修改";
  assert.throws(() => context.updateCase(payload), /VALIDATION_ERROR/);
  assert.equal(state.updateCalls, 0);
});

test("5 serialNumber 不存在", () => {
  const { context, state } = createRuntime();
  const payload = payloadFor(context);
  payload.serialNumber = "115DX9999";
  assert.throws(() => context.updateCase(payload), /NOT_FOUND/);
  assert.equal(state.updateCalls, 0);
});

test("6 serialNumber 重複", () => {
  const { context, state } = createRuntime();
  const payload = payloadFor(context);
  state.rows.push(makeRow({ 2: "different-duplicate-key" }));
  assert.throws(() => context.updateCase(payload), /DATA_INTEGRITY_ERROR/);
  assert.equal(state.updateCalls, 0);
});

test("7 identity token 對應的 duplicateKey 不存在", () => {
  const { context, state } = createRuntime();
  const payload = payloadFor(context, { identityToken: "a".repeat(43) });
  assert.throws(() => context.updateCase(payload), /NOT_FOUND/);
  assert.equal(state.updateCalls, 0);
});

test("8 duplicateKey 重複", () => {
  const { context, state } = createRuntime();
  const payload = payloadFor(context);
  state.rows.push(makeRow({ 0: "115DX2032" }));
  assert.throws(() => context.updateCase(payload), /DATA_INTEGRITY_ERROR/);
  assert.equal(state.updateCalls, 0);
});

test("9 A 與 C 指向不同 row", () => {
  const rows = [
    makeRow(),
    makeRow({ 0: "115DX2032", 2: "private-duplicate-key-two" }),
  ];
  const { context, state } = createRuntime({ rows });
  const first = payloadFor(context);
  const second = context.getCase("115DX2032");
  first.identityToken = second.identityToken;
  assert.throws(() => context.updateCase(first), /DATA_INTEGRITY_ERROR/);
  assert.equal(state.updateCalls, 0);
});

test("10 revisionToken 相同時成功", () => {
  const { context, state } = createRuntime();
  const payload = payloadFor(context, { secondConsultation: "第二次內容" });
  assert.doesNotThrow(() => context.updateCase(payload));
  assert.equal(state.updateCalls, 1);
});

test("11 revisionToken 不同時回傳 CONFLICT", () => {
  const { context, state } = createRuntime();
  const payload = payloadFor(context);
  state.rows[0][15] = "其他人剛更新";
  assert.throws(() => context.updateCase(payload), /CONFLICT/);
  assert.equal(state.updateCalls, 0);
});

test("12 P/Q/R 正常寫入並統一換行與 trim", () => {
  const { context, state } = createRuntime();
  const payload = payloadFor(context, {
    firstConsultation: "  第一行\r\n第二行  ",
    secondConsultation: "第二次",
    thirdConsultation: "第三次",
  });
  context.updateCase(payload);
  assert.deepEqual(state.rows[0].slice(15, 18), ["第一行\n第二行", "第二次", "第三次"]);
});

test("13 P/Q/R 空白可寫入", () => {
  const { context, state } = createRuntime();
  context.updateCase(payloadFor(context, {
    firstConsultation: " ",
    secondConsultation: "\n",
    thirdConsultation: "",
  }));
  assert.deepEqual(state.rows[0].slice(15, 18), ["", "", ""]);
});

test("14 status 洽談中且 closedDate 空白可成功", () => {
  const { context, state } = createRuntime();
  context.updateCase(payloadFor(context, { status: "洽談中", closedDate: "" }));
  assert.equal(state.rows[0][18], "洽談中");
  assert.equal(state.rows[0][19], "");
});

test("15 status 洽談中但 closedDate 有值會拒絕", () => {
  const { context, state } = createRuntime();
  assert.throws(
    () => context.updateCase(payloadFor(context, { status: "洽談中", closedDate: "2026-08-20" })),
    /VALIDATION_ERROR/,
  );
  assert.equal(state.updateCalls, 0);
});

for (const [number, status] of [[16, "已訂"], [17, "退訂"], [18, "流失"]]) {
  test(`${number} ${status}沒有 closedDate 會拒絕`, () => {
    const { context, state } = createRuntime();
    assert.throws(
      () => context.updateCase(payloadFor(context, { status, closedDate: "" })),
      /VALIDATION_ERROR/,
    );
    assert.equal(state.updateCalls, 0);
  });
}

test("19 三種結案狀態搭配有效 closedDate 都可成功", () => {
  for (const status of ["已訂", "退訂", "流失"]) {
    const { context, state } = createRuntime();
    context.updateCase(payloadFor(context, { status, closedDate: "2026-08-20" }));
    assert.equal(state.rows[0][18], status);
    assert.equal(state.rows[0][19], "2026-08-20");
  }
});

test("20 結案狀態切回洽談中會清空 closedDate", () => {
  const row = makeRow({ 18: "已訂", 19: "2026/08/20" });
  const { context, state } = createRuntime({ rows: [row] });
  context.updateCase(payloadFor(context, { status: "洽談中", closedDate: "" }));
  assert.equal(state.rows[0][18], "洽談中");
  assert.equal(state.rows[0][19], "");
});

test("21 CONFLICT 完全不得寫入", () => {
  const { context, state } = createRuntime();
  const before = state.rows[0].slice();
  const payload = payloadFor(context, { firstConsultation: "試圖覆蓋" });
  state.rows[0][16] = "別人更新第二次";
  const current = state.rows[0].slice();
  assert.throws(() => context.updateCase(payload), /CONFLICT/);
  assert.equal(state.updateCalls, 0);
  assert.deepEqual(state.rows[0], current);
  assert.notDeepEqual(state.rows[0], before);
});

test("22 update 僅以單次 P:T 寫入", () => {
  const { context, state } = createRuntime();
  context.updateCase(payloadFor(context, { firstConsultation: "更新" }));
  assert.equal(state.updateCalls, 1);
  assert.equal(state.updates[0].range, "'新人資料'!P2:T2");
  assert.equal(state.updates[0].values.length, 5);
  assert.equal(state.updateObservedLock, true);
  assert.equal(state.lockWaitCalls, 1);
  assert.equal(state.lockReleaseCalls, 1);
});

test("23 A:O 永遠不被修改", () => {
  const { context, state } = createRuntime();
  const before = state.rows[0].slice(0, 15);
  context.updateCase(payloadFor(context, {
    firstConsultation: "P",
    secondConsultation: "Q",
    thirdConsultation: "R",
  }));
  assert.deepEqual(state.rows[0].slice(0, 15), before);
  assert.match(serverSource, /quoteSheetRange_\('P' \+ rowNumber \+ ':T' \+ rowNumber\)/);
});

test("24 儲存成功回傳新版 revisionToken", () => {
  const { context } = createRuntime();
  const payload = payloadFor(context, { firstConsultation: "新版" });
  const result = context.updateCase(payload);
  assert.notEqual(result.revisionToken, payload.revisionToken);
  assert.equal(result.identityToken, payload.identityToken);
  assert.equal(result.revisionToken, context.getCase(payload.serialNumber).revisionToken);
});

test("25 UI 具備 dirty state 與離開確認", () => {
  assert.match(clientHtml, /function isDirty_\(\)/);
  assert.match(clientHtml, /目前有尚未儲存的修改，確定要離開嗎？/);
  assert.match(clientHtml, /beforeunload/);
  assert.match(clientHtml, /elements\.back\.addEventListener/);
});

test("26 儲存中按鈕 disabled", () => {
  assert.match(clientHtml, /isSaving = true;[\s\S]*elements\.saveCase\.disabled = true;[\s\S]*儲存中…/);
  assert.match(indexHtml, /id="saveCase"[^>]*disabled/);
});

test("27 儲存錯誤後保留使用者輸入", () => {
  const saveStart = clientHtml.indexOf("function saveCase_()");
  const failureStart = clientHtml.indexOf(".withFailureHandler", saveStart);
  const updateCall = clientHtml.indexOf(".updateCase(payload)", failureStart);
  const failureHandler = clientHtml.slice(failureStart, updateCall);
  assert.match(failureHandler, /setEditorDisabled_\(false\)/);
  assert.match(failureHandler, /updateSaveButton_\(\)/);
  assert.doesNotMatch(failureHandler, /renderCaseDetail|textarea\.value|loadCase/);
});

test("revisionToken deterministic 涵蓋 A、C、P、Q、R、S、T 且不含 row number", () => {
  const { context } = createRuntime();
  const first = context.getCase("115DX2031");
  const second = context.getCase("115DX2031");
  assert.equal(first.revisionToken, second.revisionToken);
  assert.equal("duplicateKey" in first, false);
  assert.equal("rowNumber" in first, false);
});

test("closedDate 僅接受有效 YYYY-MM-DD", () => {
  for (const invalid of ["2026/08/20", "2026-02-30", "文字", "2026-8-2"] ) {
    const { context, state } = createRuntime();
    assert.throws(
      () => context.updateCase(payloadFor(context, { status: "已訂", closedDate: invalid })),
      /VALIDATION_ERROR/,
    );
    assert.equal(state.updateCalls, 0);
  }
});

test("manifest 使用 Sheets write scope 且不增加 Drive scope", () => {
  assert.ok(manifest.oauthScopes.includes("https://www.googleapis.com/auth/spreadsheets"));
  assert.equal(manifest.oauthScopes.some((scope) => scope.includes("drive")), false);
});

test("UI 提供重新開啟確認、CONFLICT 訊息與可編輯 P/Q/R", () => {
  assert.match(clientHtml, /重新開啟案件將清除原結案日期。/);
  assert.match(clientHtml, /此案件已被其他人更新，請重新載入最新資料後再編輯。/);
  assert.match(clientHtml, /textarea\.maxLength = 5000/);
  assert.doesNotMatch(clientHtml, /textarea\.readOnly = true/);
});
