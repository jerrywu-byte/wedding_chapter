import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { clientRuntime, fixture } from './helpers/followup-client-runtime.mjs';

const client = fs.readFileSync(
  new URL('../google-apps-script/followup-auth-test/Client.html', import.meta.url),
  'utf8',
);
const styles = fs.readFileSync(
  new URL('../google-apps-script/followup-auth-test/Styles.html', import.meta.url),
  'utf8',
);
const server = fs.readFileSync(
  new URL('../google-apps-script/followup-auth-test/Code.gs', import.meta.url),
  'utf8',
);

function markerState(overrides) {
  const ui = clientRuntime();
  ui.open(fixture(overrides));
  const markers = ui.primaryMarkers();
  assert.equal(markers.length, 2);
  markers.forEach((checkbox) => {
    assert.equal(checkbox.disabled, true);
    assert.equal(checkbox.readOnly, true);
  });
  return { ui, checked: markers.map(checkbox => checkbox.checked) };
}

test('H 等於新郎姓名時只勾選新郎主要聯絡人', () => {
  assert.deepEqual(markerState({ primaryContactName: '測試新郎' }).checked, [true, false]);
});

test('H 等於新娘姓名時只勾選新娘主要聯絡人', () => {
  assert.deepEqual(markerState({ primaryContactName: '測試新娘' }).checked, [false, true]);
});

test('H 空白或未知姓名時兩邊皆不勾選', () => {
  assert.deepEqual(markerState({ primaryContactName: '   ' }).checked, [false, false]);
  assert.deepEqual(markerState({ primaryContactName: '未知姓名' }).checked, [false, false]);
});

test('主要聯絡人與新人姓名會先 trim 再比對', () => {
  assert.deepEqual(markerState({
    primaryContactName: '  測試新郎  ',
    groomName: ' 測試新郎 ',
  }).checked, [true, false]);
});

test('ADMINISTRATOR、USER 與他人案件皆顯示相同唯讀標記', () => {
  assert.deepEqual(markerState({ editable: true, primaryContactName: '測試新郎' }).checked, [true, false]);
  assert.deepEqual(markerState({ editable: false, primaryContactName: '測試新郎' }).checked, [true, false]);
});

test('姓名格只渲染 disabled 標記且未新增任何 write API', () => {
  const { ui } = markerState({ primaryContactName: '測試新娘' });
  assert.equal(ui.calls.some(call => /primarycontact/i.test(call.method)), false);
  assert.doesNotMatch(client, /updatePrimaryContact|setPrimaryContact|savePrimaryContact/);
});

test('getCase 已回傳 H/I，updateCase 寫入仍限定 M 與 P:T', () => {
  const detailMapping = server.slice(
    server.indexOf('function mapCaseDetail_'),
    server.indexOf('function locateCaseBySerial_'),
  );
  const writer = server.slice(server.indexOf('function writeCaseFields_'), server.indexOf('function createIdentityToken_'));
  assert.match(detailMapping, /primaryContactName: cleanText_\(row\[FOLLOWUP_COLUMNS_\.primaryContactName\]\)/);
  assert.match(detailMapping, /primaryContactPhone: cleanText_\(row\[FOLLOWUP_COLUMNS_\.primaryContactPhone\]\)/);
  assert.match(writer, /quoteSheetRange_\('M' \+ rowNumber\)/);
  assert.match(writer, /quoteSheetRange_\('P' \+ rowNumber\)/);
  assert.doesNotMatch(writer, /quoteSheetRange_\('[HI]' \+ rowNumber\)/);
});

test('桌機與手機沿用既有 grid，姓名標記可換行且頁面禁止水平溢出', () => {
  assert.match(styles, /\.followup-basic-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /@media \(max-width:\s*980px\)[\s\S]*?\.followup-basic-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /@media \(max-width:\s*760px\)[\s\S]*?\.followup-basic-grid\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(styles, /\.followup-name-value\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(styles, /body\s*\{\s*overflow-x:\s*hidden/);
});
