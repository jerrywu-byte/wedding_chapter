import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

export const serverSource = fs.readFileSync(new URL('../../google-apps-script/followup-auth-test/Code.gs', import.meta.url), 'utf8');
export const noteHeaders = ['訪客編號', '建立時間', '留言業務代碼', '留言業務姓名', '備註內容'];
const headers = ['正式流水號', '提交時間', '防重複識別碼', '新郎姓名', '新郎電話', '新娘姓名', '新娘電話',
  '主要聯絡人姓名', '主要聯絡人電話', '婚宴日期', '日期未定', '婚宴時段', '預計桌數', '業務代碼', '業務姓名',
  '第一次洽談', '第二次洽談', '第三次洽談', '狀態', '結案日期'];
const salesHeaders = ['業務代碼', '業務姓名', '業務Email', 'LINE連結', '啟用', 'Follow-up角色'];

export function caseRow(serial = '115DX2031', owner = 'SEAN') {
  return [serial, '2026/09/01 10:00:00', 'private-' + serial, '新郎' + serial, '0911111111',
    '新娘' + serial, '0922222222', '聯絡人' + serial, '0933333333', '', 'TRUE', '晚', '20',
    owner, owner === 'SEAN' ? 'Sean' : 'Lisa', '原始洽談', '', '', '洽談中', ''];
}

export function createState(overrides = {}) {
  return {
    rows: [caseRow(), caseRow('115DX2032', 'LISA')], notes: [], noteHeaders: noteHeaders.slice(),
    notesExist: true, now: '2026-09-01T11:35:00.000Z',
    sales: [['SEAN', 'Sean', 'sean@company.example', '', 'TRUE', 'SALES'],
      ['LISA', 'Lisa', 'lisa@company.example', '', true, 'SALES'],
      ['APRIL', 'April', 'april@company.example', '', true, 'MANAGER']],
    reads: [], appends: [], updates: [], setups: [], locked: false, waits: 0, releases: 0,
    failAppend: false, failRead: false, ...overrides,
  };
}

export function runtime(state = createState(), options = {}) {
  let beforeLock = options.beforeLock;
  const identity = { email: options.email || 'sean@company.example' };
  class ServerDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
  }
  function readRange(range) {
    state.reads.push(range);
    if (state.failRead) throw new Error('private spreadsheet/id service failure');
    if (range === "'業務資料'!A1:F") return [salesHeaders, ...state.sales];
    if (range.startsWith("'協作備註'!")) {
      if (!state.notesExist) throw new Error('Unable to parse private spreadsheet range');
      if (range.endsWith('1:1')) return [state.noteHeaders];
      if (range.endsWith('A2:E')) return state.notes.map(row => row.slice());
    }
    if (range === "'新人資料'!A1:T1") return [headers];
    if (range === "'新人資料'!A2:T") return state.rows.map(row => row.slice());
    if (range === "'新人資料'!A2:O") return state.rows.map(row => row.slice(0, 15));
    if (range === "'新人資料'!S2:S") return state.rows.map(row => [row[18]]);
    throw new Error('Unexpected range ' + range);
  }
  const context = vm.createContext({
    Date: ServerDate, console: { warn() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({
      FOLLOWUP_ALLOWED_DOMAIN: 'company.example', FOLLOWUP_SPREADSHEET_ID: 'private-spreadsheet',
      FOLLOWUP_IDENTITY_SECRET: 'test-only-identity-secret-at-least-32-characters',
    })[key] }) },
    Session: { getActiveUser: () => ({ getEmail: () => identity.email }) },
    Utilities: { Charset: { UTF_8: 'UTF_8' },
      computeHmacSha256Signature: (value, secret) => Array.from(crypto.createHmac('sha256', secret).update(value).digest()),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
    },
    LockService: { getScriptLock: () => ({
      waitLock(timeout) {
        assert.equal(timeout, 30000); state.waits++;
        if (beforeLock) { const hook = beforeLock; beforeLock = null; hook(); }
        if (state.locked || options.lockTimeout) throw new Error('busy');
        state.locked = true;
      },
      releaseLock() { assert.ok(state.locked); state.locked = false; state.releases++; },
    }) },
    Sheets: { Spreadsheets: {
      get(id, request) {
        assert.equal(id, 'private-spreadsheet');
        assert.equal(request.fields, 'sheets.properties(sheetId,title)');
        return { sheets: [{ properties: { sheetId: 0, title: '新人資料' } },
          ...(state.notesExist ? [{ properties: { sheetId: 1, title: '協作備註' } }] : [])] };
      },
      batchUpdate(request, id) {
        assert.ok(state.locked); assert.equal(id, 'private-spreadsheet');
        assert.equal(request.requests.length, 2); assert.equal(state.notesExist, false);
        const [add, write] = request.requests;
        assert.equal(add.addSheet.properties.title, '協作備註');
        assert.equal(write.updateCells.range.sheetId, add.addSheet.properties.sheetId);
        assert.equal(write.updateCells.fields, 'userEnteredValue');
        assert.equal(write.updateCells.range.startRowIndex, 0);
        assert.equal(write.updateCells.range.endRowIndex, 1);
        state.noteHeaders = Array.from(write.updateCells.rows[0].values, cell => cell.userEnteredValue.stringValue);
        state.notesExist = true; state.setups.push(request);
      },
      Values: {
        batchGet(id, request) {
          assert.equal(id, 'private-spreadsheet');
          return { valueRanges: Array.from(request.ranges, range => ({ values: readRange(range) })) };
        },
        append(resource, id, range, options) {
          assert.ok(state.locked, 'append must hold ScriptLock');
          assert.equal(id, 'private-spreadsheet'); assert.equal(range, "'協作備註'!A:E");
          assert.equal(options.valueInputOption, 'RAW'); assert.equal(options.insertDataOption, 'INSERT_ROWS');
          assert.equal(options.includeValuesInResponse, false);
          assert.equal(resource.values.length, 1); assert.equal(resource.values[0].length, 5);
          if (state.failAppend) throw new Error('sensitive internal append error');
          if (state.beforeAppend) state.beforeAppend();
          const row = Array.from(resource.values[0]);
          state.notes.push(row); state.appends.push(row);
          return { updates: { updatedRows: 1 } };
        },
        batchUpdate(resource, id) {
          assert.ok(state.locked); assert.equal(id, 'private-spreadsheet');
          assert.equal(resource.data.length, 2);
          for (const item of resource.data) {
            const match = item.range.match(/^'新人資料'!([MP])(\d+)$/);
            assert.ok(match); const index = Number(match[2]) - 2;
            const values = Array.from(item.values[0]);
            assert.equal(values.length, match[1] === 'M' ? 1 : 5);
            state.rows[index].splice(match[1] === 'M' ? 12 : 15, values.length, ...values);
          }
          state.updates.push(resource);
        },
      },
    } },
  });
  vm.runInContext(serverSource, context, { filename: 'Code.gs' });
  return { api: context, state, identity };
}

export function updatePayload(api, serialNumber = '115DX2031') {
  const detail = api.getCase(serialNumber);
  return Object.fromEntries(['serialNumber', 'identityToken', 'revisionToken', 'estimatedTables',
    'firstConsultation', 'secondConsultation', 'thirdConsultation', 'status', 'closedDate']
    .map(key => [key, detail[key]]));
}
