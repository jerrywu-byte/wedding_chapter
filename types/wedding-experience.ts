import type { ExperienceId } from "../presentation/shared/experience-types";
import type { QuizResult, WeddingQuizAnswer } from "./wedding-quiz";
import type { RankedHallByQuiz } from "../lib/recommendationEngine";
import type { EstimatedTableRangeId } from "../lib/tableRanges";
export type WeddingExperienceStep="profile"|"opening"|"quiz"|"personality-result"|"venue-result"|"ending";
export type PrimaryContactType="groom"|"bride"|"other";
export type BanquetPlannerName=string;
export type BanquetMealPeriod="lunch"|"dinner"|"flexible";
export interface WeddingProfile{banquetPlanner:BanquetPlannerName|"";groomName:string;groomPhone:string;brideName:string;bridePhone:string;primaryContactType:PrimaryContactType;primaryContactName:string;primaryContactPhone:string;weddingDate:string|null;weddingDateUndecided:boolean;mealPeriod:BanquetMealPeriod|"";estimatedTables:number|null;estimatedTableRangeId:EstimatedTableRangeId|""}
export interface WeddingExperienceSession {
  version: 2;
  quizVersion: string;
  experienceId: ExperienceId;
  step: WeddingExperienceStep;
  profile: WeddingProfile;
  currentQuestionIndex: number;
  quizAnswers: WeddingQuizAnswer[];
  personalityResult: QuizResult | null;
  venueRecommendations: RankedHallByQuiz[];
  submissionClientId: string;
  submissionNumber: string | null;
  submittedAt: string | null;
}
