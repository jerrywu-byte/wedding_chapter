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

function summary(serialNumber, salesName, status = '洽談中') {
  return fixture({
    serialNumber,
    groomName: serialNumber + '新郎',
    brideName: serialNumber + '新娘',
    salesName,
    salesCode: String(salesName || '').toUpperCase(),
    status,
  });
}

function loadRows(app, rows) {
  app.respond('listCases', rows);
  app.respond('getCase', rows[0]);
}

test('業務篩選只有一份，位於左側搜尋欄下方與案件列表上方', () => {
  const searchPosition = index.indexOf('<label class="followup-search">');
  const salesFilterPosition = index.indexOf(
    '<label class="followup-sales-filter followup-list-sales-filter">',
  );
  const listSummaryPosition = index.indexOf('<div class="followup-list-summary">');
  const detailPanelPosition = index.indexOf('<section class="followup-detail-panel"');
  const salesSelects = index.match(/<select\b[^>]*data-sales-filter[^>]*>/g) || [];

  assert.ok(searchPosition >= 0);
  assert.ok(salesFilterPosition > searchPosition);
  assert.ok(listSummaryPosition > salesFilterPosition);
  assert.ok(detailPanelPosition > listSummaryPosition);
  assert.equal(salesSelects.length, 1);
  assert.doesNotMatch(index, /followup-filter-panel|followup-mobile-filters/);
  assert.doesNotMatch(index, /data-case-status|data-stat-status|案件狀態統計與篩選/);

  assert.match(styles, /\.followup-list-sales-filter \{ margin-top: 12px; \}/);
  assert.match(styles, /\.followup-sales-filter select \{[\s\S]*?min-height: 44px;/);
  assert.doesNotMatch(styles, /followup-filter-panel|followup-mobile-stat-grid|followup-stat-list/);
});

test('業務選項維持既有正式名單且不建立第二份 dropdown', () => {
  assert.equal((index.match(/<option value="">全部業務<\/option>/g) || []).length, 1);
  for (const salesName of ['April', 'Sean', 'Jimmy', 'Lisa', 'Nidia', 'Jerry', 'Elle']) {
    const option = new RegExp(
      '<option value="' + salesName + '">' + salesName + '</option>',
      'g',
    );
    assert.equal((index.match(option) || []).length, 1, salesName);
  }
});

test('首次載入預設全部業務並顯示完整案件筆數', () => {
  const app = clientRuntime();
  const rows = [
    summary('CASE-LISA', 'Lisa'),
    summary('CASE-JERRY', 'Jerry'),
  ];
  loadRows(app, rows);

  assert.equal(app.salesFilters.length, 1);
  assert.equal(app.salesFilters[0].value, '');
  assert.equal(app.elements.caseCount.textContent, '2 筆');
});

test('選擇業務只顯示該業務案件，全部業務恢復完整列表', () => {
  const app = clientRuntime();
  const rows = [
    summary('CASE-LISA-1', 'Lisa'),
    summary('CASE-LISA-2', 'Lisa'),
    summary('CASE-JERRY-1', 'Jerry'),
    summary('CASE-JERRY-2', 'Jerry'),
  ];
  loadRows(app, rows);

  app.salesFilters[0].value = 'Lisa';
  app.salesFilters[0].emit('change');
  app.respond('getCase', rows[0]);
  assert.equal(app.elements.caseCount.textContent, '2 筆');
  assert.match(app.elements.caseList.textContent, /CASE-LISA-1/);
  assert.doesNotMatch(app.elements.caseList.textContent, /CASE-JERRY/);

  app.salesFilters[0].value = 'Jerry';
  app.salesFilters[0].emit('change');
  assert.equal(app.elements.caseCount.textContent, '2 筆');
  assert.doesNotMatch(app.elements.caseList.textContent, /CASE-LISA/);
  assert.match(app.elements.caseList.textContent, /CASE-JERRY-1/);
  assert.equal(app.pending.filter(call => call.method === 'getCase').length, 0);

  app.elements.caseList.children[0].emit('click');
  app.respond('getCase', rows[2]);

  app.salesFilters[0].value = '';
  app.salesFilters[0].emit('change');
  app.respond('getCase', rows[2]);
  assert.equal(app.elements.caseCount.textContent, '4 筆');
  assert.match(app.elements.caseList.textContent, /CASE-LISA/);
  assert.match(app.elements.caseList.textContent, /CASE-JERRY/);
});

test('搜尋與業務篩選疊加，切換業務不會清除搜尋文字', () => {
  const app = clientRuntime();
  const allRows = [
    summary('CASE-LISA-CHEN', 'Lisa'),
    summary('CASE-JERRY-CHEN', 'Jerry'),
    summary('CASE-LISA-WANG', 'Lisa'),
  ];
  const searchRows = allRows.slice(0, 2);
  loadRows(app, allRows);

  app.input('caseSearch', '陳');
  app.flushTimers();
  const searchCall = app.respond('listCases', searchRows);
  assert.equal(searchCall.payload, '陳');
  app.respond('getCase', searchRows[0]);

  app.salesFilters[0].value = 'Lisa';
  app.salesFilters[0].emit('change');
  app.respond('getCase', searchRows[0]);
  assert.equal(app.elements.caseSearch.value, '陳');
  assert.equal(app.elements.caseCount.textContent, '1 筆');
  assert.match(app.elements.caseList.textContent, /CASE-LISA-CHEN/);
  assert.doesNotMatch(app.elements.caseList.textContent, /CASE-JERRY-CHEN/);

  app.salesFilters[0].value = 'Jerry';
  app.salesFilters[0].emit('change');
  assert.equal(app.elements.caseSearch.value, '陳');
  assert.equal(app.elements.caseCount.textContent, '1 筆');
  assert.match(app.elements.caseList.textContent, /CASE-JERRY-CHEN/);
  assert.equal(app.pending.filter(call => call.method === 'getCase').length, 0);
});

test('選中案件被新業務篩選排除時清除選取並重置 CASE DETAIL', () => {
  const app = clientRuntime();
  const jerry = summary('CASE-JERRY', 'Jerry');
  const lisa = summary('CASE-LISA', 'Lisa');
  loadRows(app, [jerry, lisa]);

  app.salesFilters[0].value = 'Lisa';
  app.salesFilters[0].emit('change');

  assert.equal(app.elements.caseCount.textContent, '1 筆');
  assert.equal(app.elements.detailHeading.hidden, true);
  assert.equal(app.elements.detailContent.hidden, true);
  assert.equal(app.elements.detailState.hidden, false);
  assert.equal(app.elements.detailState.textContent, '請從左側案件列表選擇案件');
  assert.ok(app.elements.caseList.children.every(item => !item.classList.contains('is-selected')));
  assert.equal(app.pending.filter(call => call.method === 'getCase').length, 0);

  app.elements.caseList.children[0].emit('click');
  const detailCall = app.respond('getCase', lisa);
  assert.equal(detailCall.payload, lisa.serialNumber);
  assert.equal(app.elements.detailContent.hidden, false);
});

test('手機版共用左側業務篩選且列表、詳細、返回流程不受影響', () => {
  const app = clientRuntime();
  const row = summary('CASE-MOBILE', 'Lisa');
  loadRows(app, [row]);

  assert.equal(app.salesFilters.length, 1);
  assert.ok(index.indexOf('followup-list-sales-filter') < index.indexOf('id="caseList"'));

  app.elements.caseList.children[0].emit('click');
  assert.ok(app.elements.followupShell.classList.contains('followup-shell--detail'));
  app.elements.backToList.emit('click');
  assert.equal(app.elements.followupShell.classList.contains('followup-shell--detail'), false);
});

test('業務篩選不增加 Server API 且 listCases 搜尋方式維持不變', () => {
  assert.match(client, /\.listCases\(query\)/);
  assert.match(client, /function filteredCases_\(\)/);
  assert.match(client, /return cases\.filter\(caseMatchesSalesFilter_\);/);
  assert.doesNotMatch(client, /google\.script\.run[\s\S]{0,120}\.filterCases\(/);
});
