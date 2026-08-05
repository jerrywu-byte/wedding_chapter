export interface SalesOption {
  label: string;
  value: string;
  lineUrl: string;
}

type SalesOptionsResponse = {
  success?: boolean;
  salesOptions?: unknown;
  message?: string;
  error?: string;
};

function isSalesOption(value: unknown): value is SalesOption {
  if (!value || typeof value !== "object") return false;
  const option = value as Partial<SalesOption>;
  return typeof option.label === "string"
    && Boolean(option.label.trim())
    && typeof option.value === "string"
    && Boolean(option.value.trim())
    && typeof option.lineUrl === "string"
    && /^https:\/\//i.test(option.lineUrl.trim());
}

export async function loadSalesOptions(): Promise<SalesOption[]> {
  const githubPagesEndpoint = import.meta.env?.VITE_GOOGLE_APPS_SCRIPT_WEB_APP_URL?.trim();
  const endpoint = globalThis.__WEDDING_CHAPTER_BASE_PATH__
    ? githubPagesEndpoint
    : "/api/submissions";
  if (!endpoint) throw new Error("業務名單服務尚未設定。請聯絡現場服務人員。");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "getSalesOptions" }),
    redirect: "follow",
  });
  const body = await response.json() as SalesOptionsResponse;
  if (!response.ok || !body.success || !Array.isArray(body.salesOptions)) {
    throw new Error(body.message || body.error || "暫時無法讀取業務名單。");
  }

  const seen = new Set<string>();
  return body.salesOptions.filter(isSalesOption).reduce<SalesOption[]>((options, option) => {
    const normalized = {
      label: option.label.trim(),
      value: option.value.trim().toUpperCase(),
      lineUrl: option.lineUrl.trim(),
    };
    if (seen.has(normalized.value)) return options;
    seen.add(normalized.value);
    options.push(normalized);
    return options;
  }, []);
}

export function getBanquetPlannerCode(name: string, salesOptions: readonly SalesOption[]): string | null {
  return salesOptions.find(option => option.label === name)?.value ?? null;
}

export function getSalesLineUrl(name: string, salesOptions: readonly SalesOption[]): string | null {
  return salesOptions.find(option => option.label === name)?.lineUrl ?? null;
}
