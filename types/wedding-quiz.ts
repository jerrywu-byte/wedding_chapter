import type {
  WeddingPersonalityResultCard,
  WeddingPersonalityWeightKey,
} from "./wedding-personality";

export type QuizOptionWeight = 0 | 1 | 2 | 3;

export type QuizDimensionWeights = Record<
  WeddingPersonalityWeightKey,
  QuizOptionWeight
>;

export type QuizDimensionTotals = Record<WeddingPersonalityWeightKey, number>;

export type MainPersonalityId =
  | "moonlight-poet"
  | "starlight-star"
  | "forest-collector"
  | "royal-curator"
  | "urban-dreamer"
  | "gentle-gatherer";

export type HiddenPersonalityId =
  | "ceremony-dreamer"
  | "celebration-director";

export interface WeddingQuizOption {
  questionId: string;
  optionId: string;
  text: string;
  personalityScores: Partial<Record<MainPersonalityId, number>>;
  hiddenPersonalityScores: Partial<Record<HiddenPersonalityId, number>>;
  traits: string[];
  experienceTags: string[];
}

export interface WeddingQuizQuestion {
  id: string;
  order: number;
  title: string;
  selectionType: "single";
  options: WeddingQuizOption[];
  status: "active" | "inactive";
}

export interface WeddingQuizData {
  version: string;
  questions: WeddingQuizQuestion[];
}

export interface WeddingQuizAnswer {
  questionId: string;
  optionId: string;
}

export interface HiddenPersonalityEvaluation {
  personalityId: HiddenPersonalityId;
  score: number;
  scoredQuestionCount: number;
  traits: string[];
  triggered: boolean;
}

export interface PersonalityRankingResult {
  rank: number;
  id: string;
  personalityId: string;
  displayName: string;
  score: number;
  rawScore: number;
  normalizedScore: number;
  dimensionScores: QuizDimensionTotals;
  resultCard?: WeddingPersonalityResultCard;
}

export interface QuizResult {
  answers: WeddingQuizAnswer[];
  dimensionScores: QuizDimensionTotals;
  dimensionTotals: QuizDimensionTotals;
  primaryPersonality: PersonalityRankingResult | null;
  secondaryPersonality: PersonalityRankingResult | null;
  personalityRanking: PersonalityRankingResult[];
  personalityRankings: PersonalityRankingResult[];
  mainPersonalityScores: Record<MainPersonalityId, number>;
  hiddenPersonalityEvaluations: HiddenPersonalityEvaluation[];
  experienceTags: string[];
  answeredQuestionCount: number;
  isComplete: boolean;
}

export interface QuizAnswerValidationResult {
  isComplete: boolean;
  answeredQuestionCount: number;
  missingQuestionIds: string[];
}
