import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isDevelopmentPreviewRequest } from "../lib/developmentPreviewGate.js";

const runner = readFileSync("presentation/components/WeddingExperienceRunner.tsx", "utf8");
const fixture = readFileSync("lib/developmentPreview.ts", "utf8");
const gate = readFileSync("lib/developmentPreviewGate.js", "utf8");
const main = readFileSync("github-pages/main.tsx", "utf8");
const downloadPanel = readFileSync("components/personality/PersonalityDownloadPanel.tsx", "utf8");

const previewSession = runner.slice(
  runner.indexOf("function createDevelopmentPreviewSession"),
  runner.indexOf("export default function WeddingExperienceRunner"),
);
const profileSubmission = runner.slice(
  runner.indexOf("const submitProfile"),
  runner.indexOf("const answer"),
);

test("development 加 preview=1 才能跳過基本資料", () => {
  assert.equal(isDevelopmentPreviewRequest(true, "?preview=1"), true);
  assert.equal(isDevelopmentPreviewRequest(true, "?preview=0"), false);
  assert.equal(isDevelopmentPreviewRequest(true, ""), false);
  assert.match(runner, /isDevelopmentPreviewRequest\(import\.meta\.env\.DEV/);
  assert.match(previewSession, /step: "opening"/);
});

test("Preview submit guard 在正式 payload 與 API 呼叫前直接返回", () => {
  const guard = profileSubmission.indexOf("if (developmentPreview)");
  const createPayload = profileSubmission.indexOf("createWeddingChapterSubmission");
  const submitApi = profileSubmission.indexOf("submitWeddingChapter");
  assert.ok(guard >= 0);
  assert.ok(createPayload > guard);
  assert.ok(submitApi > guard);
  assert.match(profileSubmission.slice(guard, createPayload), /return;/);
});

test("Preview 不建立訪客編號或 submission identifier", () => {
  assert.match(previewSession, /submissionClientId: ""/);
  assert.match(previewSession, /submissionNumber: null/);
  assert.match(previewSession, /submittedAt: null/);
  assert.doesNotMatch(previewSession, /newClientSubmissionId|randomUUID|serialNumber|duplicateKey/);
  assert.match(runner, /沒有建立訪客編號/);
});

test("Preview fixture 僅在前端記憶體使用且不寫 Google Sheet", () => {
  assert.doesNotMatch(fixture + gate, /Google|Sheet|Apps Script|fetch\(|submissionId|duplicateKey/);
  assert.match(runner, /if \(!developmentPreview\) sessionStorage\.setItem/);
  assert.match(runner, /if \(developmentPreview\) \{\s*setSalesOptions\(\[DEVELOPMENT_PREVIEW_SALES_OPTION\]\)/);
  assert.match(runner, /if \(developmentPreview\) \{[\s\S]*?setSalesLoading\(false\);[\s\S]*?return;[\s\S]*?loadSalesOptions\(\)/);
});

test("production 即使有 preview=1 也不能 bypass", () => {
  assert.equal(isDevelopmentPreviewRequest(false, "?preview=1"), false);
  assert.equal(isDevelopmentPreviewRequest(false, "?preview=1&step=opening"), false);
  assert.match(gate, /Boolean\(isDevelopment\)/);
  assert.match(runner, /import\.meta\.env\.DEV/);
});

test("production 正常流程仍要求全部基本資料", () => {
  for (const required of [
    "請先選擇接待您的業務人員",
    "請填寫新郎姓名",
    "請填寫正確的新郎電話",
    "請填寫新娘姓名",
    "請填寫正確的新娘電話",
    "請選擇婚禮日期，或勾選未決定日期",
    "請選擇午宴、晚宴或都可以",
    "請選擇預計桌數",
  ]) assert.match(runner, new RegExp(required));
  assert.match(runner, /if \(step !== "profile" && !raw\.submissionNumber\) step = "profile"/);
});

test("production submission 行為保持原本建立 payload、送出與取得訪客編號", () => {
  assert.match(profileSubmission, /const payload = createWeddingChapterSubmission\(\{ \.\.\.session, profile \}, salesOptions\)/);
  assert.match(profileSubmission, /const saved = await submitWeddingChapter\(payload\)/);
  assert.match(profileSubmission, /submissionNumber: saved\.serialNumber/);
  assert.match(profileSubmission, /submittedAt: new Date\(\)\.toISOString\(\)/);
});

test("Preview 可從 opening 進入並完成五題測驗", () => {
  assert.match(previewSession, /step: "opening"/);
  assert.match(runner, /onClick=\{\(\) => go\("quiz"\)\}/);
  assert.match(runner, /getActiveQuizQuestions\(\)/);
  assert.match(runner, /currentQuestionIndex < questions\.length - 1/);
  assert.match(runner, /quizAnswers:/);
});

test("Preview 可從測驗進入人格結果", () => {
  assert.match(runner, /const personalityResult = calculateQuizResult\(session\.quizAnswers\)/);
  assert.match(runner, /step: "personality-result"/);
  assert.match(runner, /PersonalityCard personality=\{personality\}/);
});

test("Preview 可使用原推薦演算法進入推薦廳房", () => {
  assert.match(runner, /rankHallsForBasicInfo/);
  assert.match(runner, /venueRecommendations: found\.recommendations\.slice\(0, 3\)/);
  assert.match(runner, /step: "venue-result"/);
  assert.match(runner, /getVenuePhotoSrc\(recommendation\.hallId\)/);
});

test("Preview 共用正式人格 QR、下載、手機結果與 LINE 完成頁元件", () => {
  assert.match(runner, /PersonalityDownloadPanel/);
  assert.match(downloadPanel, /QRCode\.toDataURL/);
  assert.match(main, /PersonalityDownloadPage/);
  assert.match(fixture, /label: "Jerry"/);
  assert.match(fixture, /lineUrl: "https:\/\/line\.me\/"/);
  assert.match(runner, /className="wx-line-button"/);
  assert.match(runner, /PREVIEW MODE/);
});
