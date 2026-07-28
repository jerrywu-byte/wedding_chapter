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

export async function triggerPersonalityCardDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: "image/png" });
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    && navigator.share
    && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return;
  }
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = objectUrl;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
