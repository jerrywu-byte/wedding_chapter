import type {
  WeddingChapterSubmission,
  WeddingChapterSubmissionResult,
} from "../../../lib/weddingChapterSubmission";

type RuntimeEnv = {
  GOOGLE_APPS_SCRIPT_WEB_APP_URL?: string;
};

type SalesOptionsRequest = { action: "getSalesOptions" };

function isSalesOptionsRequest(payload: unknown): payload is SalesOptionsRequest {
  return Boolean(payload && typeof payload === "object" && (payload as Partial<SalesOptionsRequest>).action === "getSalesOptions");
}

function runtimeEnv(): RuntimeEnv {
  return (globalThis as typeof globalThis & { __SITE_ENV__?: RuntimeEnv }).__SITE_ENV__ ?? {};
}

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validate(payload: WeddingChapterSubmission): string | null {
  for (const field of [
    "submissionId", "partner1Name", "partner1Phone", "partner2Name",
    "partner2Phone", "emergencyContactName", "emergencyContactPhone",
    "banquetSession", "salesCode",
  ] as const) {
    if (!text(payload[field])) return `缺少必填欄位：${field}`;
  }
  if (!payload.dateUndecided && !text(payload.weddingDate)) return "缺少必填欄位：weddingDate";
  if (!["午宴", "晚宴", "都可以"].includes(payload.banquetSession)) return "宴會時段格式錯誤。";
  if (!Number.isFinite(Number(payload.estimatedTables)) || Number(payload.estimatedTables) <= 0) {
    return "預計桌數格式錯誤。";
  }
  return null;
}

export async function POST(request: Request) {
  let payload: WeddingChapterSubmission | SalesOptionsRequest;
  try {
    payload = await request.json() as WeddingChapterSubmission | SalesOptionsRequest;
  } catch {
    return Response.json({ success: false, status: "ERROR", message: "無效 JSON。" }, { status: 400 });
  }

  if (!isSalesOptionsRequest(payload)) {
    const validationError = validate(payload);
    if (validationError) {
      return Response.json({ success: false, status: "ERROR", message: validationError }, { status: 400 });
    }
  }

  const url = runtimeEnv().GOOGLE_APPS_SCRIPT_WEB_APP_URL;
  if (!url) {
    return Response.json(
      { success: false, status: "ERROR", message: "Google Sheets 服務尚未完成部署設定。" },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    const raw = await upstream.text();
    let result: (Partial<WeddingChapterSubmissionResult> & { error?: string; message?: string }) | null = null;
    try {
      result = JSON.parse(raw);
    } catch {
      return Response.json(
        { success: false, status: "ERROR", message: "Google Sheets 服務回傳無效 JSON。" },
        { status: 502 },
      );
    }

    if (isSalesOptionsRequest(payload)) {
      const salesResult = result as typeof result & { salesOptions?: unknown };
      if (!upstream.ok || !salesResult?.success || !Array.isArray(salesResult.salesOptions)) {
        return Response.json(
          { success: false, status: "ERROR", message: salesResult?.message || salesResult?.error || "業務名單讀取失敗。" },
          { status: 502 },
        );
      }
      return Response.json({ success: true, salesOptions: salesResult.salesOptions });
    }

    if (!upstream.ok || !result.success || !["SAVED", "ALREADY_SAVED"].includes(result.status ?? "")) {
      return Response.json(
        { success: false, status: result.status ?? "ERROR", message: result.message || result.error || "Google Sheets 儲存失敗。" },
        { status: 502 },
      );
    }
    if (!result.serialNumber?.trim()) {
      return Response.json(
        { success: false, status: "ERROR", message: "Google Sheets 未回傳訪客編號。" },
        { status: 502 },
      );
    }

    return Response.json({
      success: true,
      status: result.status,
      serialNumber: result.serialNumber,
      salesName: result.salesName,
    } satisfies WeddingChapterSubmissionResult);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return Response.json(
      {
        success: false,
        status: "ERROR",
        message: timedOut ? "Google Sheets 服務逾時。" : "無法連線至 Google Sheets 服務。",
      },
      { status: 502 },
    );
  }
}
