import personalityJson from "../data/wedding-personalities.json";
import {
  getWeddingPersonalities,
  getWeddingPersonalityById,
  validateWeddingPersonalityData,
} from "../weddingPersonalityRepository";
import type {
  WeddingPersonality,
} from "../types/wedding-personality";

export function getAllPersonalities(): WeddingPersonality[] {
  return getWeddingPersonalities({ includeInactive: true });
}

export function getActivePersonalities(): WeddingPersonality[] {
  return getWeddingPersonalities();
}

export function getPersonalityById(id: string): WeddingPersonality | null {
  return getWeddingPersonalityById(id, { includeInactive: true });
}

export function validatePersonalityData(
  data: unknown = personalityJson,
): string[] {
  return validateWeddingPersonalityData(data);
}
