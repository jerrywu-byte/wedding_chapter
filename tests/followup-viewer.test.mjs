import assert from 'node:assert/strict';
import test from 'node:test';
import { createState, runtime, updatePayload } from './helpers/followup-collaboration-runtime.mjs';
import { clientRuntime, fixture } from './helpers/followup-client-runtime.mjs';

for (const email of ['anyuser@weddingi.com', 'another@weddingi.com']) {
  test(`${email} 不需業務資料即可取得 VIEWER 身分`, () => {
    const { api, state } = runtime(createState({ sales: [] }), { email });
    const currentUser = api.requireAuthorizedUser_();

    assert.equal(currentUser.email, email);
    assert.equal(currentUser.role, 'VIEWER');
    assert.equal(currentUser.salesCode, '');
    assert.equal(currentUser.salesName, '');
    assert.equal(state.reads.length, 0);
  });
}

test('denwell 既有 ADMINISTRATOR／USER 資料角色行為不變', () => {
  const state = createState();
  state.sales[0][2] = 'user@denwell.com';
  state.sales[2][2] = 'administrator@denwell.com';

  const user = runtime(state, { email: 'user@denwell.com' });
  user.api.PropertiesService.getScriptProperties = () => ({ getProperty: key => ({
    FOLLOWUP_ALLOWED_DOMAIN: 'denwell.com', FOLLOWUP_SPREADSHEET_ID: 'private-spreadsheet',
    FOLLOWUP_IDENTITY_SECRET: 'test-only-identity-secret-at-least-32-characters',
  })[key] });
  assert.equal(user.api.requireAuthorizedUser_().role, 'USER');

  const administrator = runtime(state, { email: 'administrator@denwell.com' });
  administrator.api.PropertiesService.getScriptProperties = user.api.PropertiesService.getScriptProperties;
  assert.equal(administrator.api.requireAuthorizedUser_().role, 'ADMINISTRATOR');
});

test('VIEWER 可列出、搜尋並查看所有案件與協作備註，但權限旗標全部唯讀', () => {
  const state = createState({
    notes: [['115DX2031', '2026-09-01T11:35:00.000Z', 'SEAN', 'Sean', '已說明停車']],
  });
  const { api } = runtime(state, { email: 'reader@weddingi.com' });

  const cases = api.listCases('');
  assert.equal(cases.length, 2);
  cases.forEach(item => {
    assert.equal(item.editable, false);
    assert.equal(item.canAddCollaborationNote, false);
  });
  assert.equal(api.listCases('115DX2032')[0].serialNumber, '115DX2032');
  assert.equal(api.listCases('新郎115DX2031')[0].serialNumber, '115DX2031');

  const detail = api.getCase('115DX2031');
  assert.equal(detail.editable, false);
  assert.equal(detail.canAddCollaborationNote, false);
  assert.equal(detail.collaborationNotes.length, 1);
  assert.equal(detail.collaborationNotes[0].note, '已說明停車');
});

test('VIEWER 的所有 write API 均由 Server 立即回傳 FORBIDDEN，偽造 role 無效', () => {
  const state = createState({ notesExist: false });
  const { api } = runtime(state, { email: 'reader@weddingi.com' });

  assert.throws(() => api.addCollaborationNote({
    serialNumber: '115DX2031', note: '正常格式仍不得寫入',
  }), /^Error: FORBIDDEN$/);
  assert.throws(() => api.updateCase({ role: 'ADMINISTRATOR' }), /^Error: FORBIDDEN$/);
  assert.throws(() => api.addCollaborationNote({
    serialNumber: '115DX2031', note: '竄改', role: 'ADMINISTRATOR', salesCode: 'SEAN',
  }), /^Error: FORBIDDEN$/);
  assert.throws(() => api.setupCollaborationNotes(), /^Error: FORBIDDEN$/);
  assert.equal(state.waits, 0);
  assert.equal(state.updates.length, 0);
  assert.equal(state.appends.length, 0);
  assert.equal(state.setups.length, 0);
});

test('VIEWER 即使取得有效案件 token，也不能 updateCase', () => {
  const reader = runtime(createState(), { email: 'reader@weddingi.com' });
  const payload = updatePayload(reader.api);
  assert.throws(() => reader.api.updateCase(payload), /^Error: FORBIDDEN$/);
  assert.equal(reader.state.updates.length, 0);
});

test('非內部網域與非 weddingi.com 網域仍拒絕', () => {
  for (const email of ['outsider@example.net', 'fake@weddingi.com.example', '', 'bad@@weddingi.com']) {
    const { api } = runtime(createState(), { email });
    assert.throws(() => api.listCases(''), /^Error: UNAUTHORIZED$/);
  }
});

test('VIEWER UI 為完整唯讀、隱藏新增備註並保留業務／狀態／搜尋篩選', () => {
  const app = clientRuntime();
  const viewerPermission = { editable: false, canAddCollaborationNote: false };
  const lisa = fixture({ ...viewerPermission, salesName: 'Lisa', salesCode: 'LISA', status: '洽談中' });
  const jerry = fixture({ ...viewerPermission, serialNumber: '115DX2032', salesName: 'Jerry',
    salesCode: 'JERRY', status: '已訂' });

  app.respond('listCases', [lisa, jerry]);
  app.respond('getCase', lisa);
  assert.equal(app.tables().disabled, true);
  app.consultations().forEach(input => {
    assert.equal(input.disabled, true);
    assert.equal(input.readOnly, true);
  });
  app.statuses.forEach(button => assert.equal(button.disabled, true));
  assert.equal(app.elements.closedDate.disabled, true);
  assert.equal(app.elements.saveCase.disabled, true);
  assert.equal(app.elements.noteComposer.hidden, true);
  assert.equal(app.elements.collaborationNote.disabled, true);
  assert.match(app.elements.ownershipNotice.textContent, /唯讀檢視模式/);

  app.elements.saveCase.emit('click', {}, true);
  app.elements.addNote.emit('click', {}, true);
  assert.equal(app.calls.some(call => ['updateCase', 'addCollaborationNote'].includes(call.method)), false);

  app.salesFilters[0].value = 'Jerry';
  app.salesFilters[0].emit('change');
  app.respond('getCase', jerry);
  assert.equal(app.elements.caseCount.textContent, '1 筆');

  const booked = app.caseStatusFilters.find(button => button.dataset.caseStatus === '已訂');
  booked.emit('click');
  assert.equal(app.elements.caseCount.textContent, '1 筆');

  app.input('caseSearch', '115DX2032');
  app.flushTimers();
  const searchCall = app.pending.find(call => call.method === 'listCases');
  assert.equal(searchCall.payload, '115DX2032');
});

test('VIEWER 權限判斷不會增加案件摘要個資欄位', () => {
  const { api } = runtime(createState(), { email: 'reader@weddingi.com' });
  const summary = api.listCases('')[0];
  assert.equal(Object.keys(summary).some(key => /email|phone|role/i.test(key)), false);
  assert.deepEqual(Object.keys(summary).sort(), [
    'banquetSession', 'brideName', 'canAddCollaborationNote', 'dateUndecided', 'editable',
    'estimatedTables', 'groomName', 'salesCode', 'salesName', 'serialNumber', 'status', 'weddingDate',
  ]);
});
