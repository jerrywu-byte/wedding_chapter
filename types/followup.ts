export type FollowupStatus = "洽談中" | "已訂" | "退訂" | "流失";

export interface FollowupConsultation {
  date: string;
  note: string;
}

export interface FollowupCase {
  id: string;
  requestNo: string;
  partnerOne: string;
  partnerTwo: string;
  primaryContact: string;
  phone: string;
  submittedAt: string;
  eventDate: string;
  tableCount: number;
  personality: string;
  recommendedHall: string;
  consultations: [FollowupConsultation, FollowupConsultation, FollowupConsultation];
  status: FollowupStatus;
  closedDate: string;
}
