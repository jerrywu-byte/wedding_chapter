export const WEDDING_PERSONALITY_WEIGHT_KEYS = [
  "romantic",
  "elegant",
  "modern",
  "luxurious",
  "warm",
  "party",
  "ceremony",
  "interactive",
  "photoFriendly",
  "familyOriented",
] as const;

export type WeddingPersonalityWeightKey =
  (typeof WEDDING_PERSONALITY_WEIGHT_KEYS)[number];

export type WeddingPersonalityWeight = 0 | 1 | 2 | 3 | 4 | 5;

export type WeddingPersonalityWeights = Record<
  WeddingPersonalityWeightKey,
  WeddingPersonalityWeight
>;

export type WeddingPersonalityTone =
  | "poetic"
  | "dramatic"
  | "natural"
  | "royal"
  | "modern"
  | "warm"
  | "ceremonial"
  | "celebratory";

export interface WeddingPersonalityResultCard {
  headline: string;
  summary: string;
  tone: WeddingPersonalityTone;
}

export interface WeddingPersonalityScene {
  speaker?: string;
  lines: string[];
}

export interface WeddingPersonalitySpecialAbility {
  label: string;
  value: string;
}

export interface WeddingPersonalityHeroImage {
  desktop: string;
  mobile: string;
  alt: string;
  focalPointDesktop?: string;
  focalPointMobile?: string;
}

export interface WeddingPersonalityStoryContent {
  observations?: string[];
  scene?: WeddingPersonalityScene;
  specialAbility?: WeddingPersonalitySpecialAbility;
  aiSecret?: string;
}

export interface WeddingPersonality extends WeddingPersonalityStoryContent {
  id: string;
  displayName: string;
  subtitle: string;
  description: string;
  heroImage: WeddingPersonalityHeroImage;
  keywords: string[];
  preferredFeatures: string[];
  avoidedFeatures: string[];
  weights: WeddingPersonalityWeights;
  resultCard?: WeddingPersonalityResultCard;
  status: "active" | "inactive";
}

export interface WeddingPersonalityData {
  version: string;
  personalities: WeddingPersonality[];
}
