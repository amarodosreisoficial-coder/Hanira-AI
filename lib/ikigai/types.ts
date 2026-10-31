export type IkigaiQuestionId = "identity" | "love" | "strengths" | "impact" | "future";
export type IkigaiAnswers = Record<IkigaiQuestionId, string> & { story: string };
export type IkigaiStep = "intro" | "questions" | "preview" | "next";

// DTO local e independente de provedores para futura API /api/ikigai e EntreUS.
// Nenhuma integração ou persistência é executada nesta versão.
export interface IkigaiProfilePreview {
  identity: string;
  story: string;
  areas: { id: IkigaiQuestionId; title: string; text: string }[];
}
