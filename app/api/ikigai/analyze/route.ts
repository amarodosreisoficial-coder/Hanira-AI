import { createIkigaiHandler } from "@/lib/ikigai/api-handler";
import { ikigaiAnalysisRequestSchema } from "@/lib/ikigai/analysis-contract";
import { generateIkigaiAnalysis, InvalidIkigaiAnalysisError } from "@/lib/ikigai/analysis-generator";

export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = createIkigaiHandler({
  schema: ikigaiAnalysisRequestSchema,
  generate: generateIkigaiAnalysis,
  isInvalidResult: (error) => error instanceof InvalidIkigaiAnalysisError,
  invalidInputMessage: "Revise suas respostas e confirme o consentimento específico para a análise.",
  invalidResultMessage: "A Nira não conseguiu preparar uma análise válida e fundamentada desta vez. Suas respostas continuam disponíveis para uma nova tentativa manual.",
  maxBodyBytes: 120_000,
});
