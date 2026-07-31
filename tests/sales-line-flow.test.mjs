import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(path, "utf8");
const runner = read("presentation/components/WeddingExperienceRunner.tsx");
const sales = read("lib/banquetPlanners.ts");
const client = read("lib/weddingChapterSubmission.ts");
const api = read("app/api/submissions/route.ts");
const gas = read("google-apps-script/Code.gs");
const css = read("presentation/styles/wedding-experience-enhancements.css");

const expectedSales = [
  ["April", "APRIL", "https://maac.io/3eqps"],
  ["Sean", "SEAN", "https://maac.io/3eqA9"],
  ["Jimmy", "JIMMY", "https://maac.io/3eqAK"],
  ["Lisa", "LISA", "https://maac.io/3eHta"],
  ["Nidia", "NIDIA", "https://maac.io/3eHII"],
  ["Jerry", "JERRY", "https://maac.io/3eHRf"],
  ["Elle", "ELLE", "https://maac.io/4BCtc"],
];

test("七位業務名稱、程式值與 LINE 網址集中在 SALES_OPTIONS", () => {
  assert.match(sales, /export const SALES_OPTIONS/);
  for (const [label, value, lineUrl] of expectedSales) {
    assert.match(sales, new RegExp(`label: "${label}", value: "${value}", lineUrl: "${lineUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  assert.match(sales, /getBanquetPlannerCode/);
  assert.match(sales, /getSalesLineUrl/);
  assert.doesNotMatch(runner, /maac\.io/);
});

test("業務選單位於基本資料最下方並在進入按鈕之前", () => {
  const tableIndex = runner.indexOf("預計桌數");
  const actionsIndex = runner.indexOf('className="wx-profile-actions"');
  const plannerIndex = runner.indexOf('id="banquet-planner"');
  const enterIndex = runner.indexOf("進入我們的婚禮故事");
  assert.ok(tableIndex >= 0 && tableIndex < actionsIndex);
  assert.ok(actionsIndex < plannerIndex && plannerIndex < enterIndex);
  assert.match(runner, /請先選擇接待您的業務人員/);
  assert.match(runner, /plannerSelectRef\.current\?\.focus/);
});

test("送至 Sheet 的值由統一設定轉為大寫 salesCode", () => {
  assert.match(client, /const salesCode = getBanquetPlannerCode\(profile\.banquetPlanner\)/);
  assert.match(client, /salesCode,/);
  assert.match(gas, /normalized\.salesCode/);
  for (const [, value] of expectedSales) assert.match(gas, new RegExp(`\\['${value}'`));
});

test("LINE 按鈕只在 Sheet 成功並取得流水號後顯示", () => {
  assert.match(runner, /await submitWeddingChapter\(payload\)/);
  assert.match(runner, /update\(\{ submissionNumber: saved\.serialNumber/);
  assert.match(runner, /session\.submissionNumber \? <div className="wx-submission-success"/);
  assert.match(runner, /salesLineUrl \? <>/);
  assert.match(runner, /前往官方 LINE 完成報到/);
  assert.match(runner, /target="_blank"/);
  assert.match(runner, /rel="noopener noreferrer"/);
  assert.doesNotMatch(runner, /window\.open|location\.(?:assign|replace|href)/);
});

test("成功頁將 serialNumber 顯示為訪客編號", () => {
  assert.match(runner, /訪客編號：<strong>\{session\.submissionNumber\}/);
  assert.doesNotMatch(runner, /流水編號：/);
});

test("找不到業務網址時保留成功與流水號但不建立錯誤連結", () => {
  assert.match(runner, /資料已成功送出，請由現場服務人員協助加入官方 LINE。/);
  assert.match(runner, /console\.warn\("Wedding Chapter 無法識別業務 LINE 網址"/);
  assert.doesNotMatch(sales, /fallback/i);
});

test("Sheet 失敗可重新送出且成功前不顯示 LINE", () => {
  assert.match(runner, /catch \(error\)/);
  assert.match(runner, /finally \{[\s\S]*submitLock\.current = false;[\s\S]*setSubmitting\(false\)/);
  assert.match(runner, /submitting \? "資料送出中…" : "完成並送出"/);
  assert.match(client, /!body\.success/);
  assert.match(client, /body\.message \|\| body\.error/);
  assert.match(client, /!body\.serialNumber\?\.trim\(\)/);
  assert.match(api, /message:/);
  assert.match(gas, /message:/);
});

test("正式送出不寄 Email 且不產生任何文件", () => {
  const submissionCode = [client, api, gas].join("\n");
  assert.doesNotMatch(submissionCode, /MailApp|GmailApp|sendEmail|buildEmail|@denwell\.com/);
  assert.doesNotMatch(submissionCode, /DocumentApp|DriveApp|MimeType\.PDF|DOCX|createPdf|createWord|replaceText/);
});

test("重複點擊由前端鎖與 Apps Script idempotency 雙重保護", () => {
  assert.match(runner, /if \(submitLock\.current \|\| session\.submissionNumber\) return/);
  assert.match(client, /activeSubmissions\.get\(payload\.submissionId\)/);
  assert.match(gas, /LockService\.getScriptLock\(\)/);
  assert.match(gas, /findSubmissionById_/);
  assert.match(gas, /status: 'ALREADY_SAVED'/);
});

test("手機版業務選單與按鈕單欄且不會橫向溢出", () => {
  assert.match(css, /@media\(max-width:760px\)\{\.wx-profile-actions\{grid-template-columns:minmax\(0,1fr\);width:100%/);
  assert.match(css, /\.wx-profile-actions>\.wx-primary\{width:100%;min-width:0\}/);
});
