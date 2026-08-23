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

const SALES_HEADERS = ["業務代碼", "業務姓名", "業務Email", "LINE連結", "啟用", "Follow-up角色"];

function makeSalesRow(overrides = {}) {
  const row = ["JW", "Jerry", "jerry@company.example", "", "TRUE", "SALES"];
  Object.entries(overrides).forEach(([index, value]) => {
    row[Number(index)] = value;
  });
  return row;
}

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
    salesHeaders: options.salesHeaders ?? SALES_HEADERS.slice(),
    salesRows: options.salesRows ?? [
      makeSalesRow(),
      makeSalesRow({ 0: "AP", 1: "April", 2: "april@company.example", 5: "MANAGER" }),
    ],
    batchGetCalls: 0,
    updateCalls: 0,
    updates: [],
    lockWaitCalls: 0,
    lockReleaseCalls: 0,
    locked: false,
    updateObservedLock: false,
    properties: {
      FOLLOWUP_ALLOWED_DOMAIN: "company.example",
      FOLLOWUP_SPREADSHEET_ID: "test-spreadsheet-id",
      FOLLOWUP_IDENTITY_SECRET: SECRET,
      ...(options.properties ?? {}),
    },
  };

  function valuesForRange(range) {
    if (range.endsWith("業務資料'!A1:F")) return [state.salesHeaders, ...state.salesRows];
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
          batchUpdate(resource, spreadsheetId) {
            state.updateCalls += 1;
            state.updateObservedLock = state.locked;
            assert.equal(spreadsheetId, "test-spreadsheet-id");
            assert.equal(resource.valueInputOption, "USER_ENTERED");
            assert.equal(resource.includeValuesInResponse, false);
            assert.equal(resource.data.length, 2);

            const tableUpdate = resource.data[0];
            const caseUpdate = resource.data[1];
            const tableMatch = tableUpdate.range.match(/!M(\d+)$/);
            const caseMatch = caseUpdate.range.match(/!P(\d+)$/);
            assert.ok(tableMatch, `Table count range must be M on one row: ${tableUpdate.range}`);
            assert.ok(caseMatch, `Case write range must start at P on one row: ${caseUpdate.range}`);
            assert.equal(tableMatch[1], caseMatch[1]);

            const rowIndex = Number(tableMatch[1]) - 2;
            const tableValues = tableUpdate.values[0].slice();
            const caseValues = caseUpdate.values[0].slice();
            assert.equal(tableValues.length, 1);
            assert.equal(caseValues.length, 5);
            state.rows[rowIndex][12] = tableValues[0];
            state.rows[rowIndex].splice(15, 5, ...caseValues);
            state.updates.push(
              { range: tableUpdate.range, values: tableValues },
              { range: caseUpdate.range, values: caseValues },
            );
            return { totalUpdatedRanges: 2 };
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
    estimatedTables: detail.estimatedTables,
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
  const { context, state } = createRuntime({ email: "other@outside.example" });
  const payload = {
    serialNumber: "115DX2031",
    identityToken: "a".repeat(43),
    revisionToken: "b".repeat(43),
    estimatedTables: "20",
    firstConsultation: "",
    secondConsultation: "",
    thirdConsultation: "",
    status: "洽談中",
    closedDate: "",
  };
  assert.throws(() => context.updateCase(payload), /UNAUTHORIZED/);
  assert.equal(state.batchGetCalls, 0);
  assert.equal(state.updateCalls, 0);
  assert.equal(state.lockWaitCalls, 0);
});

test("3 payload 只允許固定 M、P:T 編輯欄位與安全識別欄位", () => {
  const { context } = createRuntime();
  const payload = payloadFor(context);
  assert.deepEqual(Object.keys(payload).sort(), [
    "closedDate",
    "estimatedTables",
    "firstConsultation",
    "identityToken",
    "revisionToken",
    "secondConsultation",
    "serialNumber",
    "status",
    "thirdConsultation",
  ]);
});

test("4 payload 含 M 以外的 A:O 欄位更新值會拒絕", () => {
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

test("22 update 以單次 batch request 指定 M 與 P 起始儲存格", () => {
  const { context, state } = createRuntime();
  context.updateCase(payloadFor(context, {
    estimatedTables: "26",
    firstConsultation: "P 值",
    secondConsultation: "Q 值",
    thirdConsultation: "R 值",
    status: "已訂",
    closedDate: "2026-08-20",
  }));
  assert.equal(state.updateCalls, 1);
  assert.deepEqual(state.updates.map((update) => update.range), [
    "'新人資料'!M2",
    "'新人資料'!P2",
  ]);
  assert.deepEqual(Array.from(state.updates[0].values), ["26"]);
  assert.deepEqual(Array.from(state.updates[1].values), [
    "P 值",
    "Q 值",
    "R 值",
    "已訂",
    "2026-08-20",
  ]);
  assert.equal(state.updates[1].values.length, 5);
  assert.equal(state.updates.some((update) => /![NO]\d/.test(update.range)), false);
  assert.equal(state.updateObservedLock, true);
  assert.equal(state.lockWaitCalls, 1);
  assert.equal(state.lockReleaseCalls, 1);
});

test("23 A:L 與 N:O 永遠不被修改", () => {
  const { context, state } = createRuntime();
  const beforeAL = state.rows[0].slice(0, 12);
  const beforeNO = state.rows[0].slice(13, 15);
  context.updateCase(payloadFor(context, {
    estimatedTables: "26",
    firstConsultation: "P",
    secondConsultation: "Q",
    thirdConsultation: "R",
  }));
  assert.deepEqual(state.rows[0].slice(0, 12), beforeAL);
  assert.deepEqual(state.rows[0].slice(13, 15), beforeNO);
  assert.equal(state.rows[0][12], "26");
  assert.match(serverSource, /quoteSheetRange_\('M' \+ rowNumber\)/);
  assert.match(serverSource, /quoteSheetRange_\('P' \+ rowNumber\)/);
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

test("revisionToken deterministic 涵蓋 A、C、M、P、Q、R、S、T 且不含 row number", () => {
  const { context } = createRuntime();
  const first = context.getCase("115DX2031");
  const second = context.getCase("115DX2031");
  assert.equal(first.revisionToken, second.revisionToken);
  assert.equal("duplicateKey" in first, false);
  assert.equal("rowNumber" in first, false);
});

test("28 合法桌數可與 P 同時儲存並由 getCase 讀回", () => {
  const { context, state } = createRuntime();
  const result = context.updateCase(payloadFor(context, {
    estimatedTables: "35",
    firstConsultation: "同步更新",
  }));
  assert.equal(state.rows[0][12], "35");
  assert.equal(state.rows[0][15], "同步更新");
  assert.equal(result.estimatedTables, "35");
  assert.equal(context.getCase("115DX2031").estimatedTables, "35");
});

for (const [label, value] of [
  ["0", "0"],
  ["負數", "-1"],
  ["小數", "1.5"],
  ["文字", "二十"],
  ["空白", ""],
  ["超過 200", "201"],
]) {
  test(`29 桌數 ${label} 會拒絕且完全不寫入`, () => {
    const { context, state } = createRuntime();
    const before = state.rows[0].slice();
    assert.throws(
      () => context.updateCase(payloadFor(context, { estimatedTables: value })),
      /VALIDATION_ERROR/,
    );
    assert.equal(state.updateCalls, 0);
    assert.deepEqual(state.rows[0], before);
  });
}

test("30 revisionToken 納入 M，其他人先改 M 會 CONFLICT 且 M/P 都不寫入", () => {
  const { context, state } = createRuntime();
  const payload = payloadFor(context, {
    estimatedTables: "30",
    firstConsultation: "舊畫面內容",
  });
  state.rows[0][12] = "28";
  const current = state.rows[0].slice();
  assert.throws(() => context.updateCase(payload), /CONFLICT/);
  assert.equal(state.updateCalls, 0);
  assert.deepEqual(state.rows[0], current);
});

test("31 payload 含 N/O 或其他唯讀欄位會拒絕", () => {
  for (const field of ["salesCode", "salesName", "weddingDate", "row", "range"]) {
    const { context, state } = createRuntime();
    const payload = payloadFor(context);
    payload[field] = "不可修改";
    assert.throws(() => context.updateCase(payload), /VALIDATION_ERROR/);
    assert.equal(state.updateCalls, 0);
  }
});

test("32 UI 桌數輸入、dirty state、成功 baseline 與錯誤訊息完整", () => {
  assert.match(clientHtml, /\['桌數', String\(caseData\.estimatedTables \|\| ''\), 'number'\]/);
  assert.match(clientHtml, /input\.type = 'number'/);
  assert.match(clientHtml, /input\.min = '1'/);
  assert.match(clientHtml, /input\.max = '200'/);
  assert.match(clientHtml, /input\.addEventListener\('input', handleEditorInput_\)/);
  assert.match(clientHtml, /estimatedTables: String\(estimatedTablesInput/);
  assert.match(clientHtml, /baseline = editableSnapshot_\(caseData\)/);
  assert.match(clientHtml, /請輸入正確桌數。/);
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

test("SALES update 自己案件成功，他人案件回傳 FORBIDDEN 且完全不寫入", () => {
  const rows = [
    makeRow(),
    makeRow({ 0: "115DX2032", 2: "private-duplicate-key-two", 13: "AP", 14: "April" }),
  ];
  const { context, state } = createRuntime({ rows });
  assert.doesNotThrow(() => context.updateCase(payloadFor(context, { firstConsultation: "自己案件" })));
  assert.equal(state.updateCalls, 1);

  const otherDetail = createRuntime({ email: "april@company.example", rows }).context.getCase("115DX2032");
  const forbiddenPayload = {
    serialNumber: otherDetail.serialNumber,
    identityToken: otherDetail.identityToken,
    revisionToken: otherDetail.revisionToken,
    estimatedTables: otherDetail.estimatedTables,
    firstConsultation: "不可寫入",
    secondConsultation: otherDetail.secondConsultation,
    thirdConsultation: otherDetail.thirdConsultation,
    status: otherDetail.status,
    closedDate: otherDetail.closedDate,
  };
  const beforeOther = state.rows[1].slice();
  assert.throws(() => context.updateCase(forbiddenPayload), /FORBIDDEN/);
  assert.equal(state.updateCalls, 1);
  assert.deepEqual(state.rows[1], beforeOther);
});

test("MANAGER 可修改任一業務的案件", () => {
  const rows = [makeRow()];
  const { context, state } = createRuntime({ email: "april@company.example", rows });
  const result = context.updateCase(payloadFor(context, { estimatedTables: "31" }));
  assert.equal(result.estimatedTables, "31");
  assert.equal(state.rows[0][12], "31");
  assert.equal(state.updateCalls, 1);
});

test("SALES 不得更新 N 空白案件", () => {
  const rows = [makeRow({ 13: "", 14: "" })];
  const managerRuntime = createRuntime({ email: "april@company.example", rows });
  const detail = managerRuntime.context.getCase("115DX2031");
  const payload = {
    serialNumber: detail.serialNumber,
    identityToken: detail.identityToken,
    revisionToken: detail.revisionToken,
    estimatedTables: detail.estimatedTables,
    firstConsultation: detail.firstConsultation,
    secondConsultation: detail.secondConsultation,
    thirdConsultation: detail.thirdConsultation,
    status: detail.status,
    closedDate: detail.closedDate,
  };
  const salesRuntime = createRuntime({ rows });
  assert.throws(() => salesRuntime.context.updateCase(payload), /FORBIDDEN/);
  assert.equal(salesRuntime.state.updateCalls, 0);
});

test("前端無法藉由偽造 salesCode 取得他人案件權限", () => {
  const { context, state } = createRuntime();
  const payload = payloadFor(context);
  payload.salesCode = "AP";
  assert.throws(() => context.updateCase(payload), /VALIDATION_ERROR/);
  assert.equal(state.updateCalls, 0);
  assert.doesNotMatch(clientHtml, /currentUser|role\s*:|salesCode\s*:/);
});

test("ownership 檢查位於 Lock critical section 且早於 revision 與寫入", () => {
  const updateStart = serverSource.indexOf("function updateCase(payload)");
  const updateEnd = serverSource.indexOf("function getCurrentFollowupUser_", updateStart);
  const updateSource = serverSource.slice(updateStart, updateEnd);
  const lockIndex = updateSource.indexOf("lock.waitLock");
  const ownershipIndex = updateSource.indexOf("assertCaseAccess_");
  const revisionIndex = updateSource.indexOf("createRevisionToken_");
  const writeIndex = updateSource.indexOf("writeCaseFields_");
  assert.ok(lockIndex >= 0 && ownershipIndex > lockIndex);
  assert.ok(revisionIndex > ownershipIndex);
  assert.ok(writeIndex > revisionIndex);
});
