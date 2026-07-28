export const experienceIds = ["brandcolor"] as const;
export type ExperienceId = (typeof experienceIds)[number];

export const experienceMeta: Record<ExperienceId, { name: string; core: string }> = {
  brandcolor: { name: "DENWELL", core: "Golden Chapter" },
};
