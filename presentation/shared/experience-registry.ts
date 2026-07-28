import BrandColor from "../experiences/brandcolor/Experience";

export const experienceIds=["brandcolor"] as const;
export type ExperienceId=typeof experienceIds[number];
export const experienceMeta:Record<ExperienceId,{name:string;core:string;component:typeof BrandColor}>={
  brandcolor:{name:"DENWELL",core:"Golden Chapter",component:BrandColor},
};
