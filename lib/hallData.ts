import hallJson from "../data/halls.json";
import { WEDDING_PERSONALITY_WEIGHT_KEYS } from "../types/wedding-personality";
import type { Hall, HallsData } from "../types/hall";

export const EXPECTED_HALL_DISPLAY_NAMES = {
  floral: "法蘿",
  mushi: "沐曦",
  yano: "雅諾",
  arthur: "亞瑟",
  elizabeth: "伊麗莎白",
  edinburgh: "愛丁堡",
  green: "格林",
  "purple-good": "紫艷好事",
  "purple-happiness": "紫艷喜事",
  "purple-grand": "紫艷盛事",
  century: "世紀",
  ceremony: "盛典",
  "nordic-light": "北歐光境",
  "purple-full": "紫艷盛事全",
  "century-ceremony": "世紀盛典",
} as const;

const hallData = hallJson as unknown as HallsData;

export function getAllHalls(): Hall[] {
  return hallData.halls;
}

export function getActiveHalls(): Hall[] {
  return hallData.halls.filter((hall) => hall.status === "active");
}

export function getHallById(id: string): Hall | null {
  return hallData.halls.find((hall) => hall.id === id) ?? null;
}

export function validateHallRecommendationWeights(
  data: unknown = hallJson,
): string[] {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null) {
    return ["廳房資料最外層必須是物件"];
  }

  const halls = (data as Record<string, unknown>).halls;
  if (!Array.isArray(halls)) return ["halls 必須是陣列"];

  halls.forEach((value, index) => {
    if (typeof value !== "object" || value === null) {
      errors.push(`halls[${index}] 必須是物件`);
      return;
    }

    const hall = value as Record<string, unknown>;
    if (hall.status !== "active") return;
    const prefix = typeof hall.id === "string" ? hall.id : `halls[${index}]`;

    if (hall.type !== "single" && hall.type !== "combined") {
      errors.push(`${prefix}: active 宴客廳 type 必須是 single 或 combined`);
    }

    if (
      typeof hall.recommendationWeights !== "object" ||
      hall.recommendationWeights === null
    ) {
      errors.push(`${prefix}: recommendationWeights 必須是物件`);
      return;
    }

    const weights = hall.recommendationWeights as Record<string, unknown>;
    const actualKeys = Object.keys(weights);
    for (const key of WEDDING_PERSONALITY_WEIGHT_KEYS) {
      if (!(key in weights)) {
        errors.push(`${prefix}: recommendationWeights.${key} 缺少`);
        continue;
      }
      const value = weights[key];
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 5) {
        errors.push(
          `${prefix}: recommendationWeights.${key} 必須是 0 至 5 的整數`,
        );
      }
    }

    const allowedKeys = new Set<string>(WEDDING_PERSONALITY_WEIGHT_KEYS);
    for (const key of actualKeys) {
      if (!allowedKeys.has(key)) {
        errors.push(`${prefix}: recommendationWeights 包含多餘欄位 ${key}`);
      }
    }
  });

  return errors;
}

export function validateExpectedHallDisplayNames(
  data: unknown = hallJson,
): string[] {
  if (typeof data !== "object" || data === null) {
    return ["廳房資料最外層必須是物件"];
  }
  const halls = (data as Record<string, unknown>).halls;
  if (!Array.isArray(halls)) return ["halls 必須是陣列"];

  const errors: string[] = [];
  for (const [id, expectedName] of Object.entries(EXPECTED_HALL_DISPLAY_NAMES)) {
    const hall = halls.find(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        (value as Record<string, unknown>).id === id,
    ) as Record<string, unknown> | undefined;
    if (!hall) errors.push(`缺少廳房 id：${id}`);
    else if (hall.displayName !== expectedName) {
      errors.push(
        `${id}: displayName 應為「${expectedName}」，目前為「${String(hall.displayName)}」`,
      );
    }
  }
  return errors;
}

export function getHallRecommendationWeightWarnings(
  data: unknown = hallJson,
): string[] {
  if (typeof data !== "object" || data === null) return [];
  const halls = (data as Record<string, unknown>).halls;
  if (!Array.isArray(halls)) return [];

  const configuredIds = new Set(Object.keys(EXPECTED_HALL_DISPLAY_NAMES));
  const warnings: string[] = [];
  for (const value of halls) {
    if (typeof value !== "object" || value === null) continue;
    const hall = value as Record<string, unknown>;
    if (hall.status !== "active" || typeof hall.id !== "string") continue;
    if (configuredIds.has(hall.id)) continue;
    if (typeof hall.recommendationWeights !== "object" || hall.recommendationWeights === null) {
      continue;
    }
    const weights = hall.recommendationWeights as Record<string, unknown>;
    if (
      WEDDING_PERSONALITY_WEIGHT_KEYS.every((key) => weights[key] === 0)
    ) {
      warnings.push(
        `${hall.id}: 未列於指定權重清單，且 recommendationWeights 仍全部為 0`,
      );
    }
  }
  return warnings;
}
