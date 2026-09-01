import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { build } from "esbuild";

// Run after the production GitHub Pages build: node scripts/validate-venue-photos.mjs
const root = resolve(process.argv[2] || "dist");
const { outputFiles } = await build({ entryPoints: ["lib/hallPresentation.ts"], bundle: true,
  platform: "node", format: "esm", write: false, logLevel: "silent" });
const photo = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
const index = await readFile(join(root, "index.html"), "utf8");
assert.match(index, /\/wedding_chapter\/assets\//);
const assets = await readdir(join(root, "assets"));
const scripts = (await Promise.all(assets.filter(name => name.endsWith(".js"))
  .map(name => readFile(join(root, "assets", name), "utf8")))).join("\n");
assert.ok(scripts.includes("場地照片準備中"));
assert.ok(scripts.includes("/wedding_chapter/"));
assert.equal(Object.keys(photo.VENUE_PHOTO_BY_HALL_ID).length, 15);
for (const [id, path] of Object.entries(photo.VENUE_PHOTO_BY_HALL_ID)) {
  assert.ok(scripts.includes(path), `${id}: missing production mapping`);
  assert.deepEqual(await readFile(join(root, path)), await readFile(join("public", path)), `${id}: artifact photo changed`);
}
assert.equal(photo.getVenuePhotoPath("purple-full"), "/venue-photos/original/purple-full.jpg");
assert.equal(photo.getVenuePhotoPath("century-ceremony"), photo.getVenuePhotoPath("century"));
for (const id of ["unknown", "constructor", "__proto__"]) {
  assert.equal(photo.getVenuePhotoSrc(id), null);
}
console.log("Validated GitHub Pages artifact: 15 approved hall mappings, production base path, and unknown-hall placeholder.");
