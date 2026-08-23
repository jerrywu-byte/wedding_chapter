import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const serverSource = read("google-apps-script/followup-auth-test/Code.gs");
const manifest = JSON.parse(read("google-apps-script/followup-auth-test/appsscript.json"));
const indexHtml = read("google-apps-script/followup-auth-test/Index.html");
const clientHtml = read("google-apps-script/followup-auth-test/Client.html");
const unauthorizedHtml = read("google-apps-script/followup-auth-test/Unauthorized.html");
const publicGateway = read("presentation/followup/FollowupApp.tsx");

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

function makeRow(overrides = {}) {
  const row = [
    "115DX2031",
    "2026/08/19 10:00:00",
    "private-duplicate-key",
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
    "已完成第一次洽談",
    "",
    "第三次洽談補充",
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
    rows: options.rows ?? [
      makeRow(),
      makeRow({
        0: "115DX2032",
        2: "another-private-key",
        3: "陳志明",
        4: "0933-333-333",
        5: "周雅婷",
        6: "0944-444-444",
        7: "陳志明",
        8: "0933-333-333",
        18: "已訂",
        19: "2026/08/20",
      }),
    ],
    headers: options.headers ?? HEADERS,
    salesHeaders: options.salesHeaders ?? SALES_HEADERS,
    salesRows: options.salesRows ?? [
      makeSalesRow(),
      makeSalesRow({ 0: "AP", 1: "April", 2: "april@company.example", 5: "MANAGER" }),
    ],
    batchGetCalls: 0,
    properties: {
      FOLLOWUP_ALLOWED_DOMAIN: "company.example",
      FOLLOWUP_SPREADSHEET_ID: "test-spreadsheet-id",
      FOLLOWUP_IDENTITY_SECRET: "test-only-identity-secret-at-least-32-characters",
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
        },
      },
    },
  });

  vm.runInContext(serverSource, context, { filename: "Code.gs" });
  return { context, state };
}

test("授權帳號可以取得案件摘要", () => {
  const { context, state } = createRuntime();
  const result = context.listCases("");
  assert.equal(result.length, 2);
  assert.equal(state.batchGetCalls, 2);
});

test("非授權帳號在讀取 Sheet 前即被拒絕", () => {
  const { context, state } = createRuntime({ email: "other@outside.example" });
  assert.throws(() => context.listCases(""), /UNAUTHORIZED/);
  assert.equal(state.batchGetCalls, 0);
});

test("listCases 只回傳最小摘要且不含電話", () => {
  const { context } = createRuntime();
  const [summary] = context.listCases("");
  assert.deepEqual(Object.keys(summary).sort(), [
    "banquetSession",
    "brideName",
    "dateUndecided",
    "estimatedTables",
    "groomName",
    "salesCode",
    "salesName",
    "serialNumber",
    "status",
    "weddingDate",
  ]);
  assert.equal(Object.keys(summary).some((key) => /phone/i.test(key)), false);
});

test("搜尋支援訪客編號、新郎姓名、新娘姓名與電話", () => {
  const { context } = createRuntime();
  assert.equal(context.listCases("115DX2031")[0].serialNumber, "115DX2031");
  assert.equal(context.listCases("王大明")[0].serialNumber, "115DX2031");
  assert.equal(context.listCases("周雅婷")[0].serialNumber, "115DX2032");
  assert.equal(context.listCases("0922222222")[0].serialNumber, "115DX2031");
});

test("搜尋無結果回傳空摘要列表", () => {
  const { context } = createRuntime();
  assert.equal(context.listCases("不存在的新人").length, 0);
});

test("getCase 依訪客編號重新查找並回傳完整唯讀內容", () => {
  const { context } = createRuntime();
  const result = context.getCase("115DX2031");
  assert.equal(result.primaryContactName, "林小美");
  assert.equal(result.primaryContactPhone, "0922-222-222");
  assert.equal(result.firstConsultation, "已完成第一次洽談");
  assert.equal(result.secondConsultation, "");
  assert.equal(result.thirdConsultation, "第三次洽談補充");
  assert.equal("duplicateKey" in result, false);
  assert.equal("rowNumber" in result, false);
  assert.equal("spreadsheetId" in result, false);
});

test("getCase 找不到訪客編號時回傳 NOT_FOUND", () => {
  const { context } = createRuntime();
  assert.throws(() => context.getCase("115DX9999"), /NOT_FOUND/);
});

test("重複訪客編號會 fail closed", () => {
  const duplicate = makeRow({ 2: "different-private-key" });
  const { context } = createRuntime({ rows: [makeRow(), duplicate] });
  assert.throws(() => context.getCase("115DX2031"), /DATA_INTEGRITY_ERROR/);
});

test("空白狀態只在回傳內容中顯示為洽談中", () => {
  const { context, state } = createRuntime({ rows: [makeRow()] });
  assert.equal(context.listCases("")[0].status, "洽談中");
  assert.equal(context.getCase("115DX2031").status, "洽談中");
  assert.equal(state.rows[0][18], "");
});

test("正式二十欄 header 不符時停止讀取", () => {
  const badHeaders = HEADERS.slice();
  badHeaders[7] = "緊急聯絡人姓名";
  const { context } = createRuntime({ headers: badHeaders });
  assert.throws(() => context.listCases(""), /DATA_SCHEMA_ERROR/);
});

test("Apps Script manifest 僅增加 Sheets 必要寫入 scope", () => {
  assert.ok(manifest.oauthScopes.includes("https://www.googleapis.com/auth/spreadsheets"));
  assert.equal(manifest.oauthScopes.includes("https://www.googleapis.com/auth/spreadsheets.readonly"), false);
  assert.equal(manifest.oauthScopes.some((scope) => scope.includes("drive")), false);
  assert.equal(manifest.dependencies.enabledAdvancedServices[0].serviceId, "sheets");
});

test("Follow-up server 只提供固定 M 與 P 起始儲存格 batch 更新", () => {
  assert.doesNotMatch(
    serverSource,
    /SpreadsheetApp|appendRow|setValue|setValues|clearContent|deleteRow|insertRow|Values\.append/,
  );
  assert.match(serverSource, /Sheets\.Spreadsheets\.Values\.batchGet/);
  assert.match(serverSource, /Sheets\.Spreadsheets\.Values\.batchUpdate/);
  assert.match(serverSource, /quoteSheetRange_\('M' \+ rowNumber\)/);
  assert.match(serverSource, /quoteSheetRange_\('P' \+ rowNumber\)/);
  assert.doesNotMatch(serverSource, /quoteSheetRange_\('[NO]' \+ rowNumber\)/);
});

test("所有正式資料函式都先驗證授權", () => {
  assert.match(serverSource, /function listCases\(query\) \{\s*const currentUser = getCurrentFollowupUser_\(\);/);
  assert.match(serverSource, /function getCase\(serialNumber\) \{\s*const currentUser = getCurrentFollowupUser_\(\);/);
  assert.match(serverSource, /function updateCase\(payload\) \{\s*const currentUser = getCurrentFollowupUser_\(\);/);
});

test("HTML 不含正式新人資料、duplicateKey 或 Spreadsheet ID", () => {
  const browserSource = [indexHtml, clientHtml, unauthorizedHtml].join("\n");
  assert.doesNotMatch(browserSource, /private-duplicate-key|FOLLOWUP_SPREADSHEET_ID|1Th5K-/);
  assert.doesNotMatch(clientHtml, /duplicateKey|rowNumber/);
});

test("UI 統一顯示訪客編號且不出現舊稱", () => {
  const userVisibleSource = [indexHtml, clientHtml, unauthorizedHtml].join("\n");
  assert.match(userVisibleSource, /搜尋訪客編號、姓名或電話/);
  assert.match(clientHtml, /訪客編號 /);
  assert.doesNotMatch(userVisibleSource, /流水/);
});

test("可編輯 UI 保留 loading、empty、error 與洽談狀態", () => {
  assert.match(indexHtml, /正在載入新人案件…/);
  assert.match(clientHtml, /目前沒有新人案件/);
  assert.match(clientHtml, /找不到符合條件的新人/);
  assert.match(clientHtml, /找不到這筆新人資料/);
  assert.match(clientHtml, /案件資料異常，請聯絡管理人員/);
  assert.match(clientHtml, /尚未建立洽談紀錄/);
  assert.doesNotMatch(clientHtml, /textarea\.readOnly = true/);
  assert.match(clientHtml, /textarea\.maxLength = 5000/);
  assert.match(indexHtml, /id="saveCase"[^>]*disabled/);
  assert.match(indexHtml, /id="closedDate" type="date"/);
});

test("公開 Follow-up route 已停用 mock 並只導向受保護 Web App", () => {
  assert.doesNotMatch(publicGateway, /mockFollowupCases|listCases|getCase/);
  assert.match(publicGateway, /VITE_FOLLOWUP_APPS_SCRIPT_WEB_APP_URL/);
  assert.match(publicGateway, /window\.location\.replace/);
});

test("基本資料卡依三行規格排列且只顯示 M 欄桌數", () => {
  const start = clientHtml.indexOf("renderBasicInformation_([");
  const end = clientHtml.indexOf("]);", start);
  const cardMapping = clientHtml.slice(start, end);
  const labels = [
    "婚宴日期",
    "宴別",
    "桌數",
    "接待業務",
    "新郎姓名",
    "新郎電話",
    "新娘姓名",
    "新娘電話",
    "提交時間",
  ];

  labels.reduce((previousIndex, label) => {
    const nextIndex = cardMapping.indexOf(`['${label}'`);
    assert.ok(nextIndex > previousIndex, `${label} 應依指定順序顯示`);
    return nextIndex;
  }, -1);

  assert.doesNotMatch(cardMapping, /主要聯絡人/);
  assert.doesNotMatch(cardMapping, /預計桌數|確認桌數/);
  assert.match(cardMapping, /\['桌數', String\(caseData\.estimatedTables \|\| ''\), 'number'\]/);
  assert.doesNotMatch(serverSource, /confirmedTables|A1:U1|A2:U|P\d+:U/);
  assert.match(serverSource, /estimatedTables: cleanText_\(row\[FOLLOWUP_COLUMNS_\.estimatedTables\]\)/);
});

test("MANAGER listCases 可查看全部案件", () => {
  const rows = [
    makeRow(),
    makeRow({ 0: "115DX2032", 2: "another-key", 13: "AP", 14: "April" }),
  ];
  const { context } = createRuntime({ email: "april@company.example", rows });
  assert.deepEqual(
    Array.from(context.listCases("")).map((item) => item.serialNumber),
    ["115DX2032", "115DX2031"],
  );
});

test("SALES listCases 與搜尋只回傳自己的案件", () => {
  const rows = [
    makeRow(),
    makeRow({
      0: "115DX2032",
      2: "another-key",
      3: "其他業務新郎",
      4: "0988-888-888",
      13: "AP",
      14: "April",
    }),
  ];
  const { context } = createRuntime({ rows });
  assert.deepEqual(Array.from(context.listCases("")).map((item) => item.serialNumber), ["115DX2031"]);
  assert.equal(context.listCases("其他業務新郎").length, 0);
  assert.equal(context.listCases("0988888888").length, 0);
  assert.equal(context.listCases("115DX2032").length, 0);
});

test("SALES getCase 只能讀取自己案件", () => {
  const rows = [
    makeRow(),
    makeRow({ 0: "115DX2032", 2: "another-key", 13: "AP", 14: "April" }),
  ];
  const { context } = createRuntime({ rows });
  assert.equal(context.getCase("115DX2031").serialNumber, "115DX2031");
  assert.throws(() => context.getCase("115DX2032"), /FORBIDDEN/);
});

test("業務資料啟用 FALSE、Email 不存在、role 空白或非法時全部拒絕", () => {
  const cases = [
    { salesRows: [makeSalesRow({ 4: "FALSE" })] },
    { salesRows: [makeSalesRow({ 2: "someone@company.example" })] },
    { salesRows: [makeSalesRow({ 5: "" })] },
    { salesRows: [makeSalesRow({ 5: "ADMIN" })] },
  ];
  for (const options of cases) {
    const { context } = createRuntime(options);
    assert.throws(() => context.listCases(""), /UNAUTHORIZED/);
  }
});

test("業務 Email 或 salesCode 重複時 fail closed", () => {
  const duplicateEmail = createRuntime({
    salesRows: [makeSalesRow(), makeSalesRow({ 0: "J2" })],
  });
  assert.throws(() => duplicateEmail.context.listCases(""), /DATA_INTEGRITY_ERROR/);

  const duplicateCode = createRuntime({
    salesRows: [makeSalesRow(), makeSalesRow({ 2: "other@company.example" })],
  });
  assert.throws(() => duplicateCode.context.listCases(""), /DATA_INTEGRITY_ERROR/);
});

test("SALES 不得讀取 N 空白案件，MANAGER 仍可讀取", () => {
  const rows = [makeRow({ 13: "", 14: "" })];
  const sales = createRuntime({ rows });
  assert.equal(sales.context.listCases("").length, 0);
  assert.throws(() => sales.context.getCase("115DX2031"), /FORBIDDEN/);

  const manager = createRuntime({ email: "april@company.example", rows });
  assert.equal(manager.context.getCase("115DX2031").serialNumber, "115DX2031");
});

test("正式授權不再依賴 FOLLOWUP_ALLOWED_EMAILS 或前端 email", () => {
  assert.doesNotMatch(serverSource, /FOLLOWUP_ALLOWED_EMAILS|allowedEmails|parseAllowedEmails_/);
  assert.doesNotMatch(clientHtml, /salesCode\s*:|email\s*:/);
  assert.match(serverSource, /Session\.getActiveUser\(\)\.getEmail\(\)/);
  assert.match(serverSource, /FOLLOWUP_SALES_SHEET_NAME_ = '業務資料'/);
});

test("Client 將 FORBIDDEN 與 UNAUTHORIZED 轉為一般訊息", () => {
  assert.match(clientHtml, /您沒有權限查看或修改此案件。/);
  assert.match(clientHtml, /您目前使用的 Google 帳號沒有 Follow-up 系統存取權限。/);
  assert.match(clientHtml, /code\.includes\('FORBIDDEN'\)/);
  assert.match(clientHtml, /code\.includes\('UNAUTHORIZED'\)/);
});
