import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
let matcher;
let hallData;
let bundleDirectory;

before(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), "personality-hall-matcher-"));
  const matcherOutput = join(bundleDirectory, "matcher.cjs");
  const hallDataOutput = join(bundleDirectory, "hall-data.cjs");

  await Promise.all([
    build({
      entryPoints: [new URL("../lib/personalityHallMatcher.ts", import.meta.url).pathname],
      outfile: matcherOutput,
      bundle: true,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
    }),
    build({
      entryPoints: [new URL("../lib/hallData.ts", import.meta.url).pathname],
      outfile: hallDataOutput,
      bundle: true,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
    }),
  ]);

  matcher = require(matcherOutput);
  hallData = require(hallDataOutput);
});

after(async () => {
  if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
});

const highMatchCases = [
  ["moonlight-poet", "nordic-light"],
  ["starlight-star", "purple-happiness"],
  ["forest-collector", "green"],
  ["royal-curator", "century"],
  ["urban-dreamer", "purple-grand"],
  ["gentle-gatherer", "yano"],
];

for (const [personalityId, hallId] of highMatchCases) {
  test(`${personalityId} 與 ${hallId} 為高匹配`, () => {
    const result = matcher.comparePersonalityWithHall(personalityId, hallId);
    assert.ok(result.normalizedScore >= 70);
  });
}

test("所有人格與廳房分數介於 0 至 100", () => {
  for (const personalityId of [
    "moonlight-poet",
    "starlight-star",
    "forest-collector",
    "royal-curator",
    "urban-dreamer",
    "gentle-gatherer",
  ]) {
    for (const result of matcher.rankHallsByPersonality(personalityId)) {
      assert.ok(result.normalizedScore >= 0);
      assert.ok(result.normalizedScore <= 100);
    }
  }
});

test("不同人格對同一廳房得到不同分數", () => {
  const moonlight = matcher.comparePersonalityWithHall("moonlight-poet", "century");
  const royal = matcher.comparePersonalityWithHall("royal-curator", "century");
  assert.notEqual(moonlight.normalizedScore, royal.normalizedScore);
});

test("不存在的人格 id 回傳明確錯誤", () => {
  assert.throws(
    () => matcher.comparePersonalityWithHall("missing", "century"),
    (error) => error.code === "PERSONALITY_NOT_FOUND",
  );
});

test("不存在的 hall id 回傳明確錯誤", () => {
  assert.throws(
    () => matcher.comparePersonalityWithHall("moonlight-poet", "missing"),
    (error) => error.code === "HALL_NOT_FOUND",
  );
});

test("缺少權重欄位時驗證失敗", () => {
  const data = structuredClone(require("../data/halls.json"));
  delete data.halls[0].recommendationWeights.romantic;
  assert.ok(hallData.validateHallRecommendationWeights(data).length > 0);
});

test("目前廳房權重、id名稱映射與警告檢查通過", () => {
  assert.deepEqual(hallData.validateHallRecommendationWeights(), []);
  assert.deepEqual(hallData.validateExpectedHallDisplayNames(), []);
  assert.deepEqual(hallData.getHallRecommendationWeightWarnings(), []);
});

test("combined 廳房也必須通過權重驗證", () => {
  const data = structuredClone(require("../data/halls.json"));
  const combined = data.halls.find((hall) => hall.type === "combined");
  combined.recommendationWeights.party = 6;
  assert.ok(hallData.validateHallRecommendationWeights(data).length > 0);
});

test("ceremonySpaces 不參與廳房權重驗證", () => {
  const data = structuredClone(require("../data/halls.json"));
  data.ceremonySpaces[0].recommendationWeights = { unexpected: null };
  assert.deepEqual(hallData.validateHallRecommendationWeights(data), []);
});

test("北歐光境桌數容量更新為10至23且不影響權重驗證", () => {
  const data = structuredClone(require("../data/halls.json"));
  const nordic = data.halls.find((hall) => hall.id === "nordic-light");
  assert.equal(nordic.capacity.minimumTables, 10);
  assert.equal(nordic.capacity.maximumTables, 23);
  assert.deepEqual(hallData.validateHallRecommendationWeights(data), []);
});

test("未列出的 active 零權重廳房會產生警告", () => {
  const data = structuredClone(require("../data/halls.json"));
  const extraHall = structuredClone(data.halls[0]);
  extraHall.id = "unconfigured-hall";
  extraHall.displayName = "未設定廳";
  for (const key of Object.keys(extraHall.recommendationWeights)) {
    extraHall.recommendationWeights[key] = 0;
  }
  data.halls.push(extraHall);
  assert.equal(hallData.getHallRecommendationWeightWarnings(data).length, 1);
});

test("多餘權重欄位驗證失敗", () => {
  const data = structuredClone(require("../data/halls.json"));
  data.halls[0].recommendationWeights.unexpected = 3;
  assert.ok(hallData.validateHallRecommendationWeights(data).length > 0);
});

for (const invalidValue of [1.5, -1, 6, null, "5"]) {
  test(`非法權重 ${String(invalidValue)} 驗證失敗`, () => {
    const data = structuredClone(require("../data/halls.json"));
    data.halls[0].recommendationWeights.romantic = invalidValue;
    assert.ok(hallData.validateHallRecommendationWeights(data).length > 0);
  });
}
