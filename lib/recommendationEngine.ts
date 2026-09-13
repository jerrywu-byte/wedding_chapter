import hallJson from "../data/halls.json";
import { recommendHalls } from "../recommendationEngine";
import { WEDDING_PERSONALITY_WEIGHT_KEYS } from "../types/wedding-personality";
import type { Hall, HallsData, HallType } from "../types/hall";
import type { QuizDimensionTotals, QuizResult } from "../types/wedding-quiz";
import type { EstimatedTableRange } from "./tableRanges";

const hallsData = hallJson as unknown as HallsData;
export const MAX_HALL_RECOMMENDATIONS = 3;

const DIMENSION_LABELS = {
  romantic: "浪漫氛圍",
  elegant: "優雅質感",
  modern: "現代感",
  luxurious: "奢華感",
  warm: "溫暖相聚",
  party: "派對氛圍",
  ceremony: "儀式感",
  interactive: "互動體驗",
  photoFriendly: "拍照畫面",
  familyOriented: "家庭參與",
} as const;

export interface HallStyleScore {
  rawScore: number;
  normalizedScore: number;
  dimensionScores: QuizDimensionTotals;
}

export interface RecommendationReasonResult {
  hallId: string;
  reasons: string[];
  warnings: string[];
}

export interface RankedHallByQuiz extends HallStyleScore, RecommendationReasonResult {
  displayName: string;
}

export interface QuizHallRecommendationResult {
  isComplete: boolean;
  recommendations: RankedHallByQuiz[];
  excludedHallIds: string[];
  warnings: string[];
}

export interface FlexibleRecommendationCriteria {
  estimatedTables: number | null;
  estimatedTableRange?: EstimatedTableRange | null;
  estimatedGuests: number | null;
  tableCountUndecided: boolean;
}

function emptyDimensionScores(): QuizDimensionTotals {
  return Object.fromEntries(
    WEDDING_PERSONALITY_WEIGHT_KEYS.map((key) => [key, 0]),
  ) as QuizDimensionTotals;
}

export function calculateHallStyleScoreFromDimensions(
  dimensionScores: QuizDimensionTotals,
  hallWeights: Hall["recommendationWeights"],
): HallStyleScore {
  const resultDimensions = emptyDimensionScores();
  let rawScore = 0;
  let quizWeightTotal = 0;

  for (const key of WEDDING_PERSONALITY_WEIGHT_KEYS) {
    const quizValue = dimensionScores[key];
    const hallValue = hallWeights[key];
    if (!Number.isFinite(quizValue) || quizValue < 0) {
      throw new RangeError(`dimensionScores.${key} 必須是大於等於 0 的有限數字`);
    }
    if (!Number.isInteger(hallValue) || hallValue < 0 || hallValue > 5) {
      throw new RangeError(`hallWeights.${key} 必須是 0 至 5 的整數`);
    }
    const score = quizValue * hallValue;
    resultDimensions[key] = score;
    rawScore += score;
    quizWeightTotal += quizValue;
  }

  const maximumScore = quizWeightTotal * 5;
  return {
    rawScore,
    normalizedScore: maximumScore === 0 ? 0 : Math.round((rawScore / maximumScore) * 100),
    dimensionScores: resultDimensions,
  };
}

function getTopDimensionLabels(dimensionScores: QuizDimensionTotals): string[] {
  return [...WEDDING_PERSONALITY_WEIGHT_KEYS]
    .sort(
      (a, b) =>
        dimensionScores[b] - dimensionScores[a] ||
        WEDDING_PERSONALITY_WEIGHT_KEYS.indexOf(a) -
          WEDDING_PERSONALITY_WEIGHT_KEYS.indexOf(b),
    )
    .filter((key) => dimensionScores[key] > 0)
    .slice(0, 3)
    .map((key) => DIMENSION_LABELS[key]);
}

export function generateRecommendationReasons(
  hall: Hall,
  tableCount: number,
  quizDimensionScores: QuizDimensionTotals,
): RecommendationReasonResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const topDimensions = getTopDimensionLabels(quizDimensionScores);
  reasons.push(
    topDimensions.length > 0
      ? `你的測驗結果重視${topDimensions.join("、")}。`
      : "你的測驗已完成，可進一步比較場地整體體驗。",
  );

  const capacity = hall.capacity;
  if (capacity.minimumTables === null || capacity.maximumTables === null) {
    reasons.push("目前缺少完整桌數容量資料，需由婚禮顧問人工確認。");
    warnings.push(`${hall.displayName}的桌數容量尚未完整提供，不列入推薦廳房。`);
  } else {
    reasons.push(
      `預計${tableCount}桌落在${hall.displayName}${capacity.minimumTables}至${capacity.maximumTables}桌的正式可承接範圍。`,
    );
  }

  const featureSummary =
    hall.features.slice(0, 3).join("、") ||
    hall.salesNotes.sellingPoints.slice(0, 2).join("、");
  reasons.push(
    featureSummary
      ? `場地特色包含${featureSummary}。`
      : "場地特色資料可由婚禮顧問於現場進一步說明。",
  );

  return { hallId: hall.id, reasons, warnings };
}

function compareRecommendations(a: RankedHallByQuiz, b: RankedHallByQuiz): number {
  return (
    b.normalizedScore - a.normalizedScore ||
    b.rawScore - a.rawScore ||
    a.hallId.localeCompare(b.hallId)
  );
}

function rankHalls(halls: Hall[], tableCount: number, quizResult: QuizResult): RankedHallByQuiz[] {
  return halls
    .map((hall) => ({
      hall,
      style: calculateHallStyleScoreFromDimensions(
        quizResult.dimensionScores,
        hall.recommendationWeights,
      ),
      explanation: generateRecommendationReasons(hall, tableCount, quizResult.dimensionScores),
    }))
    .map(({ hall, style, explanation }) => ({
      displayName: hall.displayName,
      ...style,
      ...explanation,
    }))
    .sort(compareRecommendations);
}

export function limitHallRecommendations(
  recommendations: readonly RankedHallByQuiz[],
): RankedHallByQuiz[] {
  return [...recommendations]
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.hallId === item.hallId) === index,
    )
    .sort(compareRecommendations)
    .slice(0, MAX_HALL_RECOMMENDATIONS);
}

function rangeFitsFormalCapacity(range: EstimatedTableRange, hall: Hall): boolean {
  const minimum = hall.capacity.minimumTables;
  const maximum = hall.capacity.maximumTables;
  if (minimum === null || maximum === null) return false;
  const selectedMaximum = range.maximum ?? range.minimum;
  return range.minimum >= minimum && selectedMaximum <= maximum;
}

function rankEligibleHallsByTableRange(
  range: EstimatedTableRange,
  quizResult: QuizResult,
  hallType: HallType,
): QuizHallRecommendationResult {
  const candidates = hallsData.halls.filter(
    (hall) => hall.status === "active" && hall.type === hallType,
  );
  const eligible = candidates.filter((hall) => rangeFitsFormalCapacity(range, hall));
  const referenceCount = range.maximum ?? range.minimum;
  const recommendations = rankHalls(eligible, referenceCount, quizResult).map((item) => {
    const hall = eligible.find((candidate) => candidate.id === item.hallId)!;
    return {
      ...item,
      reasons: [
        item.reasons[0],
        `選擇的${range.label}落在${hall.displayName}${hall.capacity.minimumTables}至${hall.capacity.maximumTables}桌的正式可承接範圍。`,
        ...item.reasons.slice(2),
      ],
    };
  });

  return {
    isComplete: true,
    recommendations,
    excludedHallIds: candidates.filter((hall) => !eligible.includes(hall)).map((hall) => hall.id),
    warnings: [],
  };
}

export function rankEligibleHallsByQuizResult(
  tableCount: number,
  quizResult: QuizResult,
  hallType: HallType = "single",
): QuizHallRecommendationResult {
  if (!quizResult.isComplete) {
    return {
      isComplete: false,
      recommendations: [],
      excludedHallIds: [],
      warnings: ["測驗尚未完成，不進行人格風格排序或廳房推薦。"],
    };
  }

  const hardFilterResult = recommendHalls(hallsData, { tableCount, hallType });
  return {
    isComplete: true,
    recommendations: limitHallRecommendations(
      rankHalls(hardFilterResult.eligibleHalls, tableCount, quizResult),
    ),
    excludedHallIds: hardFilterResult.excludedHalls.map(({ hall }) => hall.id),
    warnings: [],
  };
}

/** Applies the formal capacity hard filter, then returns at most three halls. */
export function rankHallsForBasicInfo(
  criteria: FlexibleRecommendationCriteria,
  quizResult: QuizResult,
): QuizHallRecommendationResult {
  if (!quizResult.isComplete) return rankEligibleHallsByQuizResult(1, quizResult);

  if (!criteria.tableCountUndecided && criteria.estimatedTableRange) {
    const single = rankEligibleHallsByTableRange(criteria.estimatedTableRange, quizResult, "single");
    const combined = rankEligibleHallsByTableRange(criteria.estimatedTableRange, quizResult, "combined");
    return {
      isComplete: true,
      recommendations: limitHallRecommendations([
        ...single.recommendations,
        ...combined.recommendations,
      ]),
      excludedHallIds: [...new Set([...single.excludedHallIds, ...combined.excludedHallIds])],
      warnings: [],
    };
  }

  if (!criteria.tableCountUndecided && criteria.estimatedTables !== null) {
    const single = rankEligibleHallsByQuizResult(criteria.estimatedTables, quizResult, "single");
    const combined = rankEligibleHallsByQuizResult(criteria.estimatedTables, quizResult, "combined");
    return {
      isComplete: true,
      recommendations: limitHallRecommendations([
        ...single.recommendations,
        ...combined.recommendations,
      ]),
      excludedHallIds: [...new Set([...single.excludedHallIds, ...combined.excludedHallIds])],
      warnings: [],
    };
  }

  const guestCount = criteria.estimatedGuests;
  if (guestCount === null) {
    return {
      isComplete: true,
      recommendations: [],
      excludedHallIds: [],
      warnings: ["桌數尚未決定，暫時無法提供推薦廳房。"],
    };
  }

  const activeHalls = hallsData.halls.filter((hall) => hall.status === "active");
  const eligible = activeHalls.filter((hall) => {
    const { minimumGuests, maximumGuests } = hall.capacity;
    return (
      minimumGuests !== undefined &&
      maximumGuests !== undefined &&
      (minimumGuests === null || guestCount >= minimumGuests) &&
      (maximumGuests === null || guestCount <= maximumGuests) &&
      (minimumGuests !== null || maximumGuests !== null)
    );
  });

  return {
    isComplete: true,
    recommendations: limitHallRecommendations(
      rankHalls(eligible, criteria.estimatedTables ?? 1, quizResult),
    ),
    excludedHallIds: activeHalls.filter((hall) => !eligible.includes(hall)).map((hall) => hall.id),
    warnings: [],
  };
}
