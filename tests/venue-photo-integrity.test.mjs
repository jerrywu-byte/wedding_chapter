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

test("全部 15 個推薦廳房只有兩個合併廳缺少獨立正式照片", () => {
  const { halls } = JSON.parse(readFileSync("data/halls.json", "utf8"));
  assert.equal(halls.length, 15);
  assert.deepEqual(halls.filter(hall => photo.getVenuePhotoPath(hall.id) === null).map(hall => hall.id).sort(),
    ["century-ceremony", "purple-full"]);
});

for (const [id, name] of [["purple-full", "紫艷盛事全"], ["century-ceremony", "世紀盛典"],
  ["unknown", "未知廳房"], ["constructor", "未知廳房"], ["toString", "未知廳房"], ["__proto__", "未知廳房"]]) {
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

test("13 張正式照片在根路徑和 production 子路徑皆正確，缺圖仍回傳 null", () => {
  try {
    for (const base of ["/", "/wedding_chapter/", "/wedding_chapter"]) {
      global.__WEDDING_CHAPTER_BASE_PATH__ = base;
      for (const [id, path] of Object.entries(photo.VENUE_PHOTO_BY_HALL_ID)) {
        const expected = `${base.replace(/\/$/, "")}${path}`;
        assert.equal(photo.getVenuePhotoSrc(id), expected);
        assert.ok(photo.render(id, id).includes(`src="${expected}"`));
      }
      assert.equal(photo.getVenuePhotoSrc("purple-full"), null);
    }
  } finally { delete global.__WEDDING_CHAPTER_BASE_PATH__; }
});

test("圖片路徑僅包含正式 allowlist，無外站、品牌圖或隨機宴會廳 fallback", () => {
  assert.equal(Object.keys(photo.VENUE_PHOTO_BY_HALL_ID).length, 13);
  for (const path of Object.values(photo.VENUE_PHOTO_BY_HALL_ID)) assert.match(path, /^\/venue-photos\/(web|original)\//);
  const source = readFileSync("lib/hallPresentation.ts", "utf8") + readFileSync("components/venue/VenuePhoto.tsx", "utf8");
  assert.doesNotMatch(source, /Math\.random|https?:|unsplash|\/realistic\/|VENUE_PHOTO_FALLBACK|hall\.image/i);
  const css = readFileSync("app/globals.css", "utf8");
  const rules = css.match(/\.wx-hall-photo-placeholder[^}]*}/g);
  assert.ok(rules?.length);
  assert.doesNotMatch(rules.join(""), /url\(/);
});
