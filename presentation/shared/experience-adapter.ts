import quizJson from "../../data/wedding-quiz.json";
import personalityJson from "../../data/wedding-personalities.json";
export type PrototypeScreen="opening"|"chapter"|"result";
export const previewQuestion=quizJson.questions.filter(q=>q.status==="active").sort((a,b)=>a.order-b.order)[0];
export const previewPersonality=personalityJson.personalities.find(p=>p.id==="moonlight-poet")!;
export const secondaryPersonality=personalityJson.personalities.find(p=>p.id==="forest-collector")!;
export type ExperienceProps={screen:PrototypeScreen;selectedOptionId:string;onSelect:(optionId:string)=>void;onNavigate:(screen:PrototypeScreen)=>void;embedded?:boolean};
/** @deprecated Full experiences are controlled by WeddingExperienceRunner. */
export const proceedToVenue=()=>{throw new Error("Legacy venue bridge is isolated; use WeddingExperienceRunner state.")};
