import type { HallSource, TimeSlot } from "./hall";

export interface CeremonyTimeSlot {
  banquetTimeSlot: TimeSlot;
  startTime: string;
  endTime: string;
}

export interface CeremonySpaceOption {
  id: string;
  displayName: string;
  style: {
    designStyles: string[];
    visualKeywords: string[];
  };
}

export interface CeremonySpace {
  id: string;
  displayName: string;
  type: "ceremony-package";
  status: "active" | "inactive";
  isBanquetHall: false;
  participatesInHallRecommendation: false;
  canBeBookedSeparately: false;
  requiresBanquetBooking: true;
  eligibleVenueId: string;
  bookingRule: {
    summary: string;
    requiresBookedHall: true;
    allowedHallIds: "all-active-banquet-halls" | string[];
    standaloneBookingAllowed: false;
  };
  durationMinutes: number;
  availableTimeSlots: CeremonyTimeSlot[];
  spaceOptions: CeremonySpaceOption[];
  packageIncludes: string[];
  optionalAddOns: string[];
  recommendedFor: {
    customerPreferences: string[];
  };
  salesNotes: {
    sellingPoints: string[];
    commonQuestions: string[];
    internalNotes: string[];
  };
  sources: HallSource[];
}

export function validateCeremonySpace(space: CeremonySpace): string[] {
  const errors: string[] = [];
  if (space.isBanquetHall || space.participatesInHallRecommendation) {
    errors.push(`${space.id}: 證婚空間不可作為宴會廳推薦`);
  }
  if (space.canBeBookedSeparately || !space.requiresBanquetBooking) {
    errors.push(`${space.id}: 必須限定已訂喜宴者加購`);
  }
  if (space.durationMinutes !== 60) {
    errors.push(`${space.id}: 證婚空間使用時間必須為 60 分鐘`);
  }
  return errors;
}
