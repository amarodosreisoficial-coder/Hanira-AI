export type IkigaiQuestionId = "identity" | "love" | "strengths" | "impact" | "future";
export type IkigaiAnswers = Record<IkigaiQuestionId, string> & { story: string };
export type IkigaiStep = "intro" | "questions" | "interview" | "preview" | "next" | "result";

export type IkigaiFollowUpId = "nira-1" | "nira-2" | "nira-3";
export interface IkigaiFollowUpQuestion { id: IkigaiFollowUpId; text: string }
export interface IkigaiFollowUp extends IkigaiFollowUpQuestion { answer: string }

// DTO local e independente de provedores para futura API /api/ikigai e EntreUS.
// Conteúdo temporário: envio à IA somente com consentimento específico.
export interface IkigaiProfilePreview {
  identity: string;
  story: string;
  areas: { id: IkigaiQuestionId; title: string; text: string }[];
  followUps?: IkigaiFollowUp[];
}
