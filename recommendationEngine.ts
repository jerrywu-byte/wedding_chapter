import type { CeremonySpace } from "./types/ceremony-space";
import type { Hall, HallsData, HallType } from "./types/hall";

export type HallExclusionReason =
  | "inactive"
  | "hall-type-mismatch"
  | "table-capacity-unknown"
  | "below-minimum-tables"
  | "above-maximum-tables";

export interface HallRecommendationCriteria {
  tableCount: number;
  /**
   * Defaults to single so combined halls never appear as ordinary hall
   * recommendations. Callers must explicitly request combined halls.
   */
  hallType?: HallType;
}

export interface ExcludedHall {
  hall: Hall;
  reasons: HallExclusionReason[];
}

export interface HallRecommendationResult {
  eligibleHalls: Hall[];
  excludedHalls: ExcludedHall[];
}

export interface CeremonyEligibility {
  hasBanquetBooking: boolean;
  bookedVenueId?: string | null;
}

export type CeremonyExclusionReason =
  | "inactive"
  | "banquet-hall-data"
  | "participates-in-hall-recommendation"
  | "banquet-booking-required"
  | "venue-mismatch";

export interface ExcludedCeremonySpace {
  ceremonySpace: CeremonySpace;
  reasons: CeremonyExclusionReason[];
}

export interface CeremonyEligibilityResult {
  eligibleCeremonySpaces: CeremonySpace[];
  excludedCeremonySpaces: ExcludedCeremonySpace[];
}

function assertValidTableCount(tableCount: number): void {
  if (!Number.isFinite(tableCount) || tableCount <= 0) {
    throw new RangeError("tableCount 必須是大於 0 的有限數字");
  }
}

function getHallExclusionReasons(
  hall: Hall,
  tableCount: number,
  hallType: HallType,
): HallExclusionReason[] {
  const reasons: HallExclusionReason[] = [];

  if (hall.status !== "active") reasons.push("inactive");
  if (hall.type !== hallType) reasons.push("hall-type-mismatch");

  const { minimumTables, maximumTables } = hall.capacity;
  if (minimumTables === null || maximumTables === null) {
    reasons.push("table-capacity-unknown");
    return reasons;
  }

  if (tableCount < minimumTables) {
    reasons.push("below-minimum-tables");
  }
  if (tableCount > maximumTables) {
    reasons.push("above-maximum-tables");
  }
  return reasons;
}

/**
 * Filters banquet halls by operational table capacity and hall type only.
 * No personality, style, equipment, or recommendation-weight scoring is used.
 */
export function recommendHalls(
  data: HallsData,
  criteria: HallRecommendationCriteria,
): HallRecommendationResult {
  assertValidTableCount(criteria.tableCount);
  const hallType = criteria.hallType ?? "single";
  const eligibleHalls: Hall[] = [];
  const excludedHalls: ExcludedHall[] = [];

  for (const hall of data.halls) {
    const reasons = getHallExclusionReasons(hall, criteria.tableCount, hallType);
    if (reasons.length === 0) eligibleHalls.push(hall);
    else excludedHalls.push({ hall, reasons });
  }

  return { eligibleHalls, excludedHalls };
}

/**
 * Ceremony spaces are evaluated separately and can never enter hall results.
 * A package requiring a banquet booking is returned only after that
 * qualification and venue match have been confirmed.
 */
export function getEligibleCeremonySpaces(
  data: HallsData,
  eligibility: CeremonyEligibility,
): CeremonyEligibilityResult {
  const eligibleCeremonySpaces: CeremonySpace[] = [];
  const excludedCeremonySpaces: ExcludedCeremonySpace[] = [];

  for (const ceremonySpace of data.ceremonySpaces) {
    const reasons: CeremonyExclusionReason[] = [];

    if (ceremonySpace.status !== "active") reasons.push("inactive");
    if (ceremonySpace.isBanquetHall) reasons.push("banquet-hall-data");
    if (ceremonySpace.participatesInHallRecommendation) {
      reasons.push("participates-in-hall-recommendation");
    }
    if (ceremonySpace.requiresBanquetBooking && !eligibility.hasBanquetBooking) {
      reasons.push("banquet-booking-required");
    }
    if (
      eligibility.hasBanquetBooking &&
      eligibility.bookedVenueId !== ceremonySpace.eligibleVenueId
    ) {
      reasons.push("venue-mismatch");
    }

    if (reasons.length === 0) eligibleCeremonySpaces.push(ceremonySpace);
    else excludedCeremonySpaces.push({ ceremonySpace, reasons });
  }

  return { eligibleCeremonySpaces, excludedCeremonySpaces };
}
