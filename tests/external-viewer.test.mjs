import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const serverSource = read('google-apps-script/external-viewer/Code.gs');
const indexHtml = read('google-apps-script/external-viewer/Index.html');
const clientHtml = read('google-apps-script/external-viewer/Client.html');
const stylesHtml = read('google-apps-script/external-viewer/Styles.html');
const manifest = JSON.parse(read('google-apps-script/external-viewer/appsscript.json'));

const ACCESS_HEADERS = ['Email', '姓名', '狀態', '建立時間', '最後登入時間', '備註'];
const CASE_HEADERS = [
  '正式流水號', '提交時間', '防重複識別碼', '新郎姓名', '新郎電話', '新娘姓名', '新娘電話',
  '主要聯絡人姓名', '主要聯絡人電話', '婚宴日期', '日期未定', '婚宴時段', '預計桌數',
  '業務代碼', '業務姓名', '第一次洽談', '第二次洽談', '第三次洽談', '狀態', '結案日期',
];

function caseRow(overrides = {}) {
  const row = [
    '115DX2031', '2026/09/26 10:00:00', 'private-duplicate-key', '王大明', '0911-111-111',
    '林小美', '0922-222-222', '林小美', '0922-222-222', '2027/03/20', 'FALSE', '晚宴',
    '20', 'SEAN', 'Sean', '第一次完整洽談', '第二次完整洽談', '第三次完整洽談', '已訂', '2026/09/30',
  ];
  Object.entries(overrides).forEach(([key, value]) => { row[Number(key)] = value; });
  return row;
}

function createRuntime(options = {}) {
  const state = {
    now: options.now ?? Date.parse('2026-09-26T12:00:00.000Z'),
    properties: {
      EXTERNAL_VIEWER_SPREADSHEET_ID: 'viewer-spreadsheet',
      EXTERNAL_VIEWER_MAGIC_SECRET: 'magic-secret-with-at-least-32-characters-12345',
      EXTERNAL_VIEWER_SESSION_SECRET: 'session-secret-with-at-least-32-characters-123',
      ...(options.properties || {}),
    },
    accessRows: options.accessRows ?? [
      ['viewer@example.com', '測試檢視者', 'APPROVED', '2026/09/26', '', ''],
      ['suspended@example.com', '停權人員', 'SUSPENDED', '2026/09/26', '', ''],
    ],
    cases: options.cases ?? [
      caseRow(),
      caseRow({ 0: '115DX2032', 2: 'other-key', 3: '陳志明', 5: '周雅婷', 10: 'TRUE',
        13: 'APRIL', 14: 'April', 15: '', 16: '', 17: '', 18: '洽談中', 19: '' }),
    ],
    cache: new Map(),
    sent: [],
    updates: [],
    batchUpdates: [],
    sheetReads: [],
    sheetExists: options.sheetExists ?? true,
    activeEmail: options.activeEmail ?? '',
    effectiveEmail: options.effectiveEmail ?? 'deployer@denwell.com',
    quota: options.quota ?? 100,
    uuid: 0,
    locks: 0,
    template: null,
  };

  class MockDate extends Date {
    constructor(...args) { super(args.length ? args[0] : state.now); }
    static now() { return state.now; }
  }

  const scriptProperties = {
    getProperty(key) { return Object.prototype.hasOwnProperty.call(state.properties, key) ? state.properties[key] : null; },
    setProperty(key, value) { state.properties[key] = String(value); return this; },
    deleteProperty(key) { delete state.properties[key]; return this; },
    getProperties() { return { ...state.properties }; },
  };

  function valuesFor(range) {
    state.sheetReads.push(range);
    if (range === "'外部檢視權限'!A1:F") return [ACCESS_HEADERS, ...state.accessRows];
    if (range === "'新人資料'!A1:T1") return [CASE_HEADERS];
    if (range === "'新人資料'!A2:O") return state.cases.map(row => row.slice(0, 15));
    if (range === "'新人資料'!A2:T") return state.cases.map(row => row.slice(0, 20));
    throw new Error(`Unexpected range ${range}`);
  }

  const context = vm.createContext({
    console: { warn() {}, error() {} },
    Date: MockDate,
    JSON, Math, Number, Object, Array, String, Boolean, RegExp,
    encodeURIComponent, decodeURIComponent,
    PropertiesService: { getScriptProperties: () => scriptProperties },
    CacheService: {
      getScriptCache() {
        return {
          get(key) {
            const item = state.cache.get(key);
            if (!item || item.expiresAt <= state.now) { state.cache.delete(key); return null; }
            return item.value;
          },
          put(key, value, seconds) {
            state.cache.set(key, { value: String(value), expiresAt: state.now + seconds * 1000 });
          },
        };
      },
    },
    LockService: {
      getScriptLock() {
        return {
          waitLock() { state.locks += 1; },
          releaseLock() { state.locks -= 1; },
        };
      },
    },
    MailApp: {
      getRemainingDailyQuota: () => state.quota,
      sendEmail(message) { state.sent.push(message); },
    },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/test/exec' }) },
    Session: {
      getActiveUser: () => ({ getEmail: () => state.activeEmail }),
      getEffectiveUser: () => ({ getEmail: () => state.effectiveEmail }),
    },
    Utilities: {
      Charset: { UTF_8: 'UTF_8' },
      getUuid() { state.uuid += 1; return `00000000-0000-4000-8000-${String(state.uuid).padStart(12, '0')}`; },
      computeHmacSha256Signature(value, secret) {
        return Array.from(crypto.createHmac('sha256', secret).update(String(value)).digest());
      },
      base64EncodeWebSafe(value) {
        return Buffer.from(typeof value === 'string' ? value : value).toString('base64url');
      },
      base64DecodeWebSafe(value) { return Array.from(Buffer.from(value, 'base64url')); },
      newBlob(bytes) {
        return { getDataAsString: () => Buffer.from(bytes).toString('utf8') };
      },
    },
    HtmlService: {
      createTemplateFromFile() {
        const template = {
          evaluate() {
            return {
              setTitle() { return this; },
              addMetaTag() { return this; },
            };
          },
        };
        state.template = template;
        return template;
      },
      createHtmlOutputFromFile: () => ({ getContent: () => '' }),
    },
    Sheets: {
      Spreadsheets: {
        get() {
          return { sheets: state.sheetExists ? [{ properties: { sheetId: 88, title: '外部檢視權限' } }] : [] };
        },
        batchUpdate(resource) {
          state.batchUpdates.push(resource);
          if (resource.requests?.[0]?.addSheet) {
            state.sheetExists = true;
            return { replies: [{ addSheet: { properties: { sheetId: 99, title: '外部檢視權限' } } }] };
          }
          return { replies: [] };
        },
        Values: {
          batchGet(spreadsheetId, request) {
            assert.equal(spreadsheetId, 'viewer-spreadsheet');
            return { valueRanges: request.ranges.map(range => ({ range, values: valuesFor(range) })) };
          },
          update(resource, spreadsheetId, range) {
            assert.equal(spreadsheetId, 'viewer-spreadsheet');
            state.updates.push({ resource, range });
            const match = range.match(/'外部檢視權限'!E(\d+)$/);
            if (match) state.accessRows[Number(match[1]) - 2][4] = resource.values[0][0];
            return {};
          },
        },
      },
    },
  });

  vm.runInContext(serverSource, context, { filename: 'ExternalViewerCode.gs' });
  return { api: context, state };
}

function sentMagicToken(runtime) {
  runtime.api.requestViewerMagicLink('viewer@example.com');
  const body = runtime.state.sent[0].body;
  const match = body.match(/[?&]token=([^\s]+)/);
  assert.ok(match, 'magic token should exist in mail body');
  return decodeURIComponent(match[1]);
}

function approvedSession(runtime) {
  return runtime.api.redeemViewerMagicLink(sentMagicToken(runtime)).sessionToken;
}

// AUTH
test('AUTH 1：不在 Allowlist 不寄 Magic Link', () => {
  const runtime = createRuntime();
  assert.throws(() => runtime.api.requestViewerMagicLink('missing@example.com'), /ACCESS_UNAVAILABLE/);
  assert.equal(runtime.state.sent.length, 0);
});

test('AUTH 2：SUSPENDED 不寄 Magic Link', () => {
  const runtime = createRuntime();
  assert.throws(() => runtime.api.requestViewerMagicLink('suspended@example.com'), /ACCESS_UNAVAILABLE/);
  assert.equal(runtime.state.sent.length, 0);
});

test('AUTH 3：APPROVED 可寄 Magic Link', () => {
  const runtime = createRuntime();
  assert.deepEqual({ ...runtime.api.requestViewerMagicLink('viewer@example.com') }, { sent: true });
  assert.equal(runtime.state.sent.length, 1);
  assert.match(runtime.state.sent[0].subject, /案件檢視登入/);
  assert.doesNotMatch(runtime.state.sent[0].body, /王大明|林小美|洽談/);
});

test('AUTH 4：輸入 Email 會 trim 與 lowercase', () => {
  const runtime = createRuntime();
  runtime.api.requestViewerMagicLink('  VIEWER@EXAMPLE.COM  ');
  assert.equal(runtime.state.sent[0].to, 'viewer@example.com');
});

test('AUTH 5：normalized duplicate Email fail closed', () => {
  const runtime = createRuntime({ accessRows: [
    ['viewer@example.com', 'A', 'APPROVED', '', '', ''],
    [' VIEWER@example.com ', 'B', 'APPROVED', '', '', ''],
  ] });
  assert.throws(() => runtime.api.requestViewerMagicLink('viewer@example.com'), /DATA_INTEGRITY_ERROR/);
  assert.equal(runtime.state.sent.length, 0);
});

// MAGIC LINK
test('MAGIC 6：Magic Link 使用 HMAC 簽章且可驗證', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(runtime.api.inspectMagicLink_(token).email, 'viewer@example.com');
});

test('MAGIC 7：token 被修改會拒絕', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
  assert.throws(() => runtime.api.redeemViewerMagicLink(tampered), /INVALID_MAGIC_LINK/);
});

test('MAGIC 8：15 分鐘過期後拒絕', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  runtime.state.now += 15 * 60 * 1000 + 1000;
  assert.throws(() => runtime.api.redeemViewerMagicLink(token), /INVALID_MAGIC_LINK/);
});

test('MAGIC 9：第一次 GET 只顯示確認頁、不核銷', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  runtime.api.doGet({ parameter: { action: 'magic', token } });
  assert.equal(runtime.state.template.bootMode, 'MAGIC_CONFIRM');
  assert.equal(runtime.state.template.viewerEmail, 'viewer@example.com');
  assert.equal(Object.keys(runtime.state.properties).some(key => key.startsWith('EXTERNAL_VIEWER_MAGIC_USED_')), false);
});

test('MAGIC 10：按繼續登入時才核銷並建立 session', () => {
  const runtime = createRuntime();
  const result = runtime.api.redeemViewerMagicLink(sentMagicToken(runtime));
  assert.match(result.sessionToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(result.email, 'viewer@example.com');
  assert.ok(runtime.state.updates.some(item => item.range === "'外部檢視權限'!E2"));
});

test('MAGIC 11：相同 token 第二次核銷拒絕', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  runtime.api.redeemViewerMagicLink(token);
  assert.throws(() => runtime.api.redeemViewerMagicLink(token), /INVALID_MAGIC_LINK/);
});

// RATE LIMIT
test('RATE 12：同 Email 60 秒內重複寄送拒絕', () => {
  const runtime = createRuntime();
  runtime.api.requestViewerMagicLink('viewer@example.com');
  assert.throws(() => runtime.api.requestViewerMagicLink('viewer@example.com'), /RATE_LIMITED/);
});

test('RATE 13：同 Email 每小時最多五次', () => {
  const runtime = createRuntime();
  for (let index = 0; index < 5; index += 1) {
    runtime.api.requestViewerMagicLink('viewer@example.com');
    runtime.state.now += 61 * 1000;
  }
  assert.throws(() => runtime.api.requestViewerMagicLink('viewer@example.com'), /RATE_LIMITED/);
  assert.equal(runtime.state.sent.length, 5);
});

// SESSION
test('SESSION 14：有效 session 可恢復身分', () => {
  const runtime = createRuntime();
  const identity = runtime.api.resumeViewerSession(approvedSession(runtime));
  assert.deepEqual({ ...identity }, { email: 'viewer@example.com', name: '測試檢視者' });
});

test('SESSION 15：session 被修改拒絕', () => {
  const runtime = createRuntime();
  const token = approvedSession(runtime);
  assert.throws(() => runtime.api.resumeViewerSession(token + 'x'), /UNAUTHORIZED/);
});

test('SESSION 16：session technical expiry 為 90 天且過期後拒絕', () => {
  const runtime = createRuntime();
  const token = approvedSession(runtime);
  runtime.state.now += 90 * 24 * 60 * 60 * 1000 + 1000;
  assert.throws(() => runtime.api.resumeViewerSession(token), /SESSION_EXPIRED/);
});

test('SESSION 17：APPROVED session 可讀案件', () => {
  const runtime = createRuntime();
  assert.equal(runtime.api.viewerListCases(approvedSession(runtime), '', '').length, 2);
});

test('SESSION 18：改為 SUSPENDED 後原 session 下一個 API 立即拒絕', () => {
  const runtime = createRuntime();
  const token = approvedSession(runtime);
  runtime.state.accessRows[0][2] = 'SUSPENDED';
  assert.throws(() => runtime.api.viewerListCases(token, '', ''), /FORBIDDEN/);
  assert.throws(() => runtime.api.viewerGetCase(token, '115DX2031'), /FORBIDDEN/);
});

// LIST
test('LIST 19：未登入 viewerListCases 拒絕且不讀案件表', () => {
  const runtime = createRuntime();
  assert.throws(() => runtime.api.viewerListCases('', '', ''), /UNAUTHORIZED/);
  assert.equal(runtime.state.sheetReads.some(range => range.includes('新人資料')), false);
});

test('LIST 20–22：摘要不洩漏電話、洽談、token 或權限欄位', () => {
  const runtime = createRuntime();
  const summary = runtime.api.viewerListCases(approvedSession(runtime), '', '')[0];
  assert.deepEqual(Object.keys(summary).sort(), [
    'banquetSession', 'brideName', 'dateUndecided', 'estimatedTables', 'groomName',
    'salesCode', 'salesName', 'serialNumber', 'weddingDate',
  ]);
  assert.equal(Object.keys(summary).some(key => /phone|consultation|token|editable|role/i.test(key)), false);
});

test('LIST 23：query 只搜尋訪客編號、新郎與新娘', () => {
  const runtime = createRuntime();
  const token = approvedSession(runtime);
  assert.equal(runtime.api.viewerListCases(token, '115DX2032', '')[0].serialNumber, '115DX2032');
  assert.equal(runtime.api.viewerListCases(token, '王大明', '')[0].serialNumber, '115DX2031');
  assert.equal(runtime.api.viewerListCases(token, '周雅婷', '')[0].serialNumber, '115DX2032');
  assert.equal(runtime.api.viewerListCases(token, '0922222222', '').length, 0);
});

test('LIST 24：sales filter 僅接受案件中存在的代碼', () => {
  const runtime = createRuntime();
  const token = approvedSession(runtime);
  const filtered = runtime.api.viewerListCases(token, '', 'april');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].salesName, 'April');
  assert.throws(() => runtime.api.viewerListCases(token, '', 'FORGED'), /VALIDATION_ERROR/);
});

// DETAIL
test('DETAIL 25–34：詳細資料精確白名單且包含主要聯絡人與完整三次洽談', () => {
  const runtime = createRuntime();
  const detail = runtime.api.viewerGetCase(approvedSession(runtime), '115DX2031');
  assert.deepEqual(Object.keys(detail).sort(), [
    'banquetSession', 'brideName', 'dateUndecided', 'estimatedTables', 'firstConsultation',
    'groomName', 'primaryContactName', 'primaryContactPhone', 'salesCode', 'salesName',
    'secondConsultation', 'serialNumber', 'submittedAt', 'thirdConsultation', 'weddingDate',
  ]);
  assert.equal(detail.primaryContactName, '林小美');
  assert.equal(detail.primaryContactPhone, '0922-222-222');
  assert.equal(detail.firstConsultation, '第一次完整洽談');
  assert.equal(detail.secondConsultation, '第二次完整洽談');
  assert.equal(detail.thirdConsultation, '第三次完整洽談');
  for (const forbidden of ['groomPhone', 'bridePhone', 'status', 'closedDate', 'collaborationNotes',
    'revisionToken', 'identityToken', 'duplicateKey', 'editable', 'role', 'rowNumber']) {
    assert.equal(Object.prototype.hasOwnProperty.call(detail, forbidden), false, forbidden);
  }
});

// WRITE / SETUP
test('WRITE 35–37：External Viewer 不存在任何案件 write API', () => {
  const runtime = createRuntime();
  assert.equal(typeof runtime.api.updateCase, 'undefined');
  assert.equal(typeof runtime.api.addCollaborationNote, 'undefined');
  assert.equal(typeof runtime.api.setupCollaborationNotes, 'undefined');
  assert.doesNotMatch(serverSource, /function\s+(?:updateCase|addCollaborationNote|setupCollaborationNotes)\s*\(/);
});

test('SETUP：匿名 Web App 無法執行 setupExternalViewer', () => {
  const runtime = createRuntime({ activeEmail: '' });
  assert.throws(() => runtime.api.setupExternalViewer(), /FORBIDDEN/);
  assert.equal(runtime.state.batchUpdates.length, 0);
});

test('SETUP：管理員手動執行時既有 Sheet 只驗證、不覆寫', () => {
  const runtime = createRuntime({ activeEmail: 'deployer@denwell.com' });
  assert.deepEqual({ ...runtime.api.setupExternalViewer() }, { created: false });
  assert.equal(runtime.state.updates.length, 0);
  assert.equal(runtime.state.batchUpdates.length, 0);
});

test('SETUP：不存在時建立固定 header 與 APPROVED／SUSPENDED validation', () => {
  const runtime = createRuntime({ activeEmail: 'deployer@denwell.com', sheetExists: false });
  assert.deepEqual({ ...runtime.api.setupExternalViewer() }, { created: true });
  assert.equal(runtime.state.updates[0].range, "'外部檢視權限'!A1:F1");
  assert.deepEqual([...runtime.state.updates[0].resource.values[0]], ACCESS_HEADERS);
  assert.match(JSON.stringify(runtime.state.batchUpdates), /ONE_OF_LIST/);
  assert.match(JSON.stringify(runtime.state.batchUpdates), /SUSPENDED/);
});

// UI 38–46
test('UI 38：未登入畫面不包含任何案件資料', () => {
  assert.match(indexHtml, /id="loginView"/);
  assert.match(indexHtml, /id="viewerApp"[^>]*hidden/);
  assert.doesNotMatch(indexHtml, /王大明|林小美|第一次完整洽談/);
});

test('UI 39：接待業務篩選存在且由案件摘要建立選項', () => {
  assert.match(indexHtml, /id="salesFilter"/);
  assert.match(clientHtml, /updateSalesOptions_\(cases\)/);
  assert.match(clientHtml, /item\.salesCode.*item\.salesName/);
});

test('UI 40–43：沒有狀態篩選、統計、儲存或協作備註輸入', () => {
  assert.doesNotMatch(indexHtml, /data-case-status|data-stat-status|saveCase|addCollaborationNote|noteComposer|status dropdown/i);
  assert.doesNotMatch(clientHtml, /\.updateCase\(|\.addCollaborationNote\(/);
});

test('UI 44：浮水印取自 Server verified identity', () => {
  assert.match(clientHtml, /renderWatermark_\(identity\.email\)/);
  assert.match(clientHtml, /授權檢視\\n/);
  assert.doesNotMatch(clientHtml, /renderWatermark_\(elements\.viewerEmail/);
});

test('UI 45：手機版提供列表進詳細及返回操作', () => {
  assert.match(stylesHtml, /@media \(max-width: 820px\)/);
  assert.match(stylesHtml, /mobile-detail-open \.case-sidebar/);
  assert.match(stylesHtml, /mobile-detail-open \.case-detail/);
  assert.match(clientHtml, /backToList/);
});

test('UI 46：桌機版為左側列表與右側詳細雙欄', () => {
  assert.match(stylesHtml, /grid-template-columns: minmax\(300px, 390px\) minmax\(0, 1fr\)/);
  assert.match(indexHtml, /class="case-sidebar"/);
  assert.match(indexHtml, /class="case-detail"/);
});

test('manifest 使用正式匿名入口與最小必要 scope', () => {
  assert.deepEqual(manifest.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  assert.deepEqual(manifest.oauthScopes.sort(), [
    'https://www.googleapis.com/auth/script.send_mail',
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
});

test('獨立 Viewer Client 只呼叫 External Viewer API', () => {
  for (const api of ['requestViewerMagicLink', 'redeemViewerMagicLink', 'resumeViewerSession',
    'viewerListCases', 'viewerGetCase']) assert.match(clientHtml, new RegExp(`\\.${api}\\(`));
  assert.doesNotMatch(clientHtml, /\.listCases\(|\.getCase\(|\.updateCase\(|\.addCollaborationNote\(/);
});
