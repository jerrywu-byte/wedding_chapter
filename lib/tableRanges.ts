export const ESTIMATED_TABLE_RANGES = [
  { id: "5-10", label: "5～10 桌", minimum: 5, maximum: 10 },
  { id: "10-15", label: "10～15 桌", minimum: 10, maximum: 15 },
  { id: "15-20", label: "15～20 桌", minimum: 15, maximum: 20 },
  { id: "20-25", label: "20～25 桌", minimum: 20, maximum: 25 },
  { id: "25-30", label: "25～30 桌", minimum: 25, maximum: 30 },
  { id: "30-35", label: "30～35 桌", minimum: 30, maximum: 35 },
  { id: "35-40", label: "35～40 桌", minimum: 35, maximum: 40 },
  { id: "40-50", label: "40～50 桌", minimum: 40, maximum: 50 },
  { id: "50-plus", label: "50 桌以上", minimum: 50, maximum: null },
] as const;

export type EstimatedTableRangeId = (typeof ESTIMATED_TABLE_RANGES)[number]["id"];
export type EstimatedTableRange = (typeof ESTIMATED_TABLE_RANGES)[number];

export function getEstimatedTableRange(id: EstimatedTableRangeId | "" | undefined) {
  return ESTIMATED_TABLE_RANGES.find((range) => range.id === id) ?? null;
}

export function isEstimatedTableRangeId(value: unknown): value is EstimatedTableRangeId {
  return ESTIMATED_TABLE_RANGES.some((range) => range.id === value);
}

export function tableRangeForLegacyCount(value: number | null | undefined): EstimatedTableRangeId | "" {
  if (!value || value < 5) return "";
  const match = ESTIMATED_TABLE_RANGES.find((range) =>
    range.maximum === null ? value >= range.minimum : value >= range.minimum && value <= range.maximum
  );
  return match?.id ?? "";
}
