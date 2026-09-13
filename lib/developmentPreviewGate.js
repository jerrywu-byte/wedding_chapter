/**
 * Preview bypass is valid only when the build itself is running in Vite
 * development mode and the local URL explicitly opts in.
 */
export function isDevelopmentPreviewRequest(isDevelopment, search) {
  return Boolean(isDevelopment)
    && new URLSearchParams(search).get("preview") === "1";
}
