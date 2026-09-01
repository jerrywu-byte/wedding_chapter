import type { Hall } from "../types/hall";

// Only user-provided, verified venue photos belong in this allowlist.
// Combined/unknown halls must never borrow another venue or brand image.
export const VENUE_PHOTO_BY_HALL_ID = Object.freeze({
  floral: "/venue-photos/web/floral.webp",
  mushi: "/venue-photos/web/mushi.webp",
  yano: "/venue-photos/web/yano.webp",
  arthur: "/venue-photos/web/arthur.webp",
  elizabeth: "/venue-photos/web/elizabeth.webp",
  edinburgh: "/venue-photos/web/edinburgh.webp",
  green: "/venue-photos/web/green.webp",
  "purple-good": "/venue-photos/web/purple-good.webp",
  "purple-happiness": "/venue-photos/web/purple-happiness.webp",
  "purple-grand": "/venue-photos/web/purple-grand.webp",
  century: "/venue-photos/web/century.webp",
  ceremony: "/venue-photos/web/ceremony.webp",
  "nordic-light": "/venue-photos/original/nordic-light.jpg",
} as const);

export const VENUE_SHORT_DESCRIPTION_BY_HALL_ID = Object.freeze({
  floral: "空中閣樓與第二舞台，讓中型婚宴保有豐富的進場層次。",
  mushi: "米白與奶茶色調交織，營造柔和、溫暖的宴會氛圍。",
  yano: "適合精緻小型婚宴，並備有 120 吋電視呈現重要畫面。",
  arthur: "無樑柱的歐式皇室空間，視野開闊且富有典雅儀式感。",
  elizabeth: "奶油霜白與粉霧玫瑰色，呈現柔美的歐式宮廷氛圍。",
  edinburgh: "淺色木紋與古典燈飾相映，並設有升降星光大道。",
  green: "綠意植栽與溫暖木質交織，適合自然簡約的婚禮風格。",
  "purple-good": "暖金光影與霧紫層次，搭配星光大道與空中纜車。",
  "purple-happiness": "八米挑高的無樑柱空間，適合大器而流暢的婚宴動線。",
  "purple-grand": "都會時尚的霧紫場景，具備星光大道與多元進場設計。",
  century: "歐洲宮廷與藝術展間氛圍，搭配大型 LED 電視牆。",
  ceremony: "九米挑高的皇家宴會空間，適合大器且具舞台感的婚禮。",
} as const);

export function withWeddingChapterBasePath(path: string) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const basePath = globalThis.__WEDDING_CHAPTER_BASE_PATH__ || "/";
  return `${basePath.endsWith("/") ? basePath : `${basePath}/`}${normalizedPath}`;
}

export function getVenuePhotoPath(hallId: string): string | null {
  if (!Object.hasOwn(VENUE_PHOTO_BY_HALL_ID, hallId)) return null;
  return VENUE_PHOTO_BY_HALL_ID[hallId as keyof typeof VENUE_PHOTO_BY_HALL_ID];
}

export function getVenuePhotoSrc(hallId: string) {
  const path = getVenuePhotoPath(hallId);
  return path === null ? null : withWeddingChapterBasePath(path);
}

export function getVenueShortDescription(hall: Hall | null) {
  if (!hall) return "場地特色資料待確認，請由宴會顧問進一步介紹。";
  return VENUE_SHORT_DESCRIPTION_BY_HALL_ID[
    hall.id as keyof typeof VENUE_SHORT_DESCRIPTION_BY_HALL_ID
  ] ?? hall.features[0] ?? "場地特色資料待確認，請由宴會顧問進一步介紹。";
}
