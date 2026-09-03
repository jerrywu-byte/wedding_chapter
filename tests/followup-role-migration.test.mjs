import assert from 'node:assert/strict';
import test from 'node:test';
import { runtime, createState, caseRow, updatePayload } from './helpers/followup-collaboration-runtime.mjs';

const expectedRoles = {
  April: 'ADMINISTRATOR', Jerry: 'ADMINISTRATOR',
  Sean: 'USER', Jimmy: 'USER', Lisa: 'USER', Nidia: 'USER', Elle: 'USER',
};

test('七位業務 fixture 使用指定的大寫角色，Email 與業務代碼唯一', () => {
  const { sales } = createState();
  assert.deepEqual(Object.fromEntries(sales.map(row => [row[1], row[5]])), expectedRoles);
  assert.equal(new Set(sales.map(row => row[0])).size, 7);
  assert.equal(new Set(sales.map(row => row[2])).size, 7);
});

for (const [name, role] of Object.entries(expectedRoles)) {
  test(`${name} / ${role}：讀取、搜尋、ownership、協作署名與 setup 權限不變`, () => {
    const state = createState();
    const [code, , email] = state.sales.find(row => row[1] === name);
    state.rows = [caseRow('115DX2031', code), caseRow('115DX2032', 'OTHER')];
    const { api } = runtime(state, { email });
    assert.equal(api.requireAuthorizedUser_().role, role);
    assert.equal(api.listCases('').length, 2);
    assert.equal(api.listCases('115DX2032')[0].serialNumber, '115DX2032');
    for (const [index, row] of state.rows.entries()) {
      const detail = api.getCase(row[0]);
      assert.equal(detail.editable, index === 0 || role === 'ADMINISTRATOR');
      assert.equal(detail.canAddCollaborationNote, true);
      api.addCollaborationNote({ serialNumber: row[0], note: '協助聯繫' });
      assert.deepEqual(state.notes[index].slice(2), [code, name, '協助聯繫']);
      const payload = { ...updatePayload(api, row[0]), estimatedTables: '26' };
      if (detail.editable) assert.equal(api.updateCase(payload).estimatedTables, '26');
      else assert.throws(() => api.updateCase(payload), /^Error: FORBIDDEN$/);
    }
    if (role === 'ADMINISTRATOR') assert.equal(api.setupCollaborationNotes().created, false);
    else assert.throws(() => api.setupCollaborationNotes(), /^Error: FORBIDDEN$/);
    assert.equal(state.setups.length, 0);
  });
}

// Legacy labels are deliberately retained only as rejected input, never as valid fixtures.
for (const role of ['MANAGER', 'SALES', 'ADMIN', 'UNKNOWN', '']) {
  test(`舊值或異常角色 ${JSON.stringify(role)}：所有資料 API 與 setup 均 fail closed`, () => {
    const state = createState({ notesExist: false });
    state.sales[0][5] = role;
    const { api } = runtime(state);
    for (const action of [() => api.listCases(''), () => api.getCase('115DX2031'),
      () => api.updateCase({}), () => api.addCollaborationNote({ serialNumber: '115DX2031', note: 'x' }),
      () => api.setupCollaborationNotes()]) {
      assert.throws(action, /^Error: UNAUTHORIZED$/);
    }
    assert.ok(state.reads.every(range => range === "'業務資料'!A1:F"));
    assert.equal(state.waits, 0); assert.equal(state.setups.length, 0);
    assert.equal(state.appends.length, 0); assert.equal(state.updates.length, 0);
  });
}

for (const name of ['April', 'Jerry']) {
  test(`停用 ${name} 即使角色為 ADMINISTRATOR 仍拒絕所有資料 API 與 setup`, () => {
    const state = createState();
    const user = state.sales.find(row => row[1] === name); user[4] = false;
    const { api } = runtime(state, { email: user[2] });
    for (const action of [() => api.listCases(''), () => api.getCase('115DX2031'),
      () => api.updateCase({}), () => api.addCollaborationNote({ serialNumber: '115DX2031', note: 'x' }),
      () => api.setupCollaborationNotes()]) {
      assert.throws(action, /^Error: UNAUTHORIZED$/);
    }
    assert.equal(state.waits, 0); assert.equal(state.setups.length, 0);
    assert.equal(state.appends.length, 0); assert.equal(state.updates.length, 0);
  });
}
