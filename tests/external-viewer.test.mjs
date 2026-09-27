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
const WEB_APP_URL = 'https://script.google.com/macros/s/test-deployment/exec';
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
      EXTERNAL_VIEWER_WEB_APP_URL: WEB_APP_URL,
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
    lastLoginUpdateFails: options.lastLoginUpdateFails ?? false,
    uuid: 0,
    locks: 0,
    logs: [],
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
    console: {
      log(message) { state.logs.push(String(message)); },
      warn() {},
      error(message) { state.logs.push(String(message)); },
    },
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
    ScriptApp: {
      getService: () => ({
        getUrl() { throw new Error('ScriptApp.getService().getUrl() must not be used'); },
      }),
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => state.activeEmail }),
      getEffectiveUser: () => ({ getEmail: () => state.effectiveEmail }),
    },
    Utilities: {
      Charset: { UTF_8: 'UTF_8' },
      getUuid() { state.uuid += 1; return `00000000-0000-4000-8000-${String(state.uuid).padStart(12, '0')}`; },
      computeHmacSha256Signature(value, secret) {
        return Array.from(
          crypto.createHmac('sha256', secret).update(String(value)).digest(),
          byte => byte > 127 ? byte - 256 : byte,
        );
      },
      base64EncodeWebSafe(value) {
        return Buffer.from(typeof value === 'string' ? value : value).toString('base64url');
      },
      base64DecodeWebSafe(value) { return Array.from(Buffer.from(value, 'base64url')); },
      newBlob(bytes) {
        return {
          getDataAsString(...args) {
            assert.equal(args.length, 0, 'Blob.getDataAsString() must use its UTF-8 default');
            return Buffer.from(bytes).toString('utf8');
          },
        };
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
            if (state.lastLoginUpdateFails && /'外部檢視權限'!E\d+$/.test(range)) {
              throw new Error('simulated Sheets write failure');
            }
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
  return new URL(plainTextMagicUrl(runtime.state.sent[0])).searchParams.get('token');
}

function plainTextMagicUrl(message) {
  const match = message.body.match(/https:\/\/[^\s]+/);
  assert.ok(match, 'plain text magic URL should exist');
  return match[0];
}

function htmlMagicUrl(message) {
  const match = message.htmlBody.match(/href="([^"]+)"/);
  assert.ok(match, 'HTML magic href should exist');
  return match[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function appsScriptGetEvent(url) {
  const parsed = new URL(url);
  return { parameter: Object.fromEntries(parsed.searchParams.entries()) };
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
  assert.equal(runtime.state.sent[0].subject, 'Wedding-i Viewer 存取連結');
  assert.equal(runtime.state.sent[0].name, 'Wedding-i Viewer');
  assert.match(runtime.state.sent[0].body, /Wedding-i Viewer/);
  assert.match(runtime.state.sent[0].body, /案件檢視權限/);
  assert.match(runtime.state.sent[0].htmlBody, /進入 Wedding-i Viewer/);
  assert.doesNotMatch(runtime.state.sent[0].body, /Wedding Chapter|\bWC\b/);
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
  assert.match(token, /^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
  assert.equal(runtime.api.inspectMagicLink_(token).email, 'viewer@example.com');
});

test('TOKEN：createSignedToken / parseSignedToken 共用 HEX HMAC 可 round-trip', () => {
  const runtime = createRuntime();
  const secret = 'round-trip-secret-with-at-least-32-characters';
  const payload = { purpose: 'direct-round-trip', value: '測試', count: 1 };
  const token = runtime.api.createSignedToken_(payload, secret);
  assert.match(token, /^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
  assert.deepEqual(
    JSON.parse(JSON.stringify(runtime.api.parseSignedToken_(token, secret, 'INVALID_SIGNATURE'))),
    payload,
  );
  assert.equal(runtime.api.bytesToHex_([-128, -1, 0, 1, 127]), '80ff00017f');
});

test('TOKEN：payload、signature 竄改與不同 secret 均拒絕', () => {
  const runtime = createRuntime();
  const secret = 'round-trip-secret-with-at-least-32-characters';
  const token = runtime.api.createSignedToken_({ purpose: 'tamper-test' }, secret);
  const [payload, signature] = token.split('.');
  const tamperedPayload = (payload.startsWith('A') ? 'B' : 'A') + payload.slice(1);
  const tamperedSignature = (signature.startsWith('a') ? 'b' : 'a') + signature.slice(1);
  assert.throws(
    () => runtime.api.parseSignedToken_(tamperedPayload + '.' + signature, secret, 'INVALID_SIGNATURE'),
    /INVALID_SIGNATURE/,
  );
  assert.throws(
    () => runtime.api.parseSignedToken_(payload + '.' + tamperedSignature, secret, 'INVALID_SIGNATURE'),
    /INVALID_SIGNATURE/,
  );
  assert.throws(
    () => runtime.api.parseSignedToken_(token, 'different-secret-with-at-least-32-characters', 'INVALID_SIGNATURE'),
    /INVALID_SIGNATURE/,
  );
});

test('TOKEN：Apps Script 手動診斷函式驗證 Magic 與 Session round-trip', () => {
  const runtime = createRuntime();
  assert.deepEqual({ ...runtime.api.debugTokenRoundTrip() }, {
    magicRoundTrip: 'PASS',
    sessionRoundTrip: 'PASS',
  });
  assert.ok(runtime.state.logs.includes('Magic create: OK'));
  assert.ok(runtime.state.logs.includes('Magic verify: OK'));
  assert.ok(runtime.state.logs.includes('Session create: OK'));
  assert.ok(runtime.state.logs.includes('Session verify: OK'));
  assert.ok(runtime.state.logs.includes('Magic round-trip: PASS'));
  assert.ok(runtime.state.logs.includes('Session round-trip: PASS'));
  assert.doesNotMatch(runtime.state.logs.join('\n'), /magic-secret-with|session-secret-with|eyJ/);
});

test('MAGIC URL：正式 /exec URL 與 token encode/decode round-trip', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  const url = runtime.api.createMagicLinkUrl_(token);
  assert.equal(url.startsWith(WEB_APP_URL + '?action=magic&token='), true);
  assert.equal(new URL(url).pathname.endsWith('/exec'), true);
  assert.equal(new URL(url).searchParams.get('token'), token);
  assert.equal(decodeURIComponent(encodeURIComponent(token)), token);
  assert.match(token, /^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
});

test('MAGIC URL：email HTML href round-trip 後仍可驗證', () => {
  const runtime = createRuntime();
  runtime.api.requestViewerMagicLink('viewer@example.com');
  const event = appsScriptGetEvent(htmlMagicUrl(runtime.state.sent[0]));
  runtime.api.doGet(event);
  assert.equal(runtime.state.template.bootMode, 'MAGIC_CONFIRM');
  assert.equal(runtime.api.inspectMagicLink_(event.parameter.token).email, 'viewer@example.com');
});

test('MAGIC URL：plain text URL round-trip 後仍可驗證', () => {
  const runtime = createRuntime();
  runtime.api.requestViewerMagicLink('viewer@example.com');
  const event = appsScriptGetEvent(plainTextMagicUrl(runtime.state.sent[0]));
  runtime.api.doGet(event);
  assert.equal(runtime.state.template.bootMode, 'MAGIC_CONFIRM');
  assert.equal(runtime.api.inspectMagicLink_(event.parameter.token).email, 'viewer@example.com');
});

test('MAGIC URL：缺少正式 /exec 設定時拒絕寄信，且不使用 getUrl()', () => {
  const runtime = createRuntime({ properties: { EXTERNAL_VIEWER_WEB_APP_URL: '' } });
  assert.throws(() => runtime.api.requestViewerMagicLink('viewer@example.com'), /DATA_CONFIGURATION_ERROR/);
  assert.equal(runtime.state.sent.length, 0);
  assert.match(runtime.state.logs.at(-1), /MAGIC_LINK_CONFIGURATION_ERROR/);
});

test('MAGIC URL：拒絕 /dev、query string 與非 Google Apps Script URL', () => {
  for (const value of [
    'https://script.google.com/macros/s/test-deployment/dev',
    WEB_APP_URL + '?source=test',
    'https://example.com/macros/s/test-deployment/exec',
  ]) {
    const runtime = createRuntime({ properties: { EXTERNAL_VIEWER_WEB_APP_URL: value } });
    assert.throws(() => runtime.api.requestViewerMagicLink('viewer@example.com'), /DATA_CONFIGURATION_ERROR/);
  }
});

test('MAGIC 7：token 被修改會拒絕', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  assert.throws(() => runtime.api.redeemViewerMagicLink(tampered), /INVALID_MAGIC_LINK/);
  assert.match(runtime.state.logs.at(-1), /MAGIC_LINK_INVALID_SIGNATURE/);
  assert.doesNotMatch(runtime.state.logs.at(-1), new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('MAGIC 8：15 分鐘過期後拒絕', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  runtime.state.now += 15 * 60 * 1000 + 1000;
  assert.throws(() => runtime.api.redeemViewerMagicLink(token), /INVALID_MAGIC_LINK/);
  assert.match(runtime.state.logs.at(-1), /MAGIC_LINK_EXPIRED/);
});

test('MAGIC：15 分鐘有效期內可正常顯示確認頁', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  runtime.state.now += 15 * 60 * 1000 - 1000;
  runtime.api.doGet({ parameter: { action: 'magic', token } });
  assert.equal(runtime.state.template.bootMode, 'MAGIC_CONFIRM');
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
  assert.match(result.sessionToken, /^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
  assert.equal(result.email, 'viewer@example.com');
  assert.ok(runtime.state.updates.some(item => item.range === "'外部檢視權限'!E2"));
});

test('MAGIC：最後登入時間寫入失敗不會吃掉已成功建立的 session', () => {
  const runtime = createRuntime({ lastLoginUpdateFails: true });
  const result = runtime.api.redeemViewerMagicLink(sentMagicToken(runtime));
  assert.match(result.sessionToken, /^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
  assert.deepEqual({ ...runtime.api.resumeViewerSession(result.sessionToken) }, {
    email: 'viewer@example.com', name: '測試檢視者',
  });
  assert.match(runtime.state.logs.at(-1), /viewer-last-login-update/);
  assert.doesNotMatch(runtime.state.logs.at(-1), /simulated Sheets write failure/);
});

test('MAGIC 11：相同 token 第二次核銷拒絕', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  runtime.api.redeemViewerMagicLink(token);
  assert.throws(() => runtime.api.redeemViewerMagicLink(token), /INVALID_MAGIC_LINK/);
  assert.match(runtime.state.logs.at(-1), /MAGIC_LINK_ALREADY_USED/);
});

test('MAGIC：Email 改為 SUSPENDED 後既有 token 不可 GET 或核銷', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  runtime.state.accessRows[0][2] = 'SUSPENDED';
  runtime.api.doGet({ parameter: { action: 'magic', token } });
  assert.equal(runtime.state.template.bootMode, 'MAGIC_INVALID');
  assert.match(runtime.state.logs.at(-1), /MAGIC_LINK_EMAIL_NOT_APPROVED/);
  assert.throws(() => runtime.api.redeemViewerMagicLink(token), /INVALID_MAGIC_LINK/);
});

test('MAGIC：Email 從 Allowlist 刪除後既有 token 不可使用', () => {
  const runtime = createRuntime();
  const token = sentMagicToken(runtime);
  runtime.state.accessRows = runtime.state.accessRows.filter(row => row[0] !== 'viewer@example.com');
  assert.throws(() => runtime.api.redeemViewerMagicLink(token), /INVALID_MAGIC_LINK/);
  assert.match(runtime.state.logs.at(-1), /MAGIC_LINK_EMAIL_NOT_APPROVED/);
});

test('MAGIC：Allowlist schema 或重複資料錯誤會 fail closed 並安全記錄', () => {
  const runtime = createRuntime({ accessRows: [
    ['viewer@example.com', 'A', 'APPROVED', '', '', ''],
    ['viewer@example.com', 'B', 'APPROVED', '', '', ''],
  ] });
  const token = runtime.api.createMagicToken_('viewer@example.com');
  runtime.api.doGet({ parameter: { action: 'magic', token } });
  assert.equal(runtime.state.template.bootMode, 'MAGIC_INVALID');
  assert.match(runtime.state.logs.at(-1), /MAGIC_LINK_ALLOWLIST_ERROR/);
  assert.doesNotMatch(runtime.state.logs.at(-1), /viewer@example\.com|viewer-spreadsheet/);
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

test('SESSION：Client 將 session 存入 localStorage，重新整理後 resume', () => {
  assert.match(clientHtml, /window\.localStorage\.setItem\(STORAGE_KEY, sessionToken\)/);
  assert.match(clientHtml, /var stored = getStoredSession_\(\)/);
  assert.match(clientHtml, /if \(stored\) resumeSession_\(stored\)/);
  assert.match(clientHtml, /\.resumeViewerSession\(token\)/);
});

test('SESSION 15：session 被修改拒絕', () => {
  const runtime = createRuntime();
  const token = approvedSession(runtime);
  assert.throws(() => runtime.api.resumeViewerSession(token + 'x'), /UNAUTHORIZED/);
});

test('SESSION 16：session technical expiry 為 360 天且過期後拒絕', () => {
  const runtime = createRuntime();
  const token = approvedSession(runtime);
  runtime.state.now += 360 * 24 * 60 * 60 * 1000 + 1000;
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

test('UI 44：浮水印維持原案並取自 Server verified identity', () => {
  assert.match(clientHtml, /renderWatermark_\(identity\.email\)/);
  assert.match(clientHtml, /Intl\.DateTimeFormat/);
  assert.match(clientHtml, /index < 16/);
  assert.match(clientHtml, /item\.textContent = '授權檢視\\n' \+ verifiedEmail \+ '\\n' \+ date/);
  assert.doesNotMatch(clientHtml, /renderWatermark_\(elements\.viewerEmail/);
});

test('UI：detail loading 不隱藏既有內容，也不使用大型固定高度 placeholder', () => {
  const openCaseSource = clientHtml.match(/function openCase_\([\s\S]+?function renderCaseDetail_/)[0];
  assert.match(indexHtml, /id="detailLoading"[^>]*hidden>載入中…<\/p>/);
  assert.match(openCaseSource, /elements\.detailLoading\.hidden = false/);
  assert.doesNotMatch(openCaseSource, /detailContent\.hidden = true|載入案件中/);
  assert.doesNotMatch(stylesHtml, /detail-placeholder[^\n{}]*\{[^}]*min-height/);
  assert.match(stylesHtml, /\.detail-loading \{ position: absolute/);
});

test('UI：唯讀 badge 與整頁浮水印維持原案', () => {
  assert.match(indexHtml, /<span class="readonly-badge">唯讀<\/span>/);
  assert.match(stylesHtml, /\.readonly-badge/);
  assert.match(stylesHtml, /\.watermark \{ position: fixed;[^}]*opacity: \.055;/);
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

test('UI 47：品牌統一且沒有 WC 或 logo 圖示', () => {
  assert.match(indexHtml, /Wedding-i Viewer/);
  assert.match(indexHtml, /外部唯讀檢視/);
  assert.match(indexHtml, /案件檢視登入/);
  assert.match(indexHtml, /請輸入已獲核准的 Email，我們會寄送登入連結給您。/);
  assert.doesNotMatch(indexHtml, /Wedding Chapter|>\s*WC\s*<|brand-mark|placeholder-icon|viewer-logo/i);
  assert.doesNotMatch(stylesHtml, /brand-mark|placeholder-icon|viewer-logo/i);
});

test('manifest 使用正式匿名入口與最小必要 scope', () => {
  assert.deepEqual(manifest.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  assert.deepEqual(manifest.oauthScopes.sort(), [
    'https://www.googleapis.com/auth/script.send_mail',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email',
  ]);
});

test('Magic Link 使用固定正式 /exec Script Property，不依賴 getUrl()', () => {
  assert.match(serverSource, /EXTERNAL_VIEWER_WEB_APP_URL/);
  assert.match(serverSource, /requireWebAppUrl_\(\)/);
  assert.doesNotMatch(serverSource, /ScriptApp\.getService\(\)\.getUrl\(\)/);
});

test('Magic Link Server log 只記錄安全 context 與錯誤代碼', () => {
  assert.match(serverSource, /context: cleanText_\(context\)/);
  assert.match(serverSource, /code: safeExternalViewerErrorCode_\(error\)/);
  assert.doesNotMatch(serverSource, /console\.error\([^\n]*(?:token|secret|spreadsheetId|sessionToken)/i);
});

test('獨立 Viewer Client 只呼叫 External Viewer API', () => {
  for (const api of ['requestViewerMagicLink', 'redeemViewerMagicLink', 'resumeViewerSession',
    'viewerListCases', 'viewerGetCase']) assert.match(clientHtml, new RegExp(`\\.${api}\\(`));
  assert.doesNotMatch(clientHtml, /\.listCases\(|\.getCase\(|\.updateCase\(|\.addCollaborationNote\(/);
});
