import assert from 'node:assert/strict';
import test from 'node:test';
import { runtime, createState, caseRow, noteHeaders, updatePayload } from './helpers/followup-collaboration-runtime.mjs';

for (const [email, name, code, editable] of [
  ['april@company.example', 'April', 'APRIL', [true, true]],
  ['sean@company.example', 'Sean', 'SEAN', [true, false]],
  ['lisa@company.example', 'Lisa', 'LISA', [false, true]],
]) {
  test(`${code}: 所有案件可讀與新增具真實 Server 署名備註；正式編輯依 ownership`, () => {
    const { api, state } = runtime(createState(), { email });
    assert.equal(api.listCases('').length, 2);
    state.rows.forEach((row, index) => {
      const detail = api.getCase(row[0]);
      assert.equal(detail.editable, editable[index]);
      assert.equal(detail.canAddCollaborationNote, true);
      const summary = api.listCases(row[0])[0];
      assert.equal(summary.editable, editable[index]);
      assert.equal(summary.canAddCollaborationNote, true);
      const before = state.rows.map(item => item.slice());
      const result = api.addCollaborationNote({ serialNumber: row[0], note: '已協助停車資訊' });
      assert.deepEqual(state.rows, before);
      assert.deepEqual(state.notes[index], [row[0], state.now, code, name, '已協助停車資訊']);
      assert.equal(result.collaborationNotes[0].authorName, name);
      const payload = { ...updatePayload(api, row[0]), estimatedTables: '25' };
      if (editable[index]) api.updateCase(payload);
      else assert.throws(() => api.updateCase(payload), /^Error: FORBIDDEN$/);
    });
    assert.equal(state.appends.length, 2);
  });
}

for (const [label, configure, email] of [
  ['外部網域', () => {}, 'sean@outside.example'],
  ['無 Email', () => {}, ' '],
  ['同網域未登記', () => {}, 'unknown@company.example'],
  ['停用', state => { state.sales[0][4] = 'FALSE'; }],
  ['啟用值非 TRUE', state => { state.sales[0][4] = '1'; }],
  ['角色空白', state => { state.sales[0][5] = ''; }],
  ['角色非法', state => { state.sales[0][5] = 'ADMIN'; }],
]) {
  test(`${label}：讀取、新增與修改均拒絕，且不讀案件或備註`, () => {
    const state = createState(); configure(state);
    const { api } = runtime(state, { email });
    for (const action of [() => api.listCases(''), () => api.getCase('115DX2031'),
      () => api.updateCase({}), () => api.addCollaborationNote({ serialNumber: '115DX2031', note: 'x' })]) {
      assert.throws(action, /UNAUTHORIZED/);
    }
    assert.ok(state.reads.every(range => range.startsWith("'業務資料'!")));
    assert.equal(state.appends.length, 0); assert.equal(state.updates.length, 0);
  });
}

for (const field of ['authorName', 'author', 'salesCode', 'salesName', 'email', 'createdAt', 'rowNumber', 'revisionToken']) {
  test(`偽造 ${field} 整筆拒絕，無法改署名或定位列`, () => {
    const { api, state } = runtime();
    assert.throws(() => api.addCollaborationNote({ serialNumber: '115DX2032', note: 'x', [field]: 'April' }), /VALIDATION_ERROR/);
    assert.equal(state.appends.length, 0);
  });
}

for (const note of ['', ' \r\n\t ', 'x'.repeat(1001), 123, null]) {
  test(`備註 ${String(note).slice(0, 10)} 空白、過長或非文字會拒絕`, () => {
    const { api, state } = runtime();
    assert.throws(() => api.addCollaborationNote({ serialNumber: '115DX2031', note }), /VALIDATION_ERROR/);
    assert.equal(state.appends.length, 0);
  });
}

test('1000 字邊界接受；公式與 HTML 只以 RAW 純文字寫入', () => {
  const { api, state } = runtime();
  for (const note of ['x'.repeat(1000), '=IMPORTXML("not-a-url", "x")', '<script>alert(1)</script>', '  第一行\r\n第二行  ']) {
    api.addCollaborationNote({ serialNumber: '115DX2031', note });
  }
  assert.equal(state.notes.length, 4);
  assert.equal(state.notes[1][4], '=IMPORTXML("not-a-url", "x")');
  assert.equal(state.notes[3][4], '第一行\n第二行');
});

test('不存在與重複訪客編號拒絕，所有既有備註保持不變', () => {
  const { api, state } = runtime();
  assert.throws(() => api.addCollaborationNote({ serialNumber: 'missing', note: 'x' }), /NOT_FOUND/);
  state.rows.push(caseRow());
  assert.throws(() => api.addCollaborationNote({ serialNumber: '115DX2031', note: 'x' }), /DATA_INTEGRITY_ERROR/);
  assert.equal(state.appends.length, 0);
  assert.equal(state.waits, state.releases);
});

test('重複 Email／業務代碼以及署名姓名缺失 fail closed', () => {
  for (const change of [state => state.sales.push(state.sales[0].slice()),
    state => state.sales[1][0] = 'SEAN', state => state.sales[0][1] = '']) {
    const state = createState(); change(state); const { api } = runtime(state);
    assert.throws(() => api.addCollaborationNote({ serialNumber: '115DX2031', note: 'x' }), /DATA_INTEGRITY_ERROR/);
    assert.equal(state.appends.length, 0);
  }
});

test('備註依時間舊到新排序，同時間維持先後，且不洩漏其他案件、Email 或列位置', () => {
  const state = createState({ notes: [
    ['115DX2031', '2026-09-02T06:10:00Z', 'LISA', 'Lisa', '較新'],
    ['115DX2032', '2026-09-01T03:00:00Z', 'SEAN', 'Sean', '其他案件'],
    ['115DX2031', '2026-09-01T11:35:00Z', 'SEAN', 'Sean', '較舊'],
    ['115DX2031', '2026-09-01T11:35:00Z', 'LISA', 'Lisa', '同時間'],
  ] });
  const { api } = runtime(state);
  const notes = api.getCase('115DX2031').collaborationNotes;
  assert.deepEqual(Array.from(notes, note => note.note), ['較舊', '同時間', '較新']);
  notes.forEach(note => assert.deepEqual(Object.keys(note).sort(), ['authorName', 'createdAt', 'note']));
  assert.doesNotMatch(JSON.stringify(notes), /@|rowNumber|sheetId|spreadsheetId|其他案件/);
});

test('SALES 跨業務搜尋 A/D/E/F/G/H/I，摘要不帶電話或備註', () => {
  const state = createState();
  state.rows[1][4] = '0944-444-444'; state.rows[1][6] = '0955-555-555'; state.rows[1][8] = '0966-666-666';
  const { api } = runtime(state);
  for (const column of [0, 3, 4, 5, 6, 7, 8]) {
    const result = api.listCases(state.rows[1][column]);
    assert.equal(result.length, 1); assert.equal(result[0].serialNumber, '115DX2032');
    assert.doesNotMatch(JSON.stringify(result), /0944|0955|0966|Phone|collaborationNotes/);
  }
});

test('ownership 僅看 N 業務代碼，不看 O 姓名；空白 N 可讀可備註不可編輯', () => {
  const state = createState(); state.rows[1][14] = 'Sean';
  const { api } = runtime(state);
  assert.equal(api.getCase('115DX2032').editable, false);
  assert.throws(() => api.updateCase(updatePayload(api, '115DX2032')), /FORBIDDEN/);
  state.rows[1][13] = '';
  api.addCollaborationNote({ serialNumber: '115DX2032', note: '協助' });
  assert.throws(() => api.updateCase(updatePayload(api, '115DX2032')), /FORBIDDEN/);
});

test('兩個帳號競爭同一鎖，後取得鎖者讀到先寫入的備註且不覆蓋', () => {
  const state = createState(); const second = runtime(state, { email: 'lisa@company.example' });
  const first = runtime(state, { beforeLock: () => second.api.addCollaborationNote({ serialNumber: '115DX2031', note: 'Lisa 先取得鎖' }) });
  const result = first.api.addCollaborationNote({ serialNumber: '115DX2031', note: 'Sean 後取得鎖' });
  assert.deepEqual(state.notes.map(row => [row[2], row[4]]), [['LISA', 'Lisa 先取得鎖'], ['SEAN', 'Sean 後取得鎖']]);
  assert.equal(result.collaborationNotes.length, 2);
  assert.equal(state.waits, 2); assert.equal(state.releases, 2);
});

test('鎖逾時沒有 append；服務失敗釋放鎖且不暴露內部錯誤', () => {
  const busy = runtime(createState(), { lockTimeout: true });
  assert.throws(() => busy.api.addCollaborationNote({ serialNumber: '115DX2031', note: 'x' }), /LOCK_TIMEOUT/);
  assert.equal(busy.state.appends.length, 0); assert.equal(busy.state.releases, 0);
  const failure = runtime(createState({ failAppend: true }));
  assert.throws(() => failure.api.addCollaborationNote({ serialNumber: '115DX2031', note: 'x' }), /^Error: INTERNAL_ERROR$/);
  assert.equal(failure.state.locked, false); assert.equal(failure.state.releases, 1);
  const readFailure = runtime(createState({ failRead: true }));
  assert.throws(() => readFailure.api.getCase('115DX2031'), /^Error: INTERNAL_ERROR$/);
});

test('第一筆 append 持鎖時另一帳號不能寫入；鎖釋放後新增保留兩筆紀錄', () => {
  const state = createState(); const first = runtime(state); const second = runtime(state, { email: 'lisa@company.example' });
  state.beforeAppend = () => {
    state.beforeAppend = null;
    assert.throws(() => second.api.addCollaborationNote({ serialNumber: '115DX2031', note: 'Lisa' }), /LOCK_TIMEOUT/);
    assert.equal(state.locked, true);
  };
  first.api.addCollaborationNote({ serialNumber: '115DX2031', note: 'Sean' });
  second.api.addCollaborationNote({ serialNumber: '115DX2031', note: 'Lisa' });
  assert.deepEqual(state.notes.map(row => row[2]), ['SEAN', 'LISA']);
  assert.equal(state.notes.length, 2); assert.equal(state.locked, false);
});

test('等待鎖時業務被停用，重新授權後拒絕 append', () => {
  const state = createState();
  const { api } = runtime(state, { beforeLock: () => { state.sales[0][4] = false; } });
  assert.throws(() => api.addCollaborationNote({ serialNumber: '115DX2031', note: 'x' }), /UNAUTHORIZED/);
  assert.equal(state.appends.length, 0); assert.equal(state.locked, false);
});

test('等待鎖時案件被重新分派，updateCase 不得跨業務修改', () => {
  const state = createState();
  const { api } = runtime(state, { beforeLock: () => { state.rows[0][13] = 'LISA'; } });
  const payload = updatePayload(api);
  assert.throws(() => api.updateCase(payload), /FORBIDDEN/);
  assert.equal(state.updates.length, 0);
});

test('備註不影響 revisionToken，正式更新仍僅 M＋P:T 且不改備註', () => {
  const { api, state } = runtime();
  const payload = updatePayload(api); const identity = payload.identityToken;
  api.addCollaborationNote({ serialNumber: payload.serialNumber, note: '新增備註' });
  assert.equal(api.getCase(payload.serialNumber).revisionToken, payload.revisionToken);
  const notes = JSON.stringify(state.notes);
  const before = state.rows[0].slice();
  const result = api.updateCase({ ...payload, estimatedTables: '30', firstConsultation: '新洽談' });
  assert.equal(JSON.stringify(state.notes), notes);
  assert.deepEqual(state.rows[0].slice(0, 12), before.slice(0, 12));
  assert.deepEqual(state.rows[0].slice(13, 15), before.slice(13, 15));
  assert.equal(state.rows[0].length, 20); assert.equal(result.identityToken, identity);
  assert.notEqual(result.revisionToken, payload.revisionToken);
  assert.throws(() => api.updateCase(payload), /CONFLICT/);
  assert.equal(state.updates.length, 1);
  assert.throws(() => api.updateCase({ ...updatePayload(api), collaborationNotes: [] }), /VALIDATION_ERROR/);
});

test('public 手動 setup 由 MANAGER 一次建立工作表與表頭，重跑不改任何資料', () => {
  const state = createState({ notesExist: false }); const { api } = runtime(state, { email: 'april@company.example' });
  assert.equal(api.setupCollaborationNotes().created, true);
  assert.equal(state.notesExist, true);
  assert.deepEqual(state.noteHeaders, noteHeaders);
  api.addCollaborationNote({ serialNumber: '115DX2031', note: '保留我' });
  const before = JSON.stringify(state.notes);
  assert.equal(api.setupCollaborationNotes().created, false);
  assert.equal(JSON.stringify(state.notes), before); assert.equal(state.setups.length, 1);
  assert.equal(state.waits, state.releases);
});

test('已存在但表頭不符的工作表禁止覆蓋，getCase／append 也 fail closed', () => {
  for (const header of [[], ['錯誤', ...noteHeaders.slice(1)], [...noteHeaders, '多餘欄']]) {
    const existingNote = ['115DX2031', '2026-09-01T11:35:00Z', 'SEAN', 'Sean', '不可覆寫'];
    const state = createState({ noteHeaders: header, notes: [existingNote.slice()] });
    const { api } = runtime(state, { email: 'april@company.example' });
    for (const action of [() => api.setupCollaborationNotes(), () => api.getCase('115DX2031'),
      () => api.addCollaborationNote({ serialNumber: '115DX2031', note: 'x' })]) {
      assert.throws(action, /DATA_INTEGRITY_ERROR/);
    }
    assert.equal(state.setups.length, 0); assert.equal(state.appends.length, 0);
    assert.deepEqual(state.noteHeaders, header);
    assert.deepEqual(state.notes, [existingNote]);
  }
});

test('SALES／未授權帳號不可 setup，Web App request 不自動建立缺少的 Sheet', () => {
  const state = createState({ notesExist: false }); const { api } = runtime(state);
  assert.throws(() => api.setupCollaborationNotes(), /^Error: FORBIDDEN$/);
  assert.throws(() => api.getCase('115DX2031'), /^Error: INTERNAL_ERROR$/);
  assert.throws(() => api.addCollaborationNote({ serialNumber: '115DX2031', note: 'x' }), /^Error: INTERNAL_ERROR$/);
  assert.equal(state.setups.length, 0); assert.equal(state.notesExist, false);
  assert.throws(() => runtime(state, { email: 'outsider@example.net' }).api.setupCollaborationNotes(), /^Error: UNAUTHORIZED$/);
  assert.deepEqual(Object.keys(api).filter(name => /CollaborationNote/.test(name) && !name.endsWith('_')),
    ['addCollaborationNote', 'setupCollaborationNotes']);
});

test('public setup 原樣回傳既有實作結果與錯誤，不建立第二套邏輯', () => {
  const { api, state } = runtime();
  const result = { created: false }; let calls = 0;
  api.setupCollaborationNotes_ = () => { calls++; return result; };
  assert.equal(api.setupCollaborationNotes(), result);
  assert.equal(calls, 1);
  const error = new Error('FORBIDDEN');
  api.setupCollaborationNotes_ = () => { throw error; };
  assert.throws(() => api.setupCollaborationNotes(), thrown => thrown === error);
  assert.equal(state.reads.length, 0); assert.equal(state.setups.length, 0);
});

for (const [label, email, disabledIndex] of [
  ['同網域未登記帳號', 'unknown@company.example', null],
  ['停用 SALES', 'sean@company.example', 0],
  ['停用 MANAGER', 'april@company.example', 2],
]) {
  test(`public setup 拒絕${label}，不建立或修改工作表`, () => {
    const state = createState({ notesExist: false });
    if (disabledIndex !== null) state.sales[disabledIndex][4] = false;
    const { api } = runtime(state, { email });
    assert.throws(() => api.setupCollaborationNotes(), /^Error: UNAUTHORIZED$/);
    assert.equal(state.notesExist, false); assert.equal(state.setups.length, 0);
    assert.equal(state.appends.length, 0); assert.equal(state.updates.length, 0);
    assert.equal(state.waits, 0);
  });
}

test('public setup 保留鎖逾時與鎖內 MANAGER 再驗證', () => {
  const busy = runtime(createState({ notesExist: false }), { email: 'april@company.example', lockTimeout: true });
  assert.throws(() => busy.api.setupCollaborationNotes(), /^Error: LOCK_TIMEOUT$/);
  assert.equal(busy.state.setups.length, 0);
  const state = createState({ notesExist: false });
  const { api } = runtime(state, { email: 'april@company.example', beforeLock: () => { state.sales[2][5] = 'SALES'; } });
  assert.throws(() => api.setupCollaborationNotes(), /^Error: FORBIDDEN$/);
  assert.equal(state.setups.length, 0); assert.equal(state.locked, false);
  assert.equal(state.waits, 1); assert.equal(state.releases, 1);
});

test('addCollaborationNote 無 payload 仍拒絕，不當作 setup 或寫入備註', () => {
  const { api, state } = runtime(createState({ notesExist: false }), { email: 'april@company.example' });
  assert.throws(() => api.addCollaborationNote(), /^Error: VALIDATION_ERROR$/);
  assert.equal(state.notesExist, false); assert.equal(state.setups.length, 0);
  assert.equal(state.appends.length, 0); assert.equal(state.waits, 0);
});
