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
const profileSubmission = runner.slice(runner.indexOf("const submitProfile"), runner.indexOf("const answer"));
const endingView = runner.slice(runner.indexOf('{session.step === "ending"'));

test("業務名稱、代碼與 LINE 網址由業務資料分頁動態讀取", () => {
  assert.match(sales, /loadSalesOptions/);
  assert.match(sales, /action: "getSalesOptions"/);
  assert.match(gas, /getSalesOptions_/);
  assert.match(gas, /'LINE連結', '啟用'/);
  assert.match(sales, /getBanquetPlannerCode/);
  assert.match(sales, /getSalesLineUrl/);
  assert.doesNotMatch(runner, /maac\.io/);
  assert.doesNotMatch(sales, /maac\.io|APRIL|JERRY/);
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

test("送至 Sheet 的值由目前業務名單轉為大寫 salesCode", () => {
  assert.match(client, /const salesCode = getBanquetPlannerCode\(profile\.banquetPlanner, salesOptions\)/);
  assert.match(client, /salesCode,/);
  assert.match(gas, /normalized\.salesCode/);
  assert.match(gas, /cleanText_\(row\[0\]\)\.toUpperCase\(\)/);
});

test("基本資料成功寫入 Sheet 並取得訪客編號後才進入體驗", () => {
  assert.match(profileSubmission, /const payload = createWeddingChapterSubmission\(\{ \.\.\.session, profile \}, salesOptions\)/);
  assert.match(profileSubmission, /await submitWeddingChapter\(payload\)/);
  assert.match(profileSubmission, /submissionNumber: saved\.serialNumber/);
  assert.match(profileSubmission, /submittedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(profileSubmission, /step: "opening"/);
  assert.ok(profileSubmission.indexOf("await submitWeddingChapter(payload)") < profileSubmission.lastIndexOf('step: "opening"'));
});

test("LINE 按鈕在完成頁沿用已建立案件的訪客編號", () => {
  assert.match(endingView, /className="wx-submission-success"/);
  assert.match(runner, /salesLineUrl \? <>/);
  assert.match(runner, /前往官方 LINE 完成報到/);
  assert.match(runner, /target="_blank"/);
  assert.match(runner, /rel="noopener noreferrer"/);
  assert.doesNotMatch(runner, /window\.open|location\.(?:assign|replace|href)/);
});

test("完成頁改由宴會顧問接續服務且 LINE URL 流程不變", () => {
  assert.match(endingView, /讓宴會顧問接續為你們服務。/);
  assert.doesNotMatch(endingView, /讓婚禮顧問接續為你們服務。/);
  assert.match(endingView, /href=\{salesLineUrl\}/);
});

test("成功頁將 serialNumber 顯示為訪客編號", () => {
  assert.match(runner, /訪客編號：<strong>\{session\.submissionNumber\}/);
  assert.doesNotMatch(runner, /流水編號：/);
});

test("找不到業務網址時保留成功與訪客編號但不建立錯誤連結", () => {
  assert.match(runner, /資料已成功送出，請由現場服務人員協助加入官方 LINE。/);
  assert.match(runner, /console\.warn\("Wedding Chapter 無法識別業務 LINE 網址"/);
  assert.doesNotMatch(sales, /fallback/i);
});

test("基本資料送出失敗時保留頁面並允許重試", () => {
  assert.match(profileSubmission, /catch \{/);
  assert.match(profileSubmission, /資料送出失敗，請稍後再試。/);
  assert.match(profileSubmission, /finally \{[\s\S]*submitLock\.current = false;[\s\S]*setSubmitting\(false\)/);
  assert.match(runner, /disabled=\{submitting\}/);
  assert.match(runner, /submitting \? "正在建立新人資料…"/);
  const catchBlock = profileSubmission.slice(profileSubmission.indexOf("catch"), profileSubmission.indexOf("finally"));
  assert.doesNotMatch(catchBlock, /step: "opening"|go\("opening"\)/);
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

test("業務名單採 simple request 且不把 Email 回傳前端", () => {
  assert.match(sales, /text\/plain;charset=utf-8/);
  assert.doesNotMatch(sales, /application\/json|Authorization|no-cors/);
  const salesOptionsFunction = gas.slice(gas.indexOf("function getSalesOptions_"), gas.indexOf("function isSalesEnabled_"));
  assert.doesNotMatch(salesOptionsFunction, /salesEmail|row\[2\]/);
  assert.match(salesOptionsFunction, /lineUrl/);
});

test("重複點擊由前端鎖與 Apps Script idempotency 雙重保護", () => {
  assert.match(profileSubmission, /foundErrors\.length \|\| submitLock\.current/);
  assert.match(profileSubmission, /if \(session\.submissionNumber\) \{[\s\S]*step: "opening"[\s\S]*return;/);
  assert.match(client, /activeSubmissions\.get\(payload\.submissionId\)/);
  assert.match(gas, /LockService\.getScriptLock\(\)/);
  assert.match(gas, /findSubmissionById_/);
  assert.match(gas, /status: 'ALREADY_SAVED'/);
});

test("sessionStorage 保留 submissionId 與訪客編號，重新整理不建立第二案", () => {
  assert.match(runner, /sessionStorage\.setItem\(key\(experienceId\), JSON\.stringify\(session\)\)/);
  assert.match(runner, /submissionClientId: raw\.submissionClientId \|\| base\.submissionClientId/);
  assert.match(runner, /submissionNumber: raw\.submissionNumber \|\| null/);
  assert.match(runner, /if \(step !== "profile" && !raw\.submissionNumber\) step = "profile"/);
  assert.match(client, /submissionId: session\.submissionClientId/);
});

test("最後完成篇章不再建立案件或呼叫 submission API", () => {
  assert.doesNotMatch(endingView, /createWeddingChapterSubmission|submitWeddingChapter|completeChapter|完成並送出|資料送出中/);
  assert.match(endingView, /Wedding Chapter 已完成/);
  assert.match(endingView, /訪客編號：<strong>\{session\.submissionNumber\}/);
});

test("手機版業務選單與按鈕單欄且不會橫向溢出", () => {
  assert.match(css, /@media\(max-width:760px\)\{\.wx-profile-actions\{grid-template-columns:minmax\(0,1fr\);width:100%/);
  assert.match(css, /\.wx-profile-actions>\.wx-primary\{width:100%;min-width:0\}/);
});
