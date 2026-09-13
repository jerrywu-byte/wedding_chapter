import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const gasSource = await readFile(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8');
const runnerSource = await readFile(new URL('../presentation/components/WeddingExperienceRunner.tsx', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../app/api/submissions/route.ts', import.meta.url), 'utf8');
let mobile;
let submission;
let bundleDirectory;

before(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), 'wedding-mobile-'));
  await Promise.all([
    build({
      entryPoints: [new URL('../lib/taiwanMobile.ts', import.meta.url).pathname],
      outfile: join(bundleDirectory, 'mobile.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
    }),
    build({
      entryPoints: [new URL('../lib/weddingChapterSubmission.ts', import.meta.url).pathname],
      outfile: join(bundleDirectory, 'submission.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
    }),
  ]);
  mobile = require(join(bundleDirectory, 'mobile.cjs'));
  submission = require(join(bundleDirectory, 'submission.cjs'));
});

after(async () => {
  if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
});

for (const value of ['0912345678', '0912-345-678', '0912 345 678', '0912 345-678', '0912／345／678', '  0912345678  ']) {
  test(`${JSON.stringify(value)} 正規化為正式手機格式`, () => {
    assert.equal(mobile.normalizeTaiwanMobile(value), '0912-345-678');
  });
}

for (const value of ['0812345678', '091234567', '09123456789', '0912ABC678', '+886912345678']) {
  test(`${JSON.stringify(value)} 拒絕為 VALIDATION_ERROR`, () => {
    assert.throws(() => mobile.normalizeTaiwanMobile(value), /^Error: VALIDATION_ERROR$/);
  });
}

function session(primaryContactType) {
  return {
    submissionClientId: 'browser-submission-id',
    profile: {
      banquetPlanner: 'Sean', groomName: '新郎', groomPhone: '0912345678',
      brideName: '新娘', bridePhone: '0922 222 222', primaryContactType,
      primaryContactName: '其他聯絡人', primaryContactPhone: '0933-333-333',
      weddingDate: null, weddingDateUndecided: true, mealPeriod: 'dinner',
      estimatedTables: 20, estimatedTableRangeId: '15-20',
    },
  };
}

const salesOptions = [{ value: 'SEAN', label: 'Sean', lineUrl: 'https://example.test/line' }];

test('新人送出資料的三個電話皆為正式格式', () => {
  const payload = submission.createWeddingChapterSubmission(session('other'), salesOptions);
  assert.equal(payload.partner1Phone, '0912-345-678');
  assert.equal(payload.partner2Phone, '0922-222-222');
  assert.equal(payload.emergencyContactPhone, '0933-333-333');
});

test('新郎為主要聯絡人時 I 與 E 的送出值完全一致', () => {
  const payload = submission.createWeddingChapterSubmission(session('groom'), salesOptions);
  assert.equal(payload.emergencyContactPhone, payload.partner1Phone);
  assert.equal(payload.emergencyContactName, payload.partner1Name);
});

test('新娘為主要聯絡人時 I 與 G 的送出值完全一致', () => {
  const payload = submission.createWeddingChapterSubmission(session('bride'), salesOptions);
  assert.equal(payload.emergencyContactPhone, payload.partner2Phone);
  assert.equal(payload.emergencyContactName, payload.partner2Name);
});

function createGasRuntime() {
  const state = { appended: [], locks: 0, flushes: 0, sequence: 2000 };
  const submissions = {
    getLastRow: () => 1,
    appendRow: row => state.appended.push(Array.from(row)),
  };
  const sales = {
    getLastRow: () => 2,
    getRange: () => ({ getValues: () => [['SEAN', 'Sean', '', '', true]] }),
  };
  const settings = {
    getLastRow: () => 2,
    getRange(row, column) {
      if (column === 1) return { getValues: () => [['LAST_SERIAL_SEQUENCE_115']] };
      return { getValue: () => state.sequence, setValue: value => { state.sequence = value; } };
    },
  };
  const spreadsheet = {
    getSheetByName(name) {
      return { '新人資料': submissions, '業務資料': sales, '系統設定': settings }[name] || null;
    },
  };
  const context = vm.createContext({
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'private-spreadsheet' }) },
    LockService: { getScriptLock: () => ({
      waitLock(timeout) { assert.equal(timeout, 30000); state.locks += 1; },
      releaseLock() { state.locks -= 1; },
    }) },
    SpreadsheetApp: { openById: () => spreadsheet, flush: () => { state.flushes += 1; } },
    Utilities: { formatDate: () => '2026' },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput(text) {
        return { text, setMimeType() { return this; } };
      },
    },
  });
  vm.runInContext(gasSource, context, { filename: 'google-apps-script/Code.gs' });
  return { context, state };
}

test('Browser 與 Apps Script 使用相同的正規化結果', () => {
  const { context } = createGasRuntime();
  for (const value of ['0912345678', '0912-345-678', '0912 345 678', '0912／345／678']) {
    assert.equal(context.normalizeTaiwanMobile_(value), mobile.normalizeTaiwanMobile(value));
  }
});

function gasPayload(overrides = {}) {
  return {
    submissionId: 'server-submission-id', partner1Name: '新郎', partner1Phone: '0912345678',
    partner2Name: '新娘', partner2Phone: '0922 222 222', emergencyContactName: '新郎',
    emergencyContactPhone: '0999-999-999', weddingDate: '', dateUndecided: true,
    banquetSession: '晚宴', estimatedTables: 20, salesCode: 'SEAN', ...overrides,
  };
}

test('Apps Script append 前再次正規化 E/G/I，主要聯絡人沿用對應電話', () => {
  const { context, state } = createGasRuntime();
  context.saveSubmission_(gasPayload());
  assert.equal(state.appended.length, 1);
  assert.equal(state.appended[0][4], '0912-345-678');
  assert.equal(state.appended[0][6], '0922-222-222');
  assert.equal(state.appended[0][8], state.appended[0][4]);
  assert.equal(state.locks, 0);
  assert.equal(state.flushes, 1);
});

test('新娘為主要聯絡人時 Apps Script 寫入 I 與 G 一致', () => {
  const { context, state } = createGasRuntime();
  context.saveSubmission_(gasPayload({ emergencyContactName: '新娘' }));
  assert.equal(state.appended[0][8], state.appended[0][6]);
});

for (const value of ['0812345678', '091234567', '09123456789', '0912ABC678', '+886912345678']) {
  test(`Apps Script 拒絕非法電話 ${JSON.stringify(value)} 且不 append`, () => {
    const { context, state } = createGasRuntime();
    assert.throws(() => context.saveSubmission_(gasPayload({ partner1Phone: value })), /^Error: VALIDATION_ERROR$/);
    assert.equal(state.appended.length, 0);
    assert.equal(state.locks, 0);
    assert.equal(state.sequence, 2000);
  });
}

test('新人電話欄位於 blur 與 submit 才驗證，並使用 numeric/tel/maxlength', () => {
  assert.match(runnerSource, /blur=\{\(\) => formatPhoneOnBlur\("groomPhone"\)\}/);
  assert.match(runnerSource, /blur=\{\(\) => formatPhoneOnBlur\("bridePhone"\)\}/);
  assert.match(runnerSource, /blur=\{\(\) => formatPhoneOnBlur\("primaryContactPhone"\)\}/);
  assert.match(runnerSource, /inputMode="numeric" autoComplete="tel" maxLength=\{16\}/);
  assert.match(runnerSource, /TAIWAN_MOBILE_INPUT_ERROR/);
  assert.doesNotMatch(runnerSource, /onChange=\{[^}]*normalizeTaiwanMobile/);
});

test('網站 Server route 在轉送 Apps Script 前再次正規化電話', () => {
  assert.match(apiSource, /payload = normalizeSubmissionPhones\(payload\)/);
  assert.match(apiSource, /status: "VALIDATION_ERROR"/);
  assert.match(apiSource, /normalizeTaiwanMobile\(payload\.partner1Phone\)/);
  assert.match(apiSource, /normalizeTaiwanMobile\(payload\.partner2Phone\)/);
  assert.match(apiSource, /normalizeTaiwanMobile\(payload\.emergencyContactPhone\)/);
});

test('Apps Script validation error 回傳安全狀態與正式提示', () => {
  const { context, state } = createGasRuntime();
  const response = context.doPost({ postData: { contents: JSON.stringify(gasPayload({ partner1Phone: '123' })) } });
  const result = JSON.parse(response.text);
  assert.equal(result.success, false);
  assert.equal(result.status, 'VALIDATION_ERROR');
  assert.equal(result.message, '請輸入正確的手機號碼，例如 0912-345-678');
  assert.equal(state.appended.length, 0);
});

test('未加入歷史資料批次覆寫或電話 write API', () => {
  assert.doesNotMatch(gasSource, /migrate.*phone|batch.*phone|update.*phone/i);
});
