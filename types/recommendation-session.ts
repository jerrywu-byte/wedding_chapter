import type { QuizResult, WeddingQuizAnswer } from "./wedding-quiz";
import type { RankedHallByQuiz } from "../lib/recommendationEngine";

export const RECOMMENDATION_STEPS = [
  "welcome", "basic-info", "quiz", "analyzing", "personality-result",
  "hall-results", "hall-comparison", "ceremony-addon", "contact", "completed",
] as const;

export type RecommendationStep = (typeof RECOMMENDATION_STEPS)[number];
export type WeddingTimeSlot = "lunch" | "dinner" | "undecided";

export interface BasicInfo {
  weddingDate: string;
  dateUndecided: boolean;
  timeSlot: WeddingTimeSlot;
  estimatedTables: number | null;
  estimatedGuests: number | null;
  tableCountUndecided: boolean;
}

export interface ContactInfo {
  groomName: string;
  brideName: string;
  phone: string;
  email: string;
  preferredHallIds: string[];
  notes: string;
  privacyConsent: boolean;
}

export interface RecommendationSession {
  sessionVersion: 4;
  quizVersion: string;
  sessionId: string;
  currentStep: RecommendationStep;
  basicInfo: BasicInfo;
  answers: WeddingQuizAnswer[];
  quizResult: QuizResult | null;
  recommendations: RankedHallByQuiz[];
  comparisonHallIds: string[];
  ceremonyInterest: boolean | null;
  contactInfo: ContactInfo;
  migrationWarnings: string[];
  submissionId: string | null;
  createdAt: string;
  updatedAt: string;
}
