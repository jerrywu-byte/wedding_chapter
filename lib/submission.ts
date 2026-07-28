import type { RecommendationSession } from "../types/recommendation-session";
import { SUBMISSION_HISTORY_KEY, validateContactInfo } from "./sessionState";

export interface RecommendationSubmission {
  submissionId: string;
  submittedAt: string;
  basicInfo: RecommendationSession["basicInfo"];
  answers: RecommendationSession["answers"];
  quizResult: NonNullable<RecommendationSession["quizResult"]>;
  recommendations: RecommendationSession["recommendations"];
  comparisonHallIds: string[];
  ceremonyInterest: boolean;
  contactInfo: RecommendationSession["contactInfo"];
}

const inFlight = new Map<string, Promise<RecommendationSubmission>>();

export function createSubmission(session: RecommendationSession): RecommendationSubmission {
  if (!session.quizResult?.isComplete) throw new Error("測驗尚未完成，暫時無法送出。");
  const contactErrors = validateContactInfo(session.contactInfo);
  if (contactErrors.length) throw new Error(contactErrors[0]);
  return {
    submissionId: `115DX-${Date.now().toString(36).toUpperCase()}`,
    submittedAt: new Date().toISOString(), basicInfo: session.basicInfo,
    answers: session.answers, quizResult: session.quizResult,
    recommendations: session.recommendations.slice(0, 3),
    comparisonHallIds: session.comparisonHallIds,
    ceremonyInterest: session.ceremonyInterest === true,
    contactInfo: session.contactInfo,
  };
}

export function mockSubmit(session: RecommendationSession, storage?: Storage): Promise<RecommendationSubmission> {
  const existing = inFlight.get(session.sessionId);
  if (existing) return existing;
  const task = Promise.resolve().then(() => {
    const submission = createSubmission(session);
    // TODO: 串接正式 API。
    // TODO: 寫入資料庫。
    // TODO: 通知業務。
    console.info("[Wedding DNA mock submission]", submission);
    if (storage) {
      const history = JSON.parse(storage.getItem(SUBMISSION_HISTORY_KEY) ?? "[]") as RecommendationSubmission[];
      if (!history.some((item) => item.submissionId === submission.submissionId)) storage.setItem(SUBMISSION_HISTORY_KEY, JSON.stringify([...history, submission]));
    }
    return submission;
  }).finally(() => inFlight.delete(session.sessionId));
  inFlight.set(session.sessionId, task);
  return task;
}
