import personalityJson from "./data/wedding-personalities.json";
import {
  WEDDING_PERSONALITY_WEIGHT_KEYS,
  type WeddingPersonality,
  type WeddingPersonalityData,
} from "./types/wedding-personality";

export interface WeddingPersonalityQuery {
  includeInactive?: boolean;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

export function validateWeddingPersonalityData(data: unknown): string[] {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null) {
    return ["人格資料最外層必須是物件"];
  }

  const root = data as Record<string, unknown>;
  if (!isNonEmptyString(root.version)) errors.push("version 必須是非空字串");
  if (!Array.isArray(root.personalities)) {
    errors.push("personalities 必須是陣列");
    return errors;
  }

  const ids = new Set<string>();
  const displayNames = new Set<string>();

  root.personalities.forEach((value, index) => {
    const prefix = `personalities[${index}]`;
    if (typeof value !== "object" || value === null) {
      errors.push(`${prefix} 必須是物件`);
      return;
    }

    const personality = value as Record<string, unknown>;
    if (!isNonEmptyString(personality.id)) errors.push(`${prefix}.id 無效`);
    else if (ids.has(personality.id)) errors.push(`${prefix}.id 重複：${personality.id}`);
    else ids.add(personality.id);

    if (!isNonEmptyString(personality.displayName)) {
      errors.push(`${prefix}.displayName 無效`);
    } else if (displayNames.has(personality.displayName)) {
      errors.push(`${prefix}.displayName 重複：${personality.displayName}`);
    } else displayNames.add(personality.displayName);

    for (const key of ["subtitle", "description"] as const) {
      if (!isNonEmptyString(personality[key])) errors.push(`${prefix}.${key} 無效`);
    }
    if (typeof personality.heroImage !== "object" || personality.heroImage === null) {
      errors.push(`${prefix}.heroImage 必須是物件`);
    } else {
      const heroImage = personality.heroImage as Record<string, unknown>;
      for (const key of ["desktop", "mobile", "alt"] as const) {
        if (!isNonEmptyString(heroImage[key])) {
          errors.push(`${prefix}.heroImage.${key} 無效`);
        }
      }
      for (const key of ["focalPointDesktop", "focalPointMobile"] as const) {
        if (heroImage[key] !== undefined && !isNonEmptyString(heroImage[key])) {
          errors.push(`${prefix}.heroImage.${key} 無效`);
        }
      }
    }
    for (const key of ["keywords", "preferredFeatures", "avoidedFeatures"] as const) {
      if (!isStringArray(personality[key])) errors.push(`${prefix}.${key} 必須是字串陣列`);
    }
    if (Array.isArray(personality.keywords) && personality.keywords.length === 0) {
      errors.push(`${prefix}.keywords 不可為空陣列`);
    }

    if (typeof personality.weights !== "object" || personality.weights === null) {
      errors.push(`${prefix}.weights 必須是物件`);
    } else {
      const weights = personality.weights as Record<string, unknown>;
      for (const key of WEDDING_PERSONALITY_WEIGHT_KEYS) {
        const score = weights[key];
        if (!Number.isInteger(score) || (score as number) < 0 || (score as number) > 5) {
          errors.push(`${prefix}.weights.${key} 必須是 0 至 5 的整數`);
        }
      }
    }

    if (
      personality.status === "active" &&
      (typeof personality.resultCard !== "object" || personality.resultCard === null)
    ) {
      errors.push(`${prefix}.resultCard 為 active 人格必填欄位`);
    }
    if (typeof personality.resultCard === "object" && personality.resultCard !== null) {
      const resultCard = personality.resultCard as Record<string, unknown>;
      for (const key of ["headline", "summary", "tone"] as const) {
        if (!isNonEmptyString(resultCard[key])) errors.push(`${prefix}.resultCard.${key} 無效`);
      }
    }

    if (personality.observations !== undefined && !isStringArray(personality.observations)) {
      errors.push(`${prefix}.observations 必須是字串陣列`);
    }
    if (personality.scene !== undefined) {
      if (typeof personality.scene !== "object" || personality.scene === null) errors.push(`${prefix}.scene 必須是物件`);
      else {
        const scene = personality.scene as Record<string, unknown>;
        if (scene.speaker !== undefined && !isNonEmptyString(scene.speaker)) errors.push(`${prefix}.scene.speaker 無效`);
        if (!isStringArray(scene.lines)) errors.push(`${prefix}.scene.lines 必須是字串陣列`);
      }
    }
    if (personality.specialAbility !== undefined) {
      if (typeof personality.specialAbility !== "object" || personality.specialAbility === null) errors.push(`${prefix}.specialAbility 必須是物件`);
      else for (const key of ["label", "value"] as const) if (!isNonEmptyString((personality.specialAbility as Record<string, unknown>)[key])) errors.push(`${prefix}.specialAbility.${key} 無效`);
    }
    if (personality.aiSecret !== undefined && !isNonEmptyString(personality.aiSecret)) errors.push(`${prefix}.aiSecret 無效`);

    if (personality.status !== "active" && personality.status !== "inactive") {
      errors.push(`${prefix}.status 必須是 active 或 inactive`);
    }
  });

  return errors;
}

const validationErrors = validateWeddingPersonalityData(personalityJson);
if (validationErrors.length > 0) {
  throw new Error(`婚禮人格資料驗證失敗：\n${validationErrors.join("\n")}`);
}

const personalityData = personalityJson as unknown as WeddingPersonalityData;

export function getWeddingPersonalityData(): WeddingPersonalityData {
  return personalityData;
}

export function getWeddingPersonalities(
  query: WeddingPersonalityQuery = {},
): WeddingPersonality[] {
  return personalityData.personalities.filter(
    (personality) => query.includeInactive || personality.status === "active",
  );
}

export function getWeddingPersonalityById(
  id: string,
  query: WeddingPersonalityQuery = {},
): WeddingPersonality | null {
  return (
    getWeddingPersonalities(query).find((personality) => personality.id === id) ?? null
  );
}
