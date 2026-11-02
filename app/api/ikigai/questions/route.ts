import { createIkigaiHandler } from "@/lib/ikigai/api-handler";
import { ikigaiInterviewRequestSchema } from "@/lib/ikigai/interview-contract";
import { generateIkigaiQuestions, InvalidIkigaiQuestionsError } from "@/lib/ikigai/interview-generator";

export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = createIkigaiHandler({
  schema: ikigaiInterviewRequestSchema,
  generate: (payload, signal) => generateIkigaiQuestions(payload.answers, signal),
  isInvalidResult: (error) => error instanceof InvalidIkigaiQuestionsError,
  invalidInputMessage: "Revise as cinco respostas e confirme seu consentimento antes de enviar.",
  invalidResultMessage: "A Nira não conseguiu formular perguntas válidas desta vez. Você pode continuar com sua prévia local.",
  maxBodyBytes: 80_000,
});
