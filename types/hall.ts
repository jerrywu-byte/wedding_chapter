import type { CeremonySpace } from "./ceremony-space";

export type HallType = "single" | "combined";
export type HallStatus = "active" | "inactive";
export type TimeSlot = "lunch" | "dinner";

export interface HallCapacity {
  minimumTables: number | null;
  maximumTables: number | null;
  minimumGuests?: number | null;
  maximumGuests?: number | null;
}

export interface HallEquipment {
  ledScreen: boolean | null;
  ledScreenSizeInches: number | null;
  projector: boolean | null;
  projectionScreenCount: number | null;
  tv: boolean | null;
  tvSizeInches: number | null;
  soundSystem: boolean | null;
  microphone: boolean | null;
  starLightAisle: boolean | null;
  aerialCableEntrance: boolean | null;
  hangingGiftDeviceCount: number | null;
  loft: boolean | null;
  secondStage: boolean | null;
}

export interface HallSource {
  type: "officialWebsite" | "internalKnowledge";
  url: string | null;
  note: string;
}

export interface Hall {
  id: string;
  displayName: string;
  englishName: string | null;
  floor: string | null;
  type: HallType;
  status: HallStatus;
  capacity: HallCapacity;
  equipment: HallEquipment;
  equipmentInheritance: { inheritFromCombinedHalls: boolean };
  style: { primaryColors: string[]; designStyles: string[]; visualKeywords: string[] };
  features: string[];
  combinedHallIds: string[];
  recommendedPersonalities: string[];
  recommendedFor: {
    weddingStyles: string[];
    customerPreferences: string[];
    entranceMethods: string[];
    timeSlots: TimeSlot[];
  };
  notRecommendedFor: { customerPreferences: string[]; reasons: string[] };
  emotionTags: {
    firstImpression: string[];
    coupleFeeling: string[];
    familyFeeling: string[];
    guestFeeling: string[];
  };
  salesNotes: {
    sellingPoints: string[];
    commonComparisons: string[];
    commonQuestions: string[];
    internalNotes: string[];
  };
  recommendationWeights: Record<
    "romantic" | "elegant" | "modern" | "luxurious" | "warm" |
    "party" | "ceremony" | "interactive" | "photoFriendly" | "familyOriented",
    number
  >;
  sources: HallSource[];
}

export interface HallsData {
  version: string;
  venue: { id: string; name: string };
  halls: Hall[];
  ceremonySpaces: CeremonySpace[];
}

export function validateHall(hall: Hall): string[] {
  const errors: string[] = [];
  const { minimumTables: min, maximumTables: max } = hall.capacity;

  if (min !== null && max !== null && min > max) {
    errors.push(`${hall.id}: minimumTables 不可大於 maximumTables`);
  }
  return errors;
}

export function validateHallsData(data: HallsData): string[] {
  const errors = data.halls.flatMap(validateHall);
  const ids = new Set<string>();
  for (const hall of data.halls) {
    if (ids.has(hall.id)) errors.push(`${hall.id}: id 重複`);
    ids.add(hall.id);
  }
  return errors;
}
