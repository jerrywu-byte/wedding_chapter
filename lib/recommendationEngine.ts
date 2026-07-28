import hallJson from "../data/halls.json";
import {
  recommendHalls,
  type HallExclusionReason,
} from "../recommendationEngine";
import { WEDDING_PERSONALITY_WEIGHT_KEYS } from "../types/wedding-personality";
import type { Hall, HallsData, HallType } from "../types/hall";
import type {
  QuizDimensionTotals,
  QuizResult,
} from "../types/wedding-quiz";
import type { EstimatedTableRange } from "./tableRanges";

const hallsData = hallJson as unknown as HallsData;

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
  capacityStatus: "eligible" | "manual-confirmation";
}

export interface QuizHallRecommendationResult {
  isComplete: boolean;
  recommendations: RankedHallByQuiz[];
  manualConfirmationHalls: RankedHallByQuiz[];
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
    normalizedScore:
      maximumScore === 0
        ? 0
        : Math.round((rawScore / maximumScore) * 100),
    dimensionScores: resultDimensions,
  };
}

function getTopDimensionLabels(
  dimensionScores: QuizDimensionTotals,
): string[] {
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
  capacityStatus: "eligible" | "manual-confirmation" = "eligible",
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
  if (
    capacityStatus === "manual-confirmation" ||
    capacity.minimumTables === null ||
    capacity.maximumTables === null
  ) {
    reasons.push("目前缺少完整桌數容量資料，需由婚禮顧問人工確認。");
    warnings.push(
      `${hall.displayName}的桌數容量尚未完整提供，不列入已確認容量的正式推薦。`,
    );
  } else if (
    capacity.comfortableMinimumTables !== null &&
    capacity.comfortableMaximumTables !== null &&
    tableCount >= capacity.comfortableMinimumTables &&
    tableCount <= capacity.comfortableMaximumTables
  ) {
    reasons.push(
      `預計${tableCount}桌落在${hall.displayName}${capacity.comfortableMinimumTables}至${capacity.comfortableMaximumTables}桌的舒適範圍。`,
    );
  } else {
    reasons.push(
      `預計${tableCount}桌落在${hall.displayName}${capacity.minimumTables}至${capacity.maximumTables}桌的可承接範圍。`,
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

function rankHalls(
  halls: Hall[],
  tableCount: number,
  quizResult: QuizResult,
  capacityStatus: "eligible" | "manual-confirmation",
): RankedHallByQuiz[] {
  return halls
    .map((hall) => ({
      hall,
      style: calculateHallStyleScoreFromDimensions(
        quizResult.dimensionScores,
        hall.recommendationWeights,
      ),
      explanation: generateRecommendationReasons(
        hall,
        tableCount,
        quizResult.dimensionScores,
        capacityStatus,
      ),
    }))
    .map(({ hall, style, explanation }) => ({
      displayName: hall.displayName,
      capacityStatus,
      ...style,
      ...explanation,
    }))
    .sort(
      (a, b) =>
        b.normalizedScore - a.normalizedScore ||
        b.rawScore - a.rawScore ||
        a.hallId.localeCompare(b.hallId),
    );
}

function rangeOverlapsHall(range: EstimatedTableRange, hall: Hall): boolean {
  const { minimumTables, maximumTables } = hall.capacity;
  if (minimumTables === null || maximumTables === null) return false;
  const selectedMaximum = range.maximum ?? Number.POSITIVE_INFINITY;
  return maximumTables >= range.minimum && minimumTables <= selectedMaximum;
}

function rankEligibleHallsByTableRange(
  range: EstimatedTableRange,
  quizResult: QuizResult,
  hallType: HallType,
): QuizHallRecommendationResult {
  const candidates = hallsData.halls.filter(
    (hall) => hall.status === "active" && hall.type === hallType,
  );
  const eligible = candidates.filter((hall) => rangeOverlapsHall(range, hall));
  const manual = candidates.filter(
    (hall) => hall.capacity.minimumTables === null || hall.capacity.maximumTables === null,
  );
  const referenceCount = range.maximum ?? range.minimum;
  const recommendations = rankHalls(eligible, referenceCount, quizResult, "eligible").map((item) => {
    const hall = eligible.find((candidate) => candidate.id === item.hallId)!;
    return {
      ...item,
      reasons: [
        item.reasons[0],
        `選擇的${range.label}與${hall.displayName}${hall.capacity.minimumTables}至${hall.capacity.maximumTables}桌的可承接範圍相符。`,
        ...item.reasons.slice(2),
      ],
    };
  });
  return {
    isComplete: true,
    recommendations,
    manualConfirmationHalls: rankHalls(manual, referenceCount, quizResult, "manual-confirmation"),
    excludedHallIds: candidates
      .filter((hall) => !eligible.includes(hall) && !manual.includes(hall))
      .map((hall) => hall.id),
    warnings: manual.length
      ? ["另有容量資料不足的場地，已獨立列為人工確認，不納入正式推薦排序。"]
      : [],
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
      manualConfirmationHalls: [],
      excludedHallIds: [],
      warnings: ["測驗尚未完成，不進行人格風格排序或正式廳房推薦。"],
    };
  }

  const hardFilterResult = recommendHalls(hallsData, {
    tableCount,
    hallType,
  });
  const recommendations = rankHalls(
    hardFilterResult.eligibleHalls,
    tableCount,
    quizResult,
    "eligible",
  );

  const manualConfirmationHalls = hardFilterResult.excludedHalls
    .filter(
      ({ hall, reasons }) =>
        hall.status === "active" &&
        hall.type === hallType &&
        reasons.length === 1 &&
        reasons.includes("table-capacity-unknown" satisfies HallExclusionReason),
    )
    .map(({ hall }) => hall);

  return {
    isComplete: true,
    recommendations,
    manualConfirmationHalls: rankHalls(
      manualConfirmationHalls,
      tableCount,
      quizResult,
      "manual-confirmation",
    ),
    excludedHallIds: hardFilterResult.excludedHalls
      .filter(({ hall }) => !manualConfirmationHalls.some((item) => item.id === hall.id))
      .map(({ hall }) => hall.id),
    warnings:
      manualConfirmationHalls.length > 0
        ? ["另有容量資料不足的場地，已獨立列為人工確認，不納入正式推薦排序。"]
        : [],
  };
}

/** Frontend adapter: preserves the existing table hard filter and adds guest-only/manual states. */
export function rankHallsForBasicInfo(
  criteria: FlexibleRecommendationCriteria,
  quizResult: QuizResult,
): QuizHallRecommendationResult {
  if (!quizResult.isComplete) return rankEligibleHallsByQuizResult(1, quizResult);

  if (!criteria.tableCountUndecided && criteria.estimatedTableRange) {
    const single = rankEligibleHallsByTableRange(criteria.estimatedTableRange, quizResult, "single");
    const combined = rankEligibleHallsByTableRange(criteria.estimatedTableRange, quizResult, "combined");
    const official = [...single.recommendations, ...combined.recommendations]
      .filter((item, index, all) => all.findIndex((other) => other.hallId === item.hallId) === index)
      .sort((a, b) => b.normalizedScore - a.normalizedScore || a.hallId.localeCompare(b.hallId));
    const manual = [...single.manualConfirmationHalls, ...combined.manualConfirmationHalls]
      .filter((item, index, all) => all.findIndex((other) => other.hallId === item.hallId) === index)
      .sort((a, b) => b.normalizedScore - a.normalizedScore || a.hallId.localeCompare(b.hallId));
    return {
      isComplete: true,
      recommendations: official,
      manualConfirmationHalls: manual,
      excludedHallIds: [...new Set([...single.excludedHallIds, ...combined.excludedHallIds])],
      warnings: [...new Set([...single.warnings, ...combined.warnings])],
    };
  }

  if (!criteria.tableCountUndecided && criteria.estimatedTables !== null) {
    const single = rankEligibleHallsByQuizResult(criteria.estimatedTables, quizResult, "single");
    const combined = rankEligibleHallsByQuizResult(criteria.estimatedTables, quizResult, "combined");
    const official = [...single.recommendations, ...combined.recommendations]
      .filter((item, index, all) => all.findIndex((other) => other.hallId === item.hallId) === index)
      .sort((a, b) => b.normalizedScore - a.normalizedScore || a.hallId.localeCompare(b.hallId));
    const manual = [...single.manualConfirmationHalls, ...combined.manualConfirmationHalls]
      .filter((item, index, all) => all.findIndex((other) => other.hallId === item.hallId) === index)
      .sort((a, b) => b.normalizedScore - a.normalizedScore || a.hallId.localeCompare(b.hallId));
    return { isComplete: true, recommendations: official, manualConfirmationHalls: manual,
      excludedHallIds: [...new Set([...single.excludedHallIds, ...combined.excludedHallIds])],
      warnings: [...new Set([...single.warnings, ...combined.warnings])] };
  }

  const guestCount = criteria.estimatedGuests;
  const activeHalls = hallsData.halls.filter((hall) => hall.status === "active");
  const confirmed = guestCount === null ? [] : activeHalls.filter((hall) => {
    const { minimumGuests, maximumGuests } = hall.capacity;
    return minimumGuests !== undefined && maximumGuests !== undefined &&
      (minimumGuests === null || guestCount >= minimumGuests) &&
      (maximumGuests === null || guestCount <= maximumGuests) &&
      (minimumGuests !== null || maximumGuests !== null);
  });
  const manual = activeHalls.filter((hall) => !confirmed.some((item) => item.id === hall.id));
  const styleTableCount = criteria.estimatedTables ?? 1;
  return {
    isComplete: true,
    recommendations: guestCount === null ? [] : rankHalls(confirmed, styleTableCount, quizResult, "eligible"),
    manualConfirmationHalls: rankHalls(manual, styleTableCount, quizResult, "manual-confirmation"),
    excludedHallIds: [],
    warnings: [guestCount === null
      ? "桌數尚未決定，以下僅提供風格高匹配候選，容量均需人工確認。"
      : "目前僅有人數資料；不換算桌數，缺少人數容量的廳房均列為人工確認。"],
  };
}
