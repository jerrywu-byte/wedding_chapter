import { getBanquetPlannerCode, type SalesOption } from "./banquetPlanners";
import type { WeddingExperienceSession } from "../types/wedding-experience";

export interface WeddingChapterSubmission {
  submissionId: string;
  partner1Name: string;
  partner1Phone: string;
  partner2Name: string;
  partner2Phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  weddingDate: string;
  dateUndecided: boolean;
  banquetSession: "午宴" | "晚宴" | "都可以";
  estimatedTables: number;
  salesCode: string;
}

export interface WeddingChapterSubmissionResult {
  success: true;
  status: "SAVED" | "ALREADY_SAVED";
  serialNumber: string;
  salesName: string;
}

export function createWeddingChapterSubmission(
  session: WeddingExperienceSession,
  salesOptions: readonly SalesOption[],
): WeddingChapterSubmission {
  const profile = session.profile;
  const salesCode = getBanquetPlannerCode(profile.banquetPlanner, salesOptions);
  if (!salesCode) throw new Error("尚未選擇宴會企劃。");
  if (!session.submissionClientId) throw new Error("缺少送出識別碼。");
  if (!profile.mealPeriod) throw new Error("尚未選擇宴會時段。");
  if (!profile.estimatedTables) throw new Error("尚未填寫預計桌數。");

  return {
    submissionId: session.submissionClientId,
    partner1Name: profile.groomName,
    partner1Phone: profile.groomPhone,
    partner2Name: profile.brideName,
    partner2Phone: profile.bridePhone,
    emergencyContactName: profile.primaryContactName,
    emergencyContactPhone: profile.primaryContactPhone,
    weddingDate: profile.weddingDate ?? "",
    dateUndecided: profile.weddingDateUndecided,
    banquetSession:
      profile.mealPeriod === "lunch"
        ? "午宴"
        : profile.mealPeriod === "dinner"
          ? "晚宴"
          : "都可以",
    estimatedTables: profile.estimatedTables,
    salesCode,
  };
}

const activeSubmissions = new Map<string, Promise<WeddingChapterSubmissionResult>>();

export function submitWeddingChapter(
  payload: WeddingChapterSubmission,
): Promise<WeddingChapterSubmissionResult> {
  const existing = activeSubmissions.get(payload.submissionId);
  if (existing) return existing;

  const githubPagesEndpoint = import.meta.env?.VITE_GOOGLE_APPS_SCRIPT_WEB_APP_URL?.trim();
  const endpoint = globalThis.__WEDDING_CHAPTER_BASE_PATH__
    ? githubPagesEndpoint
    : "/api/submissions";
  if (!endpoint) {
    return Promise.reject(new Error("正式送出服務尚未設定。請聯絡網站管理者。"));
  }

  const requestOptions: RequestInit = {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow",
  };
  const submissionRequest = globalThis.__WEDDING_CHAPTER_BASE_PATH__
    ? fetch(endpoint, requestOptions)
    : fetch("/api/submissions", requestOptions);

  const request = submissionRequest.then(async response => {
    const body = await response.json() as Partial<WeddingChapterSubmissionResult> & { error?: string; message?: string };
    if (!response.ok || !body.success) throw new Error(body.message || body.error || "資料暫時無法送出。");
    if (!body.serialNumber?.trim()) throw new Error("Google Sheets 未回傳訪客編號。");
    return body as WeddingChapterSubmissionResult;
  }).finally(() => {
    activeSubmissions.delete(payload.submissionId);
  });

  activeSubmissions.set(payload.submissionId, request);
  return request;
}
