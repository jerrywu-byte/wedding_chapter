import assert from 'node:assert/strict';
import test from 'node:test';
import { clientRuntime, fixture } from './helpers/followup-client-runtime.mjs';

const savedNote = { createdAt: '2026-09-01T11:35:00.000Z', authorName: 'Sean', note: '已說明停車' };

test('他人案件：正式欄位和儲存都不可操作，但備註編輯器可使用', () => {
  const ui = clientRuntime(); ui.open();
  assert.equal(ui.tables().disabled, true);
  ui.consultations().forEach(input => { assert.equal(input.disabled, true); assert.equal(input.readOnly, true); });
  ui.statuses.forEach(button => assert.equal(button.disabled, true));
  assert.equal(ui.elements.closedDate.disabled, true); assert.equal(ui.elements.saveCase.disabled, true);
  assert.equal(ui.elements.ownershipNotice.hidden, false);
  assert.equal(ui.elements.ownershipNotice.textContent, '此案件由 Lisa 負責，你可以查看案件內容並新增協作備註。');
  assert.equal(ui.elements.noteComposer.hidden, false); assert.equal(ui.elements.collaborationNote.disabled, false);
  ui.tables().value = '99'; ui.tables().emit('input', {}, true);
  ui.elements.saveCase.emit('click', {}, true); ui.statuses[1].emit('click', {}, true);
  assert.equal(ui.calls.some(call => call.method === 'updateCase'), false);
});

test('他人案件新增備註只送 serialNumber 和 note，Server 回應署名顯示且不呼叫 updateCase', () => {
  const ui = clientRuntime(); ui.open(); ui.input('collaborationNote', '已說明停車');
  assert.equal(ui.elements.addNote.disabled, false); ui.elements.addNote.emit('click');
  const call = ui.pending.find(call => call.method === 'addCollaborationNote');
  assert.deepEqual(Object.keys(call.payload).sort(), ['note', 'serialNumber']);
  assert.equal(call.payload.note, '已說明停車');
  assert.equal(ui.elements.addNote.disabled, true);
  ui.elements.addNote.emit('click', {}, true);
  assert.equal(ui.calls.filter(call => call.method === 'addCollaborationNote').length, 1);
  ui.respond('addCollaborationNote', { serialNumber: '115DX2031', collaborationNotes: [savedNote] });
  assert.match(ui.elements.collaborationNotes.textContent, /Sean/);
  assert.match(ui.elements.collaborationNotes.textContent, /19:35/);
  assert.match(ui.elements.collaborationNotes.textContent, /已說明停車/);
  assert.equal(ui.elements.collaborationNote.value, ''); assert.equal(ui.elements.noteState.textContent, '已新增協作備註');
  assert.equal(ui.elements.saveCase.disabled, true);
  assert.equal(ui.calls.some(call => call.method === 'updateCase'), false);
});

for (const label of ['USER 自己案件', 'ADMINISTRATOR 任意案件']) {
  test(`${label}：沿用 Server editable=true 編輯全部既有欄位`, () => {
    const ui = clientRuntime(); ui.open(fixture({ editable: true }));
    assert.equal(ui.tables().disabled, false); ui.consultations().forEach(input => assert.equal(input.disabled, false));
    ui.statuses.forEach(button => assert.equal(button.disabled, false));
    assert.equal(ui.elements.closedDate.disabled, false); assert.equal(ui.elements.ownershipNotice.hidden, true);
    ui.tables().value = '30'; ui.tables().emit('input');
    ui.elements.saveCase.emit('click');
    const call = ui.pending.find(call => call.method === 'updateCase');
    assert.equal(call.payload.estimatedTables, '30');
    assert.equal('note' in call.payload, false); assert.equal('collaborationNotes' in call.payload, false);
    assert.equal(ui.calls.some(call => call.method === 'addCollaborationNote'), false);
  });
}

test('新增備註成功保留未儲存的桌數／洽談與原 revisionToken', () => {
  const ui = clientRuntime(); const detail = fixture({ editable: true }); ui.open(detail);
  ui.tables().value = '31'; ui.tables().emit('input');
  ui.consultations()[0].value = '尚未儲存的洽談'; ui.consultations()[0].emit('input');
  ui.input('collaborationNote', '已說明停車'); ui.elements.addNote.emit('click');
  ui.respond('addCollaborationNote', { serialNumber: detail.serialNumber, collaborationNotes: [savedNote] });
  assert.equal(ui.tables().value, '31'); assert.equal(ui.consultations()[0].value, '尚未儲存的洽談');
  assert.equal(ui.elements.saveCase.disabled, false); ui.elements.saveCase.emit('click');
  const payload = ui.pending.find(call => call.method === 'updateCase').payload;
  assert.equal(payload.revisionToken, detail.revisionToken); assert.equal(payload.estimatedTables, '31');
  assert.equal(payload.firstConsultation, '尚未儲存的洽談');
});

test('正式儲存成功也不會清除尚未送出的備註草稿', () => {
  const ui = clientRuntime(); const detail = fixture({ editable: true }); ui.open(detail);
  ui.input('collaborationNote', '還沒送出的備註'); ui.tables().value = '31'; ui.tables().emit('input');
  ui.elements.saveCase.emit('click');
  ui.respond('updateCase', { ...detail, estimatedTables: '31', revisionToken: 'new-revision' });
  assert.equal(ui.elements.collaborationNote.value, '還沒送出的備註');
  assert.equal(ui.elements.noteComposer.open, true); assert.equal(ui.elements.addNote.disabled, false);
});

for (const code of ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'DATA_INTEGRITY_ERROR', 'VALIDATION_ERROR', 'CONFLICT', 'INTERNAL_ERROR', 'LOCK_TIMEOUT']) {
  test(`新增備註 ${code}：保留文字，顯示安全訊息，不自動重試`, () => {
    const ui = clientRuntime(); ui.open(); ui.input('collaborationNote', '請保留我的文字');
    ui.elements.addNote.emit('click'); ui.respond('addCollaborationNote', { message: code }, true);
    assert.equal(ui.elements.collaborationNote.value, '請保留我的文字');
    assert.ok(ui.elements.noteState.textContent); assert.doesNotMatch(ui.elements.noteState.textContent, /ERROR|stack|spreadsheet/);
    assert.equal(ui.pending.length, 0);
    if (code === 'UNAUTHORIZED') assert.equal(ui.elements.addNote.disabled, true);
  });
}

test('新增回應格式異常時保留文字，不假裝成功', () => {
  const ui = clientRuntime(); ui.open(); ui.input('collaborationNote', '保留'); ui.elements.addNote.emit('click');
  ui.respond('addCollaborationNote', { serialNumber: 'wrong' });
  assert.equal(ui.elements.collaborationNote.value, '保留');
  assert.match(ui.elements.noteState.textContent, /無法確認新增結果/);
});

test('只有備註草稿也會提示離開；取消不切案件，確認後才丟棄', () => {
  const ui = clientRuntime(); ui.open(); ui.input('collaborationNote', '未送出');
  ui.elements.caseList.children[1].emit('click');
  assert.equal(ui.state.confirmations, 1); assert.equal(ui.pending.length, 0);
  assert.equal(ui.elements.collaborationNote.value, '未送出');
  let prevented = false; ui.windowEvents.beforeunload({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  ui.state.confirm = true; ui.elements.caseList.children[1].emit('click');
  ui.respond('getCase', fixture({ serialNumber: '115DX2032' }));
  assert.equal(ui.elements.collaborationNote.value, '');
});

test('送出中禁止切換案件，避免成功回應覆蓋另一筆案件', () => {
  const ui = clientRuntime(); ui.open(); ui.input('collaborationNote', '送出中'); ui.elements.addNote.emit('click');
  ui.elements.caseList.children[1].emit('click');
  assert.equal(ui.pending.length, 1); assert.equal(ui.pending[0].method, 'addCollaborationNote');
});

test('沒有 Server permission flags 時預設不可修改或新增', () => {
  const ui = clientRuntime(); ui.open(fixture({ editable: undefined, canAddCollaborationNote: undefined }));
  assert.equal(ui.tables().disabled, true); assert.equal(ui.elements.saveCase.disabled, true);
  assert.equal(ui.elements.noteComposer.hidden, true);
  ui.input('collaborationNote', '竄改'); ui.elements.addNote.emit('click', {}, true);
  assert.equal(ui.calls.some(call => call.method === 'addCollaborationNote'), false);
});

test('備註和署名的 HTML 以 textContent 顯示，不建立可執行節點', () => {
  const ui = clientRuntime(); ui.open(fixture({ collaborationNotes: [{ ...savedNote,
    authorName: '<img onerror=alert(1)>', note: '<script>alert(1)</script>',
  }] }));
  assert.match(ui.elements.collaborationNotes.textContent, /<script>/);
  assert.equal(ui.elements.collaborationNotes.querySelectorAll('script').length, 0);
  assert.equal(ui.elements.collaborationNotes.querySelectorAll('img').length, 0);
});

test('搜尋先取消過時的 detail 回應，舊請求不能覆蓋新案件', () => {
  const ui = clientRuntime(); ui.respond('listCases', [fixture()]);
  const oldDetail = ui.pending.shift();
  ui.input('caseSearch', '115DX2032'); ui.flushTimers();
  ui.respond('listCases', [fixture({ serialNumber: '115DX2032' })]);
  ui.respond('getCase', fixture({ serialNumber: '115DX2032' }));
  oldDetail.success(fixture());
  assert.equal(ui.elements.caseNumber.textContent, '訪客編號 115DX2032');
});
