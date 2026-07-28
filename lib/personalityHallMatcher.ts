import { getActiveHalls, getHallById } from "./hallData";
import { getPersonalityById } from "./personalityData";
import {
  WEDDING_PERSONALITY_WEIGHT_KEYS,
  type WeddingPersonalityWeightKey,
  type WeddingPersonalityWeights,
} from "../types/wedding-personality";

export type HallWeightVector = Record<WeddingPersonalityWeightKey, number>;
export type DimensionScores = Record<WeddingPersonalityWeightKey, number>;

export interface PersonalityHallScoreCalculation {
  rawScore: number;
  normalizedScore: number;
  dimensionScores: DimensionScores;
}

export interface PersonalityHallMatch extends PersonalityHallScoreCalculation {
  hallId: string;
  personalityId: string;
}

export type PersonalityHallMatcherErrorCode =
  | "PERSONALITY_NOT_FOUND"
  | "HALL_NOT_FOUND"
  | "INVALID_WEIGHTS";

export class PersonalityHallMatcherError extends Error {
  constructor(
    public readonly code: PersonalityHallMatcherErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PersonalityHallMatcherError";
  }
}

function assertWeightVector(
  weights: Record<string, unknown>,
  label: string,
): void {
  const actualKeys = Object.keys(weights);
  if (
    actualKeys.length !== WEDDING_PERSONALITY_WEIGHT_KEYS.length ||
    WEDDING_PERSONALITY_WEIGHT_KEYS.some((key) => !(key in weights))
  ) {
    throw new PersonalityHallMatcherError(
      "INVALID_WEIGHTS",
      `${label} 必須包含完整十個推薦權重欄位`,
    );
  }
  for (const key of WEDDING_PERSONALITY_WEIGHT_KEYS) {
    const value = weights[key];
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 5) {
      throw new PersonalityHallMatcherError(
        "INVALID_WEIGHTS",
        `${label}.${key} 必須是 0 至 5 的整數`,
      );
    }
  }
}

export function calculatePersonalityHallScore(
  personalityWeights: WeddingPersonalityWeights,
  hallWeights: HallWeightVector,
): PersonalityHallScoreCalculation {
  assertWeightVector(personalityWeights, "personalityWeights");
  assertWeightVector(hallWeights, "hallWeights");

  const dimensionScores = {} as DimensionScores;
  let rawScore = 0;
  let personalityWeightTotal = 0;

  for (const key of WEDDING_PERSONALITY_WEIGHT_KEYS) {
    const dimensionScore = personalityWeights[key] * hallWeights[key];
    dimensionScores[key] = dimensionScore;
    rawScore += dimensionScore;
    personalityWeightTotal += personalityWeights[key];
  }

  const maximumScore = personalityWeightTotal * 5;
  const normalizedScore =
    maximumScore === 0 ? 0 : Math.round((rawScore / maximumScore) * 100);

  return { rawScore, normalizedScore, dimensionScores };
}

export function comparePersonalityWithHall(
  personalityId: string,
  hallId: string,
): PersonalityHallMatch {
  const personality = getPersonalityById(personalityId);
  if (!personality) {
    throw new PersonalityHallMatcherError(
      "PERSONALITY_NOT_FOUND",
      `找不到婚禮人格：${personalityId}`,
    );
  }

  const hall = getHallById(hallId);
  if (!hall) {
    throw new PersonalityHallMatcherError(
      "HALL_NOT_FOUND",
      `找不到宴客廳：${hallId}`,
    );
  }

  return {
    hallId,
    personalityId,
    ...calculatePersonalityHallScore(
      personality.weights,
      hall.recommendationWeights,
    ),
  };
}

/**
 * Pure style ranking only. It intentionally does not evaluate table capacity,
 * date, availability, or booking eligibility. Production recommendations must
 * first use recommendationEngine.ts, then sort those eligible halls by score.
 */
export function rankHallsByPersonality(
  personalityId: string,
): PersonalityHallMatch[] {
  const personality = getPersonalityById(personalityId);
  if (!personality) {
    throw new PersonalityHallMatcherError(
      "PERSONALITY_NOT_FOUND",
      `找不到婚禮人格：${personalityId}`,
    );
  }

  return getActiveHalls()
    .map((hall) => ({
      hallId: hall.id,
      personalityId,
      ...calculatePersonalityHallScore(
        personality.weights,
        hall.recommendationWeights,
      ),
    }))
    .sort(
      (a, b) =>
        b.normalizedScore - a.normalizedScore ||
        b.rawScore - a.rawScore ||
        a.hallId.localeCompare(b.hallId),
    );
}
