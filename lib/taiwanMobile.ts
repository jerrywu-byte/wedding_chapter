export const TAIWAN_MOBILE_INPUT_ERROR = "請輸入正確的手機號碼，例如 0912-345-678";

const TAIWAN_MOBILE_SEPARATORS = /[\s\-–—－()（）.．/／]/g;
const TAIWAN_MOBILE_DIGITS = /^09\d{8}$/;

export function normalizeTaiwanMobile(value: unknown): string {
  const compact = String(value ?? "").trim().replace(TAIWAN_MOBILE_SEPARATORS, "");
  if (!TAIWAN_MOBILE_DIGITS.test(compact)) throw new Error("VALIDATION_ERROR");
  return `${compact.slice(0, 4)}-${compact.slice(4, 7)}-${compact.slice(7)}`;
}

export function formatTaiwanMobileForDisplay(value: unknown): string {
  const original = String(value ?? "").trim();
  try {
    return normalizeTaiwanMobile(original);
  } catch {
    return original;
  }
}
