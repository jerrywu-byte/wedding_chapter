import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { clientRuntime, fixture } from './helpers/followup-client-runtime.mjs';

const index = fs.readFileSync(
  new URL('../google-apps-script/followup-auth-test/Index.html', import.meta.url),
  'utf8',
);
const styles = fs.readFileSync(
  new URL('../google-apps-script/followup-auth-test/Styles.html', import.meta.url),
  'utf8',
);
const client = fs.readFileSync(
  new URL('../google-apps-script/followup-auth-test/Client.html', import.meta.url),
  'utf8',
);

function summary(serialNumber, salesName, status) {
  return fixture({
    serialNumber,
    groomName: serialNumber + '新郎',
    brideName: serialNumber + '新娘',
    salesName,
    salesCode: salesName.toUpperCase(),
    status,
  });
}

function statisticValues(app, status) {
  return app.statisticCounts
    .filter(element => element.dataset.statStatus === status)
    .map(element => element.textContent);
}

function statusFilter(app, status) {
  return app.caseStatusFilters.find(button => button.dataset.caseStatus === status);
}

function loadRows(app, rows) {
  app.respond('listCases', rows);
  app.respond('getCase', rows[0]);
}

test('桌機有獨立中間側欄，手機保留精簡篩選且不產生橫向捲動', () => {
  assert.match(index, /<aside class="followup-filter-panel" aria-label="篩選與統計">/);
  assert.match(index, /<details class="followup-mobile-filters">/);
  assert.match(index, /全部業務/);
  for (const salesName of ['April', 'Sean', 'Jimmy', 'Lisa', 'Nidia', 'Jerry', 'Elle']) {
    assert.match(index, new RegExp('<option value="' + salesName + '">' + salesName + '<\\/option>'));
  }
  assert.match(styles, /grid-template-columns:\s*minmax\(300px, 340px\) minmax\(210px, 238px\) minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.followup-filter-panel \{ display: none; \}/);
  assert.match(styles, /body \{ overflow-x: hidden; \}/);
  assert.match(styles, /\.followup-mobile-stat-grid\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto/s);
  assert.match(styles, /\.followup-mobile-stat-grid button\s*\{[^}]*flex:\s*0 0 auto/s);
});

test('首次載入預設為全部業務與全部案件', () => {
  const app = clientRuntime();
  const rows = [
    summary('CASE-LISA-BOOKED', 'Lisa', '已訂'),
    summary('CASE-JERRY-LOST', 'Jerry', '流失'),
  ];
  loadRows(app, rows);

  assert.ok(app.salesFilters.every(select => select.value === ''));
  assert.ok(app.caseStatusFilters
    .filter(button => button.dataset.caseStatus === '')
    .every(button => button.classList.contains('is-active')));
  assert.equal(app.elements.caseCount.textContent, '2 筆');
});

test('業務與狀態使用 listCases 摘要做前端疊加篩選及統計', () => {
  const app = clientRuntime();
  const rows = [
    summary('CASE-LISA-BOOKED', 'Lisa', '已訂'),
    summary('CASE-LISA-OPEN', 'Lisa', ''),
    summary('CASE-JERRY-CANCELLED', 'Jerry', '退訂'),
    summary('CASE-JERRY-LOST', 'Jerry', '流失'),
  ];

  app.respond('listCases', rows);
  app.respond('getCase', rows[0]);

  assert.equal(app.elements.caseCount.textContent, '4 筆');
  assert.deepEqual(statisticValues(app, ''), ['4', '4']);
  assert.deepEqual(statisticValues(app, '已訂'), ['1', '1']);
  assert.deepEqual(statisticValues(app, '洽談中'), ['1', '1']);
  assert.deepEqual(statisticValues(app, '退訂'), ['1', '1']);
  assert.deepEqual(statisticValues(app, '流失'), ['1', '1']);

  app.salesFilters[0].value = 'Lisa';
  app.salesFilters[0].emit('change');
  assert.equal(app.respond('getCase', rows[0]).payload, rows[0].serialNumber);
  assert.equal(app.elements.caseCount.textContent, '2 筆');
  assert.ok(app.salesFilters.every(select => select.value === 'Lisa'));
  assert.deepEqual(statisticValues(app, ''), ['2', '2']);
  assert.deepEqual(statisticValues(app, '已訂'), ['1', '1']);
  assert.deepEqual(statisticValues(app, '洽談中'), ['1', '1']);
  assert.deepEqual(statisticValues(app, '退訂'), ['0', '0']);
  assert.deepEqual(statisticValues(app, '流失'), ['0', '0']);

  const negotiating = app.caseStatusFilters.find(button => button.dataset.caseStatus === '洽談中');
  negotiating.emit('click');
  const fallbackCall = app.respond('getCase', rows[1]);
  assert.equal(fallbackCall.payload, rows[1].serialNumber);
  assert.equal(app.elements.caseCount.textContent, '1 筆');
  assert.match(app.elements.caseList.textContent, /CASE-LISA-OPEN新郎/);
  assert.ok(app.caseStatusFilters
    .filter(button => button.dataset.caseStatus === '洽談中')
    .every(button => button.classList.contains('is-active')));
  assert.deepEqual(statisticValues(app, ''), ['2', '2']);
});

test('可切換 Lisa、Jerry 與全部業務，並同步更新列表和統計', () => {
  const app = clientRuntime();
  const rows = [
    summary('CASE-LISA-BOOKED', 'Lisa', '已訂'),
    summary('CASE-LISA-OPEN', 'Lisa', ''),
    summary('CASE-JERRY-CANCELLED', 'Jerry', '退訂'),
    summary('CASE-JERRY-LOST', 'Jerry', '流失'),
  ];
  loadRows(app, rows);

  app.salesFilters[0].value = 'Jerry';
  app.salesFilters[0].emit('change');
  app.respond('getCase', rows[2]);
  assert.equal(app.elements.caseCount.textContent, '2 筆');
  assert.doesNotMatch(app.elements.caseList.textContent, /CASE-LISA/);
  assert.match(app.elements.caseList.textContent, /CASE-JERRY-CANCELLED/);
  assert.deepEqual(statisticValues(app, ''), ['2', '2']);
  assert.deepEqual(statisticValues(app, '流失'), ['1', '1']);

  app.salesFilters[1].value = '';
  app.salesFilters[1].emit('change');
  app.respond('getCase', rows[0]);
  assert.equal(app.elements.caseCount.textContent, '4 筆');
  assert.ok(app.salesFilters.every(select => select.value === ''));
  assert.match(app.elements.caseList.textContent, /CASE-LISA/);
  assert.match(app.elements.caseList.textContent, /CASE-JERRY/);
});

test('五種狀態顯示名稱正確對應正式狀態，空白狀態計入未下訂', () => {
  const rows = [
    summary('CASE-BOOKED', 'Lisa', '已訂'),
    summary('CASE-BLANK', 'Lisa', ''),
    summary('CASE-CANCELLED', 'Jerry', '退訂'),
    summary('CASE-LOST', 'Jerry', '流失'),
  ];
  const expectations = [
    ['已訂', 'CASE-BOOKED'],
    ['洽談中', 'CASE-BLANK'],
    ['退訂', 'CASE-CANCELLED'],
    ['流失', 'CASE-LOST'],
  ];

  for (const [status, serialNumber] of expectations) {
    const app = clientRuntime();
    loadRows(app, rows);
    statusFilter(app, status).emit('click');
    const expected = rows.find(row => row.serialNumber === serialNumber);
    app.respond('getCase', expected);
    assert.equal(app.elements.caseCount.textContent, '1 筆', status);
    assert.match(app.elements.caseList.textContent, new RegExp(serialNumber), status);
  }

  assert.match(index, /data-case-status="已訂"[\s\S]*?<span>已下訂<\/span>/);
  assert.match(index, /data-case-status="洽談中"[\s\S]*?<span>未下訂<\/span>/);
});

test('業務與狀態可疊加為 Lisa 已下訂或 Jerry 流失', () => {
  const rows = [
    summary('CASE-LISA-BOOKED', 'Lisa', '已訂'),
    summary('CASE-LISA-OPEN', 'Lisa', '洽談中'),
    summary('CASE-JERRY-CANCELLED', 'Jerry', '退訂'),
    summary('CASE-JERRY-LOST', 'Jerry', '流失'),
  ];

  for (const [salesName, status, expectedIndex] of [
    ['Lisa', '已訂', 0],
    ['Jerry', '流失', 3],
  ]) {
    const app = clientRuntime();
    loadRows(app, rows);
    app.salesFilters[0].value = salesName;
    app.salesFilters[0].emit('change');
    app.respond('getCase', rows.find(row => row.salesName === salesName));
    statusFilter(app, status).emit('click');
    app.respond('getCase', rows[expectedIndex]);
    assert.equal(app.elements.caseCount.textContent, '1 筆');
    assert.match(app.elements.caseList.textContent, new RegExp(rows[expectedIndex].serialNumber));
  }
});

test('搜尋、業務與狀態可疊加，搜尋文字保留且不縮小業務統計母集合', () => {
  const app = clientRuntime();
  const allRows = [
    summary('CASE-LISA-BOOKED', 'Lisa', '已訂'),
    summary('CASE-LISA-OPEN', 'Lisa', ''),
    summary('CASE-JERRY-BOOKED', 'Jerry', '已訂'),
    summary('CASE-JERRY-LOST', 'Jerry', '流失'),
  ];
  const searchRows = allRows.slice(0, 3);
  loadRows(app, allRows);

  app.input('caseSearch', '陳');
  app.flushTimers();
  const searchCall = app.respond('listCases', searchRows);
  assert.equal(searchCall.payload, '陳');
  app.respond('getCase', searchRows[0]);
  assert.equal(app.elements.caseCount.textContent, '3 筆');
  assert.equal(app.elements.caseSearch.value, '陳');
  assert.deepEqual(statisticValues(app, ''), ['4', '4']);

  app.salesFilters[0].value = 'Lisa';
  app.salesFilters[0].emit('change');
  app.respond('getCase', searchRows[0]);
  assert.equal(app.elements.caseCount.textContent, '2 筆');
  assert.deepEqual(statisticValues(app, ''), ['2', '2']);
  assert.deepEqual(statisticValues(app, '洽談中'), ['1', '1']);

  statusFilter(app, '已訂').emit('click');
  app.respond('getCase', searchRows[0]);
  assert.equal(app.elements.caseCount.textContent, '1 筆');
  assert.match(app.elements.caseList.textContent, /CASE-LISA-BOOKED/);
  assert.deepEqual(statisticValues(app, ''), ['2', '2']);

  app.salesFilters[1].value = '';
  app.salesFilters[1].emit('change');
  app.respond('getCase', searchRows[0]);
  assert.equal(app.elements.caseCount.textContent, '2 筆');
  assert.match(app.elements.caseList.textContent, /CASE-JERRY-BOOKED/);
  assert.equal(app.elements.caseSearch.value, '陳');
});

test('切換後沒有案件時清空詳細頁並顯示無資料訊息', () => {
  const app = clientRuntime();
  const lisa = summary('CASE-LISA-BOOKED', 'Lisa', '已訂');
  const jerry = summary('CASE-JERRY-LOST', 'Jerry', '流失');
  app.respond('listCases', [lisa, jerry]);
  app.respond('getCase', lisa);

  const cancelled = app.caseStatusFilters.find(button => button.dataset.caseStatus === '退訂');
  cancelled.emit('click');

  assert.equal(app.elements.caseCount.textContent, '0 筆');
  assert.equal(app.elements.caseList.children.length, 0);
  assert.equal(app.elements.detailContent.hidden, true);
  assert.equal(app.elements.detailState.textContent, '目前篩選條件下沒有案件');
  assert.equal(app.pending.filter(call => call.method === 'getCase').length, 0);
});

test('案件儲存為不同狀態後會離開目前篩選並切到下一筆', () => {
  const app = clientRuntime();
  const first = summary('CASE-LISA-OPEN-1', 'Lisa', '洽談中');
  const second = summary('CASE-LISA-OPEN-2', 'Lisa', '洽談中');
  first.editable = true;
  second.editable = true;
  app.respond('listCases', [first, second]);
  app.respond('getCase', first);

  const negotiatingFilter = app.caseStatusFilters.find(button => button.dataset.caseStatus === '洽談中');
  negotiatingFilter.emit('click');
  app.respond('getCase', first);

  app.statuses.find(button => button.dataset.status === '已訂').emit('click');
  app.elements.closedDate.value = '2026-09-13';
  app.elements.closedDate.emit('input');
  app.elements.saveCase.emit('click');
  app.respond('updateCase', {
    serialNumber: first.serialNumber,
    estimatedTables: first.estimatedTables,
    status: '已訂',
    closedDate: '2026-09-13',
    revisionToken: 'n'.repeat(43),
  });

  const nextCall = app.respond('getCase', second);
  assert.equal(nextCall.payload, second.serialNumber);
  assert.equal(app.elements.caseCount.textContent, '1 筆');
  assert.match(app.elements.caseList.textContent, /CASE-LISA-OPEN-2新郎/);
  assert.deepEqual(statisticValues(app, '已訂'), ['1', '1']);
  assert.deepEqual(statisticValues(app, '洽談中'), ['1', '1']);
});

test('篩選不增加 Server API，也不改變 listCases 的呼叫方式', () => {
  assert.match(client, /\.listCases\(query\)/);
  assert.match(client, /function filteredCases_\(\)/);
  assert.match(client, /function renderFilterSummary_\(\)/);
  assert.match(client, /const salesCases = allCases\.filter/);
  assert.doesNotMatch(client, /google\.script\.run[\s\S]{0,120}\.filterCases\(/);
});
