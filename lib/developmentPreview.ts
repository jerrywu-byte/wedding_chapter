import type { WeddingProfile } from "../types/wedding-experience";
import type { SalesOption } from "./banquetPlanners";

export const DEVELOPMENT_PREVIEW_SALES_OPTION: SalesOption = {
  label: "Jerry",
  value: "PREVIEW_JERRY",
  lineUrl: "https://line.me/",
};

export function createDevelopmentPreviewProfile(): WeddingProfile {
  return {
    banquetPlanner: DEVELOPMENT_PREVIEW_SALES_OPTION.label,
    groomName: "測試新郎",
    groomPhone: "0900000000",
    brideName: "測試新娘",
    bridePhone: "0900000001",
    primaryContactType: "groom",
    primaryContactName: "測試新郎",
    primaryContactPhone: "0900000000",
    weddingDate: null,
    weddingDateUndecided: true,
    mealPeriod: "flexible",
    estimatedTables: 20,
    estimatedTableRangeId: "20-25",
  };
}
