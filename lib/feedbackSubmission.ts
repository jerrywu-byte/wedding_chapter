import type { FeedbackAnswers } from "../presentation/feedback/feedbackQuestions";

export type FeedbackContext = {
  success: true;
  status: "PENDING" | "COMPLETED";
  eventDate: string;
  coupleName: string;
};

export type FeedbackSubmitResult = {
  success: true;
  status: "COMPLETED" | "ALREADY_COMPLETED";
  submittedAt: string;
};

function getEndpoint(): string {
  return import.meta.env?.VITE_GOOGLE_APPS_SCRIPT_WEB_APP_URL?.trim() ?? "";
}

async function postFeedback<T>(body: Record<string, unknown>): Promise<T> {
  const endpoint = getEndpoint();
  if (!endpoint) throw new Error("回饋服務尚未完成正式部署設定。");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
    redirect: "follow",
  });

  const payload = await response.json() as T & {
    success?: boolean;
    message?: string;
    error?: string;
  };

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || payload.error || "回饋服務暫時無法使用。");
  }

  return payload;
}

export function loadFeedbackContext(token: string): Promise<FeedbackContext> {
  return postFeedback<FeedbackContext>({
    action: "getFeedbackContext",
    token,
  });
}

export function submitFeedback(
  token: string,
  answers: FeedbackAnswers,
): Promise<FeedbackSubmitResult> {
  return postFeedback<FeedbackSubmitResult>({
    action: "saveFeedback",
    token,
    ...answers,
  });
}
