import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
let scoring;
let quizData;
let bundleDirectory;

before(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), "five-story-scoring-"));
  const scoringOutput = join(bundleDirectory, "scoring.cjs");
  const dataOutput = join(bundleDirectory, "quiz-data.cjs");
  await Promise.all([
    build({
      entryPoints: [new URL("../lib/quizScoring.ts", import.meta.url).pathname],
      outfile: scoringOutput,
      bundle: true,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
    }),
    build({
      entryPoints: [new URL("../lib/quizData.ts", import.meta.url).pathname],
      outfile: dataOutput,
      bundle: true,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
    }),
  ]);
  scoring = require(scoringOutput);
  quizData = require(dataOutput);
});

after(async () => {
  if (bundleDirectory) await rm(bundleDirectory, { recursive: true, force: true });
});

const questionIds = ["q1-memory", "q2-scene", "q3-guests", "q4-focus", "q5-film"];
const answers = (letters) =>
  questionIds.map((questionId, index) => ({
    questionId,
    optionId: `q${index + 1}-${letters[index]}`,
  }));

test("題庫固定為 five-story-v1、五題且每題四個選項", () => {
  const questions = quizData.getActiveQuizQuestions();
  assert.equal(quizData.QUIZ_VERSION, "five-story-v1");
  assert.equal(questions.length, 5);
  assert.ok(questions.every((question) => question.options.length === 4));
  assert.deepEqual(quizData.validateQuizData(), []);
});

test("五題文字與順序使用正式版本", () => {
  assert.deepEqual(
    quizData.getActiveQuizQuestions().map((question) => question.title),
    [
      "婚禮結束後，你最希望留下什麼回憶？",
      "如果只能選一個畫面，你最期待的是……",
      "婚禮結束後，你最希望聽見親友怎麼說？",
      "如果只能花最多心思準備一件事，你會選擇……",
      "如果你的婚禮是一部電影，你希望它是哪一種類型？",
    ],
  );
});

test("測試一：全選精緻質感不觸發隱藏人格", () => {
  const result = scoring.calculateQuizResult(answers("ddddd"));
  assert.equal(result.primaryPersonality.personalityId, "royal-curator");
  assert.ok(result.hiddenPersonalityEvaluations.every((item) => !item.triggered));
});

test("測試二：溫暖情感承諾浪漫達門檻時觸發儀式築夢者", () => {
  const result = scoring.calculateQuizResult(answers("ccccc"));
  assert.equal(result.primaryPersonality.personalityId, "ceremony-dreamer");
  const hidden = result.hiddenPersonalityEvaluations.find(
    (item) => item.personalityId === "ceremony-dreamer",
  );
  assert.equal(hidden.score, 8);
  assert.equal(hidden.scoredQuestionCount, 5);
  assert.equal(hidden.triggered, true);
});

test("測試三：互動表演驚喜氣氛達門檻時觸發歡樂導演家", () => {
  const result = scoring.calculateQuizResult(answers("adabb"));
  assert.equal(result.primaryPersonality.personalityId, "celebration-director");
  const hidden = result.hiddenPersonalityEvaluations.find(
    (item) => item.personalityId === "celebration-director",
  );
  assert.ok(hidden.score >= 7);
  assert.ok(hidden.traits.length >= 2);
  assert.equal(hidden.triggered, true);
});

test("測試四：只有第二題 C 不觸發儀式築夢者", () => {
  const result = scoring.calculateQuizResult(answers("dcddd"));
  assert.notEqual(result.primaryPersonality.personalityId, "ceremony-dreamer");
});

test("測試五：只有第四題 B 不觸發歡樂導演家", () => {
  const result = scoring.calculateQuizResult(answers("dddbd"));
  assert.notEqual(result.primaryPersonality.personalityId, "celebration-director");
});

test("測試六：第二題 C 搭配溫暖療癒答案會增加森林收藏家兩分", () => {
  const result = scoring.calculateQuizResult(answers("ccccc"));
  assert.equal(result.mainPersonalityScores["forest-collector"], 5);
});

test("測試七：兩張隱藏人格同時達標時依強度比例判定", () => {
  const ceremony = {
    personalityId: "ceremony-dreamer",
    score: 7,
    scoredQuestionCount: 3,
    traits: ["emotion", "promise", "romantic"],
    triggered: true,
  };
  const director = {
    personalityId: "celebration-director",
    score: 7,
    scoredQuestionCount: 4,
    traits: ["interaction", "performance"],
    triggered: true,
  };
  assert.equal(
    scoring.resolveHiddenPersonality([ceremony, director], "q4-a").personalityId,
    "ceremony-dreamer",
  );
});

test("雙隱藏強度與題數相同時使用第四題穩定判定", () => {
  const ceremony = {
    personalityId: "ceremony-dreamer",
    score: 6,
    scoredQuestionCount: 3,
    traits: ["emotion", "promise"],
    triggered: true,
  };
  const director = {
    personalityId: "celebration-director",
    score: 7,
    scoredQuestionCount: 3,
    traits: ["interaction", "performance"],
    triggered: true,
  };
  assert.equal(
    scoring.resolveHiddenPersonality([ceremony, director], "q4-a").personalityId,
    "celebration-director",
  );
  assert.equal(
    scoring.resolveHiddenPersonality([ceremony, director], "q4-c").personalityId,
    "ceremony-dreamer",
  );
  assert.equal(
    scoring.resolveHiddenPersonality([ceremony, director], "q4-d"),
    null,
  );
});

test("未完成五題不輸出人格結果", () => {
  const result = scoring.calculateQuizResult(answers("ddddd").slice(0, 4));
  assert.equal(result.isComplete, false);
  assert.equal(result.primaryPersonality, null);
});

test("相同答案重複計算會得到相同結果", () => {
  const selected = answers("abcda");
  assert.deepEqual(
    scoring.calculateQuizResult(selected),
    scoring.calculateQuizResult(selected),
  );
});

test("同題重複與不存在的題目選項會回傳明確錯誤", () => {
  const selected = answers("abcda");
  assert.throws(
    () => scoring.calculateQuizResult([selected[0], selected[0]]),
    (error) => error.code === "DUPLICATE_ANSWER",
  );
  assert.throws(
    () => scoring.calculateQuizResult([{ questionId: "missing", optionId: "q1-a" }]),
    (error) => error.code === "QUESTION_NOT_FOUND",
  );
  assert.throws(
    () => scoring.calculateQuizResult([{ questionId: "q1-memory", optionId: "q2-a" }]),
    (error) => error.code === "OPTION_NOT_FOUND",
  );
});
