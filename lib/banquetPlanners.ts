import type { BanquetPlannerName } from "../types/wedding-experience";

export const SALES_OPTIONS = [
  { label: "April", value: "APRIL", lineUrl: "https://maac.io/3eqps" },
  { label: "Sean", value: "SEAN", lineUrl: "https://maac.io/3eqA9" },
  { label: "Jimmy", value: "JIMMY", lineUrl: "https://maac.io/3eqAK" },
  { label: "Lisa", value: "LISA", lineUrl: "https://maac.io/3eHta" },
  { label: "Nidia", value: "NIDIA", lineUrl: "https://maac.io/3eHII" },
  { label: "Jerry", value: "JERRY", lineUrl: "https://maac.io/3eHRf" },
  { label: "Elle", value: "ELLE", lineUrl: "https://maac.io/4BCtc" },
] as const satisfies readonly {
  label: BanquetPlannerName;
  value: string;
  lineUrl: string;
}[];

export const BANQUET_PLANNERS = SALES_OPTIONS.map(option => option.label);

export function getBanquetPlannerCode(name: BanquetPlannerName | ""): string | null {
  return SALES_OPTIONS.find(option => option.label === name)?.value ?? null;
}

export function getSalesLineUrl(name: BanquetPlannerName | ""): string | null {
  return SALES_OPTIONS.find(option => option.label === name)?.lineUrl ?? null;
}
