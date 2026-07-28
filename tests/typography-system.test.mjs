import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const layout = read("app/layout.tsx");
const typography = read("app/typography.css");
const runner = read("presentation/components/WeddingExperienceRunner.tsx");
const card = read("components/personality/PersonalityCard.tsx");

test("正式網站以 Noto Serif TC 與 Noto Sans TC 搭配", () => {
  assert.doesNotMatch(layout, /next\/font\/local|localFont/);
  assert.match(layout, /@fontsource-variable\/noto-serif-tc/);
  assert.match(layout, /@fontsource-variable\/noto-sans-tc/);
  assert.doesNotMatch(layout, /next\/font\/google/);
});

test("Typography tokens 集中定義且正式 Runner 最後載入", () => {
  for (const token of ["--font-brand", "--font-body"]) {
    assert.match(typography, new RegExp(token));
  }
  assert.doesNotMatch(typography, /--font-(?:serif|sans|handwriting)/);
  assert.match(runner, /import "\.\.\/\.\.\/app\/typography\.css";/);
});

test("題目使用 Noto Serif TC，選項使用 Noto Sans TC 並保留手機最低字級", () => {
  assert.match(typography, /--font-brand: "Noto Serif TC Variable"/);
  assert.match(typography, /--font-body: "Noto Sans TC Variable"/);
  assert.match(typography, /\.wx-quiz > h1[\s\S]*font-family: var\(--font-brand\)/);
  assert.match(typography, /--type-question: clamp\(1\.3125rem, 6vw, 1\.5rem\)/);
  assert.match(typography, /--type-choice: clamp\(1\.0625rem, 4\.8vw, 1\.125rem\)/);
  assert.match(typography, /\.wx-options button > b[\s\S]*font-family: var\(--font-body\)/);
  assert.match(typography, /\.wx-options button > span:not\(\.wx-choice-scene\)[\s\S]*font-size: 1rem/);
});

test("舊手寫字型已停用，AI 偷偷發現全區使用 Noto Sans TC", () => {
  assert.doesNotMatch(`${layout}\n${typography}\n${card}`, /Iansui|DFKai-SB|KaiTi|font-handwriting/);
  assert.match(card, /Math\.min\(text\.length, 35\)/);
  assert.equal((card.match(/className="font-body"/g) ?? []).length, 2);
  assert.match(typography, /\.personality-card__secret,[\s\S]*font-family: var\(--font-body\) !important/);
});

test("關閉人工字重合成並保留 Noto Serif TC 與 Noto Sans TC fallback", () => {
  assert.match(typography, /font-synthesis: none/);
  assert.match(typography, /"Noto Serif TC"[\s\S]*serif/);
  assert.match(typography, /"Noto Sans TC"[\s\S]*sans-serif/);
  assert.doesNotMatch(typography, /Songti TC|PMingLiU/);
});
