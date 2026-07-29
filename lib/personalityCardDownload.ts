import { toBlob } from "html-to-image";

export async function waitForPersonalityCardAssets(node: HTMLElement) {
  await document.fonts.ready;
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(images.map((image) => image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })));
}

export async function createPersonalityCardPng(node: HTMLElement) {
  await waitForPersonalityCardAssets(node);
  const blob = await toBlob(node, {
    width: 1080,
    height: 1920,
    pixelRatio: 1,
    cacheBust: true,
    backgroundColor: "#4b392b",
  });
  if (!blob) throw new Error("無法產生人格卡圖片");
  return blob;
}

export function safePersonalityCardFileName(filename: string) {
  const withoutExtension = filename.replace(/\.png$/i, "");
  const safeName = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safeName || "Wedding_Chapter_Personality_Card";
}

export function createPersonalityCardFile(blob: Blob, filename: string) {
  const safeFileName = safePersonalityCardFileName(filename);
  return new File([blob], `${safeFileName}.png`, { type: "image/png" });
}

export function canSharePersonalityCardFile(file: File) {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function prefersPersonalityCardPreview() {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches
    || window.matchMedia("(max-width: 760px)").matches;
}

export function triggerPersonalityCardDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${safePersonalityCardFileName(filename)}.png`;
  link.href = objectUrl;
  link.rel = "noopener";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }
}
