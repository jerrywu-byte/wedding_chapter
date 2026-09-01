import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
let directory, photo;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "venue-integrity-"));
  await build({
    stdin: {
      contents: `import { createElement } from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { VenuePhoto } from "./components/venue/VenuePhoto";
        import { getVenuePhotoSrc } from "./lib/hallPresentation";
        export * from "./lib/hallPresentation";
        export const render = (hallId, displayName) => renderToStaticMarkup(
          createElement(VenuePhoto, { src: getVenuePhotoSrc(hallId), displayName }));`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    outfile: join(directory, "photo.cjs"), bundle: true, platform: "node", format: "cjs", logLevel: "silent",
  });
  photo = require(join(directory, "photo.cjs"));
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test("北歐光境使用本次正式提供的原始照片，位元組未變更", () => {
  const path = photo.getVenuePhotoPath("nordic-light");
  assert.equal(path, "/venue-photos/original/nordic-light.jpg");
  assert.equal(createHash("sha256").update(readFileSync(`public${path}`)).digest("hex"),
    "73ea4cff4b031771bef75a213173c165460a031fde033a2e46ce854d1b6be10c");
  assert.match(photo.render("nordic-light", "北歐光境"), /src="\/venue-photos\/original\/nordic-light.jpg"/);
});

test("全部 15 個推薦廳房都有使用者正式提供或明確授權使用的照片", () => {
  const { halls } = JSON.parse(readFileSync("data/halls.json", "utf8"));
  assert.equal(halls.length, 15);
  assert.deepEqual(halls.filter(hall => photo.getVenuePhotoPath(hall.id) === null).map(hall => hall.id).sort(),
    []);
});

test("紫艷盛事全使用本次上傳的完整原始照片", () => {
  const path = photo.getVenuePhotoPath("purple-full");
  assert.equal(path, "/venue-photos/original/purple-full.jpg");
  assert.equal(createHash("sha256").update(readFileSync(`public${path}`)).digest("hex"),
    "eb5f9ccc74935b2ac7a3707644023faaef8b6ee4a3041be587e95df0dbe731f2");
  const html = photo.render("purple-full", "紫艷盛事全");
  assert.match(html, /src="\/venue-photos\/original\/purple-full.jpg"/);
  assert.doesNotMatch(html, /場地照片準備中/);
});

test("世紀盛典依使用者明確授權使用既有世紀廳照片", () => {
  assert.equal(photo.getVenuePhotoPath("century-ceremony"), "/venue-photos/web/century.webp");
  assert.equal(photo.getVenuePhotoPath("century-ceremony"), photo.getVenuePhotoPath("century"));
  const html = photo.render("century-ceremony", "世紀盛典");
  assert.match(html, /src="\/venue-photos\/web\/century.webp"/);
  assert.match(html, /alt="世紀盛典廳房空間"/);
  assert.doesNotMatch(html, /場地照片準備中/);
});

for (const [id, name] of [["unknown", "未知廳房"], ["constructor", "未知廳房"], ["toString", "未知廳房"], ["__proto__", "未知廳房"]]) {
  test(`${id} 不取得圖片，實際渲染品牌 placeholder 與廳房名稱`, () => {
    assert.equal(photo.getVenuePhotoPath(id), null);
    assert.equal(photo.getVenuePhotoSrc(id), null);
    const html = photo.render(id, name);
    assert.doesNotMatch(html, /<img|src=|url\(/);
    assert.match(html, /WEDDING CHAPTER/);
    assert.ok(html.includes(name));
    assert.match(html, /場地照片準備中/);
  });
}

test("15 廳照片 mapping 在根路徑和 production 子路徑皆正確，未知廳仍回傳 null", () => {
  try {
    for (const base of ["/", "/wedding_chapter/", "/wedding_chapter"]) {
      global.__WEDDING_CHAPTER_BASE_PATH__ = base;
      for (const [id, path] of Object.entries(photo.VENUE_PHOTO_BY_HALL_ID)) {
        const expected = `${base.replace(/\/$/, "")}${path}`;
        assert.equal(photo.getVenuePhotoSrc(id), expected);
        assert.ok(photo.render(id, id).includes(`src="${expected}"`));
      }
      assert.equal(photo.getVenuePhotoSrc("unknown"), null);
    }
  } finally { delete global.__WEDDING_CHAPTER_BASE_PATH__; }
});

test("圖片路徑僅包含正式 allowlist，無外站、品牌圖或隨機宴會廳 fallback", () => {
  assert.equal(Object.keys(photo.VENUE_PHOTO_BY_HALL_ID).length, 15);
  for (const path of Object.values(photo.VENUE_PHOTO_BY_HALL_ID)) assert.match(path, /^\/venue-photos\/(web|original)\//);
  const source = readFileSync("lib/hallPresentation.ts", "utf8") + readFileSync("components/venue/VenuePhoto.tsx", "utf8");
  assert.doesNotMatch(source, /Math\.random|https?:|unsplash|\/realistic\/|VENUE_PHOTO_FALLBACK|hall\.image/i);
  const css = readFileSync("app/globals.css", "utf8");
  const rules = css.match(/\.wx-hall-photo-placeholder[^}]*}/g);
  assert.ok(rules?.length);
  assert.doesNotMatch(rules.join(""), /url\(/);
});
