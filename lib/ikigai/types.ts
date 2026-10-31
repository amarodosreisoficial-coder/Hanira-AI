export type IkigaiQuestionId = "identity" | "love" | "strengths" | "impact" | "future";
export type IkigaiAnswers = Record<IkigaiQuestionId, string> & { story: string };
export type IkigaiStep = "intro" | "questions" | "interview" | "preview" | "next";

export interface IkigaiFollowUpQuestion { id: string; text: string }
export interface IkigaiFollowUp extends IkigaiFollowUpQuestion { answer: string }

// DTO local e independente de provedores para futura API /api/ikigai e EntreUS.
// As respostas complementares também permanecem no estado local.
export interface IkigaiProfilePreview {
  identity: string;
  story: string;
  areas: { id: IkigaiQuestionId; title: string; text: string }[];
  followUps?: IkigaiFollowUp[];
}
