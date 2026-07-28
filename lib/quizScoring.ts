import { getActivePersonalities } from "./personalityData";
import {
  getActiveQuizQuestions,
  HIDDEN_PERSONALITY_IDS,
  MAIN_PERSONALITY_IDS,
} from "./quizData";
import { WEDDING_PERSONALITY_WEIGHT_KEYS } from "../types/wedding-personality";
import type {
  HiddenPersonalityEvaluation,
  HiddenPersonalityId,
  MainPersonalityId,
  PersonalityRankingResult,
  QuizAnswerValidationResult,
  QuizDimensionTotals,
  QuizResult,
  WeddingQuizAnswer,
  WeddingQuizOption,
} from "../types/wedding-quiz";

const CEREMONY_THRESHOLD = 6;
const DIRECTOR_THRESHOLD = 7;
const CEREMONY_STRONG_OPTIONS = new Set(["q2-c", "q5-c"]);
const DIRECTOR_STRONG_OPTIONS = new Set(["q2-d", "q4-a", "q4-b", "q5-b"]);
const DIRECTOR_TRAITS = new Set([
  "surprise",
  "interaction",
  "program",
  "performance",
  "atmosphere",
  "joyful",
]);

export type QuizScoringErrorCode =
  | "DUPLICATE_ANSWER"
  | "QUESTION_NOT_FOUND"
  | "OPTION_NOT_FOUND";

export class QuizScoringError extends Error {
  constructor(
    public readonly code: QuizScoringErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QuizScoringError";
  }
}

function createEmptyDimensionScores(): QuizDimensionTotals {
  return Object.fromEntries(
    WEDDING_PERSONALITY_WEIGHT_KEYS.map((key) => [key, 0]),
  ) as QuizDimensionTotals;
}

function createEmptyMainScores(): Record<MainPersonalityId, number> {
  return Object.fromEntries(MAIN_PERSONALITY_IDS.map((id) => [id, 0])) as Record<
    MainPersonalityId,
    number
  >;
}

function selectedOptions(answers: WeddingQuizAnswer[]): WeddingQuizOption[] {
  const questionMap = new Map(
    getActiveQuizQuestions().map((question) => [question.id, question]),
  );
  return answers.map((answer) => {
    const question = questionMap.get(answer.questionId)!;
    return question.options.find((option) => option.optionId === answer.optionId)!;
  });
}

export function validateQuizAnswers(
  answers: WeddingQuizAnswer[],
): QuizAnswerValidationResult {
  const activeQuestions = getActiveQuizQuestions();
  const activeQuestionMap = new Map(
    activeQuestions.map((question) => [question.id, question]),
  );
  const answeredQuestionIds = new Set<string>();

  for (const answer of answers) {
    if (answeredQuestionIds.has(answer.questionId)) {
      throw new QuizScoringError(
        "DUPLICATE_ANSWER",
        `題目重複作答：${answer.questionId}`,
      );
    }
    answeredQuestionIds.add(answer.questionId);
    const question = activeQuestionMap.get(answer.questionId);
    if (!question) {
      throw new QuizScoringError(
        "QUESTION_NOT_FOUND",
        `找不到啟用中的題目：${answer.questionId}`,
      );
    }
    if (!question.options.some((option) => option.optionId === answer.optionId)) {
      throw new QuizScoringError(
        "OPTION_NOT_FOUND",
        `題目 ${answer.questionId} 找不到選項：${answer.optionId}`,
      );
    }
  }

  const missingQuestionIds = activeQuestions
    .filter((question) => !answeredQuestionIds.has(question.id))
    .map((question) => question.id);
  return {
    isComplete:
      answers.length === activeQuestions.length && missingQuestionIds.length === 0,
    answeredQuestionCount: answeredQuestionIds.size,
    missingQuestionIds,
  };
}

export function calculateQuizDimensionScores(
  answers: WeddingQuizAnswer[],
): QuizDimensionTotals {
  validateQuizAnswers(answers);
  const personalityMap = new Map(
    getActivePersonalities().map((personality) => [personality.id, personality]),
  );
  const scores = createEmptyDimensionScores();
  for (const option of selectedOptions(answers)) {
    for (const [personalityId, points] of Object.entries(option.personalityScores)) {
      const personality = personalityMap.get(personalityId);
      if (!personality || !points) continue;
      for (const key of WEDDING_PERSONALITY_WEIGHT_KEYS) {
        scores[key] += personality.weights[key] * points;
      }
    }
  }
  return scores;
}

/** @deprecated Use calculateQuizDimensionScores. */
export const calculateQuizDimensionTotals = calculateQuizDimensionScores;

function calculateMainScores(answers: WeddingQuizAnswer[]) {
  const scores = createEmptyMainScores();
  const primaryHitCounts = createEmptyMainScores();
  for (const option of selectedOptions(answers)) {
    for (const [id, points] of Object.entries(option.personalityScores)) {
      scores[id as MainPersonalityId] += points ?? 0;
      if (points === 2) primaryHitCounts[id as MainPersonalityId] += 1;
    }
  }

  const selectedIds = new Set(answers.map((answer) => answer.optionId));
  const forestBonus =
    selectedIds.has("q2-c") &&
    ["q1-c", "q3-c", "q4-c", "q5-c"].some((id) => selectedIds.has(id));
  if (forestBonus) scores["forest-collector"] += 2;
  return { scores, primaryHitCounts, forestBonus };
}

function primaryPersonalityForQuestion(
  answers: WeddingQuizAnswer[],
  questionId: string,
): MainPersonalityId | null {
  const answer = answers.find((item) => item.questionId === questionId);
  if (!answer) return null;
  const question = getActiveQuizQuestions().find((item) => item.id === questionId);
  const option = question?.options.find((item) => item.optionId === answer.optionId);
  const primary = Object.entries(option?.personalityScores ?? {}).find(
    ([, points]) => points === 2,
  );
  return (primary?.[0] as MainPersonalityId | undefined) ?? null;
}

function rankMainPersonalities(
  answers: WeddingQuizAnswer[],
  dimensionScores: QuizDimensionTotals,
): PersonalityRankingResult[] {
  const { scores, primaryHitCounts } = calculateMainScores(answers);
  const fifth = primaryPersonalityForQuestion(answers, "q5-film");
  const first = primaryPersonalityForQuestion(answers, "q1-memory");
  const personalityMap = new Map(
    getActivePersonalities().map((personality) => [personality.id, personality]),
  );
  const maximum = Math.max(...Object.values(scores), 1);

  return MAIN_PERSONALITY_IDS.map((id) => {
    const personality = personalityMap.get(id);
    if (!personality) throw new Error(`找不到既有人格資料：${id}`);
    return {
      rank: 0,
      id,
      personalityId: id,
      displayName: personality.displayName,
      score: Math.round((scores[id] / maximum) * 100),
      rawScore: scores[id],
      normalizedScore: Math.round((scores[id] / maximum) * 100),
      dimensionScores,
      resultCard: personality.resultCard,
    };
  })
    .sort((a, b) => {
      const aId = a.id as MainPersonalityId;
      const bId = b.id as MainPersonalityId;
      if (b.rawScore !== a.rawScore) return b.rawScore - a.rawScore;
      if (primaryHitCounts[bId] !== primaryHitCounts[aId]) {
        return primaryHitCounts[bId] - primaryHitCounts[aId];
      }
      if (fifth === aId || fifth === bId) return fifth === aId ? -1 : 1;
      if (first === aId || first === bId) return first === aId ? -1 : 1;
      return MAIN_PERSONALITY_IDS.indexOf(aId) - MAIN_PERSONALITY_IDS.indexOf(bId);
    })
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

function evaluateHiddenPersonality(
  answers: WeddingQuizAnswer[],
  personalityId: HiddenPersonalityId,
): HiddenPersonalityEvaluation {
  const options = selectedOptions(answers);
  const relevant = options.filter(
    (option) => (option.hiddenPersonalityScores[personalityId] ?? 0) > 0,
  );
  const score = relevant.reduce(
    (sum, option) => sum + (option.hiddenPersonalityScores[personalityId] ?? 0),
    0,
  );
  const traits = [
    ...new Set(
      relevant.flatMap((option) =>
        personalityId === "celebration-director"
          ? option.traits.filter((trait) => DIRECTOR_TRAITS.has(trait))
          : option.traits,
      ),
    ),
  ];
  const optionIds = new Set(options.map((option) => option.optionId));
  const triggered =
    personalityId === "ceremony-dreamer"
      ? score >= CEREMONY_THRESHOLD &&
        relevant.length >= 3 &&
        [...CEREMONY_STRONG_OPTIONS].some((id) => optionIds.has(id))
      : score >= DIRECTOR_THRESHOLD &&
        relevant.length >= 3 &&
        [...DIRECTOR_STRONG_OPTIONS].some((id) => optionIds.has(id)) &&
        traits.length >= 2;
  return {
    personalityId,
    score,
    scoredQuestionCount: relevant.length,
    traits,
    triggered,
  };
}

export function resolveHiddenPersonality(
  evaluations: HiddenPersonalityEvaluation[],
  fourthOptionId?: string,
): HiddenPersonalityEvaluation | null {
  const ceremony = evaluations.find(
    (item) => item.personalityId === "ceremony-dreamer" && item.triggered,
  );
  const director = evaluations.find(
    (item) => item.personalityId === "celebration-director" && item.triggered,
  );
  if (!ceremony) return director ?? null;
  if (!director) return ceremony;

  const strengthComparison =
    ceremony.score * DIRECTOR_THRESHOLD - director.score * CEREMONY_THRESHOLD;
  if (strengthComparison !== 0) return strengthComparison > 0 ? ceremony : director;
  if (ceremony.scoredQuestionCount !== director.scoredQuestionCount) {
    return ceremony.scoredQuestionCount > director.scoredQuestionCount
      ? ceremony
      : director;
  }
  if (fourthOptionId === "q4-a" || fourthOptionId === "q4-b") return director;
  if (fourthOptionId === "q4-c") return ceremony;
  return null;
}

function hiddenRanking(
  evaluation: HiddenPersonalityEvaluation,
  dimensionScores: QuizDimensionTotals,
): PersonalityRankingResult {
  const personality = getActivePersonalities().find(
    (item) => item.id === evaluation.personalityId,
  );
  if (!personality) throw new Error(`找不到既有隱藏人格：${evaluation.personalityId}`);
  const threshold =
    evaluation.personalityId === "ceremony-dreamer"
      ? CEREMONY_THRESHOLD
      : DIRECTOR_THRESHOLD;
  const normalizedScore = Math.min(
    100,
    Math.round((evaluation.score / threshold) * 100),
  );
  return {
    rank: 1,
    id: personality.id,
    personalityId: personality.id,
    displayName: personality.displayName,
    score: normalizedScore,
    rawScore: evaluation.score,
    normalizedScore,
    dimensionScores,
    resultCard: personality.resultCard,
  };
}

export function calculateQuizResult(answers: WeddingQuizAnswer[]): QuizResult {
  const validation = validateQuizAnswers(answers);
  const dimensionScores = calculateQuizDimensionScores(answers);
  const { scores } = calculateMainScores(answers);
  const experienceTags = [
    ...new Set(selectedOptions(answers).flatMap((option) => option.experienceTags)),
  ];
  const hiddenPersonalityEvaluations = HIDDEN_PERSONALITY_IDS.map((id) =>
    evaluateHiddenPersonality(answers, id),
  );

  if (!validation.isComplete) {
    return {
      answers: [...answers],
      dimensionScores,
      dimensionTotals: dimensionScores,
      primaryPersonality: null,
      secondaryPersonality: null,
      personalityRanking: [],
      personalityRankings: [],
      mainPersonalityScores: scores,
      hiddenPersonalityEvaluations,
      experienceTags,
      answeredQuestionCount: validation.answeredQuestionCount,
      isComplete: false,
    };
  }

  const mainRanking = rankMainPersonalities(answers, dimensionScores);
  const fourthOptionId = answers.find(
    (answer) => answer.questionId === "q4-focus",
  )?.optionId;
  const hidden = resolveHiddenPersonality(
    hiddenPersonalityEvaluations,
    fourthOptionId,
  );
  const finalRanking = hidden
    ? [
        hiddenRanking(hidden, dimensionScores),
        ...mainRanking.map((item, index) => ({ ...item, rank: index + 2 })),
      ]
    : mainRanking;
  return {
    answers: [...answers],
    dimensionScores,
    dimensionTotals: dimensionScores,
    primaryPersonality: finalRanking[0],
    secondaryPersonality: hidden ? mainRanking[0] : mainRanking[1],
    personalityRanking: finalRanking,
    personalityRankings: finalRanking,
    mainPersonalityScores: scores,
    hiddenPersonalityEvaluations,
    experienceTags,
    answeredQuestionCount: validation.answeredQuestionCount,
    isComplete: true,
  };
}

/**
 * Legacy API retained for consumers that rank existing dimension totals.
 * Five-story result calculation uses the explicit personality score rules above.
 */
export function rankPersonalitiesByQuizScores(
  dimensionScores: QuizDimensionTotals,
): PersonalityRankingResult[] {
  const magnitude = Math.sqrt(
    WEDDING_PERSONALITY_WEIGHT_KEYS.reduce(
      (sum, key) => sum + dimensionScores[key] ** 2,
      0,
    ),
  );
  return getActivePersonalities()
    .filter((personality) =>
      MAIN_PERSONALITY_IDS.includes(personality.id as MainPersonalityId),
    )
    .map((personality) => {
      const personalityMagnitude = Math.sqrt(
        WEDDING_PERSONALITY_WEIGHT_KEYS.reduce(
          (sum, key) => sum + personality.weights[key] ** 2,
          0,
        ),
      );
      const rawScore = WEDDING_PERSONALITY_WEIGHT_KEYS.reduce(
        (sum, key) => sum + dimensionScores[key] * personality.weights[key],
        0,
      );
      const score =
        magnitude && personalityMagnitude
          ? Math.round((rawScore / (magnitude * personalityMagnitude)) * 100)
          : 0;
      return {
        rank: 0,
        id: personality.id,
        personalityId: personality.id,
        displayName: personality.displayName,
        score,
        rawScore,
        normalizedScore: score,
        dimensionScores,
        resultCard: personality.resultCard,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        MAIN_PERSONALITY_IDS.indexOf(a.id as MainPersonalityId) -
          MAIN_PERSONALITY_IDS.indexOf(b.id as MainPersonalityId),
    )
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

/** @deprecated Use rankPersonalitiesByQuizScores. */
export const rankPersonalitiesByQuizDimensions = rankPersonalitiesByQuizScores;
