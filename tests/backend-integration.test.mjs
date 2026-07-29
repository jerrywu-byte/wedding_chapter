import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = readFileSync("presentation/components/WeddingExperienceRunner.tsx", "utf8");
const api = readFileSync("app/api/submissions/route.ts", "utf8");
const client = readFileSync("lib/weddingChapterSubmission.ts", "utf8");
const planners = readFileSync("lib/banquetPlanners.ts", "utf8");
const gas = readFileSync("google-apps-script/Code.gs", "utf8");
const deployDocs = readFileSync("docs/Backend-Deployment.md", "utf8");

test("完成按鈕只在正式儲存成功後顯示流水號", () => {
  assert.match(runner, /await submitWeddingChapter/);
  assert.match(runner, /saved\.serialNumber/);
  assert.doesNotMatch(runner, /PDF|寄給|plannerEmail/);
  assert.match(client, /fetch\("\/api\/submissions"/);
});

test("網站 API 僅提交第一階段基本資料", () => {
  for (const field of [
    "submissionId", "partner1Name", "partner1Phone", "partner2Name",
    "partner2Phone", "emergencyContactName", "emergencyContactPhone",
    "weddingDate", "dateUndecided", "banquetSession", "estimatedTables", "salesCode",
  ]) assert.match(client, new RegExp(field));
  assert.doesNotMatch(client, /personality|recommendations|answers|salesEmail/i);
});

test("API 使用伺服器端環境變數並處理錯誤與逾時", () => {
  assert.match(api, /GOOGLE_APPS_SCRIPT_WEB_APP_URL/);
  assert.doesNotMatch(api, /NEXT_PUBLIC_/);
  assert.match(api, /AbortSignal\.timeout\(30000\)/);
  assert.match(api, /無效 JSON/);
  assert.match(api, /status:\s*503/);
  assert.match(api, /ALREADY_SAVED/);
});

test("Google Apps Script POST 使用 simple request 並保留可讀 JSON 回應", () => {
  assert.match(client, /text\/plain;charset=utf-8/);
  assert.match(api, /text\/plain;charset=utf-8/);
  assert.doesNotMatch(client, /application\/json/);
  assert.doesNotMatch(client, /mode:\s*["']no-cors["']/);
  assert.doesNotMatch(client, /Authorization/);
  assert.match(client, /await response\.json\(\)/);
  assert.match(client, /!body\.success/);
  assert.match(gas, /JSON\.parse\(e\.postData\.contents\)/);
  assert.match(gas, /createTextOutput\(JSON\.stringify\(body\)\)/);
  assert.match(gas, /ContentService\.MimeType\.JSON/);
});

test("前端只有業務代碼，不含業務 Email", () => {
  assert.match(planners, /APRIL/);
  assert.match(planners, /getBanquetPlannerCode/);
  assert.doesNotMatch(planners, /@denwell\.com/);
});

test("Apps Script 使用三張中文工作表、Lock 與防重複", () => {
  for (const sheet of ["新人資料", "業務資料", "系統設定"]) assert.match(gas, new RegExp(sheet));
  assert.match(gas, /setupWeddingChapterSheets/);
  assert.match(gas, /LockService\.getScriptLock\(\)/);
  assert.match(gas, /findSubmissionById_/);
  assert.match(gas, /ALREADY_SAVED/);
  assert.match(gas, /FIRST_SERIAL_SEQUENCE = 2001/);
  assert.doesNotMatch(gas, /MailApp|MimeType\.PDF/);
});

test("部署文件只要求正式 /exec URL", () => {
  assert.match(deployDocs, /GOOGLE_APPS_SCRIPT_WEB_APP_URL/);
  assert.match(deployDocs, /\/exec/);
  assert.doesNotMatch(deployDocs, /WEDDING_CHAPTER_SHARED_SECRET/);
});
