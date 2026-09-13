const MAX_RECOMMENDED_HALLS = 3;

export interface PersonalityDownloadState {
  personalityId: string;
  hallIds: string[];
}

export function createPersonalityDownloadUrl(state: PersonalityDownloadState) {
  const basePath = globalThis.__WEDDING_CHAPTER_BASE_PATH__ || "/";
  const url = new URL(basePath, window.location.origin);
  url.searchParams.set("download", "personality");
  url.searchParams.set("personality", state.personalityId);
  if (state.hallIds.length) {
    url.searchParams.set("halls", state.hallIds.slice(0, MAX_RECOMMENDED_HALLS).join(","));
  }
  return url.toString();
}

export function readPersonalityDownloadState(search: string): PersonalityDownloadState | null {
  const params = new URLSearchParams(search);
  if (params.get("download") !== "personality") return null;
  const personalityId = params.get("personality")?.trim() ?? "";
  if (!personalityId) return null;
  const hallIds = (params.get("halls") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_RECOMMENDED_HALLS);
  return { personalityId, hallIds };
}

export function personalityDownloadUrlContainsPersonalData(url: string) {
  const params = new URL(url).searchParams;
  const allowedKeys = new Set(["download", "personality", "halls"]);
  return Array.from(params.keys()).some((key) => !allowedKeys.has(key));
}
