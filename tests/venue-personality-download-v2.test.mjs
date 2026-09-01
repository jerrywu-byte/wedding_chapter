import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import QRCode from "qrcode";

const require = createRequire(import.meta.url);
const runner = readFileSync("presentation/components/WeddingExperienceRunner.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const exportCard = readFileSync("components/personality/PersonalityExportCard.tsx", "utf8");
const downloadPage = readFileSync("components/personality/PersonalityDownloadPage.tsx", "utf8");
const downloadPanel = readFileSync("components/personality/PersonalityDownloadPanel.tsx", "utf8");
const main = readFileSync("github-pages/main.tsx", "utf8");

const expectedAssets = {
  floral: "floral",
  mushi: "mushi",
  yano: "yano",
  arthur: "arthur",
  elizabeth: "elizabeth",
  edinburgh: "edinburgh",
  green: "green",
  "purple-good": "purple-good",
  "purple-happiness": "purple-happiness",
  "purple-grand": "purple-grand",
  century: "century",
  ceremony: "ceremony",
};

let hallPresentation;
let downloadUrl;
let bundleDirectory;

before(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), "wedding-download-v2-"));
  await Promise.all([
    build({ entryPoints: [new URL("../lib/hallPresentation.ts", import.meta.url).pathname], outfile: join(bundleDirectory, "hall.cjs"), bundle: true, platform: "node", format: "cjs", logLevel: "silent" }),
    build({ entryPoints: [new URL("../lib/personalityDownloadUrl.ts", import.meta.url).pathname], outfile: join(bundleDirectory, "url.cjs"), bundle: true, platform: "node", format: "cjs", logLevel: "silent" }),
  ]);
  hallPresentation = require(join(bundleDirectory, "hall.cjs"));
  downloadUrl = require(join(bundleDirectory, "url.cjs"));
});

after(async () => {
  if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
});

test("12 個正式廳房都有固定 hall id 圖片 mapping 與原始檔", () => {
  assert.deepEqual(Object.keys(hallPresentation.VENUE_PHOTO_BY_HALL_ID), [...Object.keys(expectedAssets), "nordic-light"]);
  for (const [hallId, assetName] of Object.entries(expectedAssets)) {
    const webPath = hallPresentation.getVenuePhotoPath(hallId);
    assert.equal(webPath, `/venue-photos/web/${assetName}.webp`);
    assert.ok(existsSync(`public${webPath}`), `${webPath} 不存在`);
    assert.ok(statSync(`public${webPath}`).size > 20_000, `${webPath} 不是有效圖片`);
    const original = ["jpg", "png"].map((extension) => `public/venue-photos/original/${assetName}.${extension}`).find(existsSync);
    assert.ok(original, `${hallId} 原始照片未保留`);
  }
});

test("不存在的 hall id 不提供照片，不以陣列 index 猜圖", () => {
  assert.equal(hallPresentation.getVenuePhotoPath("not-a-hall"), null);
  assert.doesNotMatch(readFileSync("lib/hallPresentation.ts", "utf8"), /indexOf|findIndex|\[index\]/);
});

test("推薦頁每張卡片以照片為主並保留精簡桌數與特色", () => {
  assert.match(runner, /<VenuePhoto /);
  assert.match(runner, /getVenuePhotoSrc\(recommendation\.hallId\)/);
  assert.match(runner, /getVenueShortDescription\(hall\)/);
  assert.match(runner, /capacity\.minimumTables/);
  assert.match(css, /\.wx-hall-photo\{[^}]*aspect-ratio:4\/3/);
  assert.match(css, /\.wx-hall-photo img\{[^}]*object-fit:cover[^}]*object-position:center/);
});

test("推薦 1、2、3 張卡片及手機單欄皆有對應樣式", () => {
  assert.match(css, /:has\(>article:only-child\)/);
  assert.match(css, /:has\(>article:nth-child\(2\):last-child\)/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.wx-halls[\s\S]*grid-template-columns:1fr/);
  assert.match(runner, /venueRecommendations\.map/);
});

test("新 9:16 人格圖包含正式要求的所有內容", () => {
  assert.match(exportCard, /data-export-ratio="9:16"/);
  for (const value of ["displayName", "subtitle", "description", "aiSecret", "observations", "scene", "specialAbility"]) {
    assert.match(exportCard, new RegExp(`personality\\.${value}`));
  }
  for (const label of ["AI 偷偷發現", "婚禮現場觀察", "婚禮流程小劇場", "人格特殊能力", "推薦廳房"]) {
    assert.match(exportCard, new RegExp(label));
  }
  assert.match(css, /\.personality-export-card\{width:1080px;height:1920px/);
});

test("舊人格卡 preview/share/download flow 不再由正式 Runner 使用", () => {
  assert.doesNotMatch(runner, /PersonalityCardPreviewModal|openCardPreview|sharePersonalityCard|navigator\.share|mode="download"/);
  assert.match(runner, /PersonalityDownloadPanel/);
  assert.match(main, /PersonalityDownloadPage/);
});

test("QR Code 可產生且公開 URL 只含人格與廳房 id", async () => {
  global.window = { location: { origin: "https://jerrywu-byte.github.io" } };
  global.__WEDDING_CHAPTER_BASE_PATH__ = "/wedding_chapter/";
  const url = downloadUrl.createPersonalityDownloadUrl({ personalityId: "moonlight-poet", hallIds: ["floral", "mushi", "yano"] });
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/wedding_chapter/");
  assert.deepEqual([...parsed.searchParams.keys()], ["download", "personality", "halls"]);
  assert.equal(downloadUrl.personalityDownloadUrlContainsPersonalData(url), false);
  assert.doesNotMatch(url, /name|phone|email|serial|submission|duplicate|apps-script/i);
  const qr = await QRCode.toDataURL(url, { width: 200 });
  assert.match(qr, /^data:image\/png;base64,/);
  delete global.window;
  delete global.__WEDDING_CHAPTER_BASE_PATH__;
});

test("手機 download route 產生完整圖並提供下載，桌機保留 QR 與備用按鈕", () => {
  assert.match(main, /readPersonalityDownloadState\(window\.location\.search\)/);
  assert.match(downloadPage, /personality-download-page__desktop/);
  assert.match(downloadPage, /personality-download-page__mobile/);
  assert.match(downloadPage, /createPersonalityCardPng\(cardRef\.current\)/);
  assert.match(downloadPage, /下載圖片/);
  assert.match(downloadPage, /備用下載 PNG/);
  assert.match(downloadPanel, /QRCode\.toDataURL/);
});

test("人格下載 URL 與人格圖不加入新人或內部案件個資", () => {
  const combined = [exportCard, downloadPage, downloadPanel, readFileSync("lib/personalityDownloadUrl.ts", "utf8")].join("\n");
  assert.doesNotMatch(combined, /groomName|brideName|phone|salesEmail|duplicateKey|submissionId|Apps Script/i);
});

test("完成頁只調整宴會顧問文案且維持 LINE URL", () => {
  const ending = runner.slice(runner.indexOf('{session.step === "ending"'));
  assert.match(ending, /讓宴會顧問接續為你們服務。/);
  assert.match(ending, /href=\{salesLineUrl\}/);
  assert.doesNotMatch(ending, /讓婚禮顧問接續為你們服務。/);
});
