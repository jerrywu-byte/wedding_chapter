import {
  RECOMMENDATION_STEPS,
  type BasicInfo,
  type RecommendationSession,
  type RecommendationStep,
} from "../types/recommendation-session";
import { QUIZ_VERSION } from "./quizData";

export const SESSION_STORAGE_KEY = "wedding-dna:recommendation-session:v1";
export const SUBMISSION_HISTORY_KEY = "wedding-dna:submission-history:v1";

const emptyBasicInfo: BasicInfo = {
  weddingDate: "", dateUndecided: false, timeSlot: "undecided",
  estimatedTables: null, estimatedGuests: null, tableCountUndecided: false,
};

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createRecommendationSession(now = new Date()): RecommendationSession {
  const iso = now.toISOString();
  return {
    sessionVersion: 3, quizVersion: QUIZ_VERSION, sessionId: id("dna"), currentStep: "welcome", basicInfo: { ...emptyBasicInfo },
    answers: [], quizResult: null, recommendations: [], manualConfirmationHalls: [],
    comparisonHallIds: [], ceremonyInterest: null,
    contactInfo: { groomName: "", brideName: "", phone: "", email: "", preferredHallIds: [], notes: "", privacyConsent: false },
    migrationWarnings: [],
    submissionId: null, createdAt: iso, updatedAt: iso,
  };
}

export function validateBasicInfo(info: BasicInfo): string[] {
  const errors: string[] = [];
  if (!info.weddingDate && !info.dateUndecided) errors.push("請選擇婚禮日期，或勾選日期尚未決定。");
  if (!info.timeSlot) errors.push("請選擇宴會時段。");
  if (!info.tableCountUndecided && info.estimatedTables === null && info.estimatedGuests === null) errors.push("請填寫預計桌數或預計人數，或勾選桌數尚未決定。");
  if (info.estimatedTables !== null && (!Number.isInteger(info.estimatedTables) || info.estimatedTables <= 0)) errors.push("預計桌數必須是正整數。");
  if (info.estimatedGuests !== null && (!Number.isInteger(info.estimatedGuests) || info.estimatedGuests <= 0)) errors.push("預計人數必須是正整數。");
  return errors;
}

export function safeStep(value: unknown): RecommendationStep {
  return RECOMMENDATION_STEPS.includes(value as RecommendationStep) ? value as RecommendationStep : "welcome";
}

export function migrateRecommendationSession(value: Partial<RecommendationSession> & { contactInfo?: Record<string, unknown> }): RecommendationSession | null {
    if (!value.sessionId || !value.createdAt || !value.basicInfo || !Array.isArray(value.answers)) return null;
    const base = createRecommendationSession();
    const legacyContact = (value.contactInfo ?? {}) as Record<string, unknown>;
    const legacyName = legacyContact.name;
    const currentContact = { ...legacyContact };
    delete currentContact.name;
    delete currentContact.lineId;
    delete currentContact.preferredContactMethod;
    const migrationWarnings = Array.isArray(value.migrationWarnings) ? value.migrationWarnings : [];
    if (typeof legacyName === "string" && legacyName.trim()) migrationWarnings.push("舊版姓名資料無法判斷屬於新郎或新娘，請重新填寫兩位姓名。");
    const quizVersionMatches = value.quizVersion === QUIZ_VERSION;
    const currentStep = quizVersionMatches
      ? safeStep(value.currentStep)
      : safeStep(value.currentStep) === "welcome"
        ? "welcome"
        : "basic-info";
    return {
      ...base,
      ...value,
      sessionVersion: 3,
      quizVersion: QUIZ_VERSION,
      currentStep,
      basicInfo: { ...base.basicInfo, ...value.basicInfo },
      answers: quizVersionMatches && Array.isArray(value.answers) ? value.answers : [],
      quizResult: quizVersionMatches ? value.quizResult ?? null : null,
      recommendations: quizVersionMatches && Array.isArray(value.recommendations) ? value.recommendations : [],
      manualConfirmationHalls: quizVersionMatches && Array.isArray(value.manualConfirmationHalls) ? value.manualConfirmationHalls : [],
      comparisonHallIds: quizVersionMatches && Array.isArray(value.comparisonHallIds) ? value.comparisonHallIds : [],
      contactInfo: { ...base.contactInfo, ...currentContact },
      migrationWarnings: [...new Set(migrationWarnings)],
      updatedAt: new Date().toISOString(),
    } as RecommendationSession;
}

export function restoreRecommendationSession(raw: string | null): RecommendationSession | null {
  if (!raw) return null;
  try {
    return migrateRecommendationSession(JSON.parse(raw));
  } catch { return null; }
}

export function addComparisonHall(ids: string[], hallId: string): string[] {
  if (ids.includes(hallId)) return ids;
  if (ids.length >= 3) throw new Error("最多只能比較 3 個廳房。");
  return [...ids, hallId];
}

export function removeComparisonHall(ids: string[], hallId: string): string[] {
  return ids.filter((id) => id !== hallId);
}

export function validatePhone(phone: string): boolean {
  const normalized = phone.replace(/[\s().-]/g, "");
  return /^\+?[0-9]{7,15}$/.test(normalized);
}

export function validateContactInfo(info: RecommendationSession["contactInfo"]): string[] {
  const errors: string[] = [];
  if (!info.groomName.trim()) errors.push("請填寫新郎姓名。");
  if (!info.brideName.trim()) errors.push("請填寫新娘姓名。");
  if (!validatePhone(info.phone)) errors.push("請填寫合理的手機、市話或國際電話格式。");
  if (!info.privacyConsent) errors.push("送出前請先同意個人資料使用說明。");
  return errors;
}
