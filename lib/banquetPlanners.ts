import type { BanquetPlannerName } from "../types/wedding-experience";

export const BANQUET_PLANNERS = ["April", "Sean", "Jimmy", "Lisa", "Nidia", "Jerry", "Elle"] as const;

const PLANNER_CODES: Record<BanquetPlannerName, string> = {
  April: "APRIL",
  Sean: "SEAN",
  Jimmy: "JIMMY",
  Lisa: "LISA",
  Nidia: "NIDIA",
  Jerry: "JERRY",
  Elle: "ELLE",
};

export function getBanquetPlannerCode(name: BanquetPlannerName | ""): string | null {
  return name ? PLANNER_CODES[name] ?? null : null;
}
