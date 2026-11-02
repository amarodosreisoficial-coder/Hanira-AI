import { z } from "zod";
import { followUpTextSchema, ikigaiAnswersSchema, normalizeQuestion } from "./interview-contract";
import { IKIGAI_MAX_LENGTH, IKIGAI_QUESTIONS } from "./flow";
import type { IkigaiAnswers, IkigaiFollowUp } from "./types";

export const IKIGAI_ANALYSIS_VERSION = "1.0";
const sourceId = z.enum(["identity", "love", "strengths", "impact", "future", "story", "nira-1", "nira-2", "nira-3"]);
export type IkigaiEvidenceId = z.infer<typeof sourceId>;
const followUpsSchema = z.array(z.object({
  id: z.enum(["nira-1", "nira-2", "nira-3"]), text: followUpTextSchema,
  answer: z.string().trim().max(IKIGAI_MAX_LENGTH),
}).strict()).max(3).refine((items) => new Set(items.map(({ id }) => id)).size === items.length);

export const ikigaiAnalysisRequestSchema = z.object({
  analysisConsent: z.literal(true),
  answers: ikigaiAnswersSchema,
  followUps: followUpsSchema.default([]).transform((items) => items.filter(({ answer }) => answer.length > 0)),
}).strict();
export type IkigaiAnalysisInput = z.infer<typeof ikigaiAnalysisRequestSchema>;

const text = (min: number, max: number) => z.string().trim().min(min).max(max)
  .refine((value) => !/[<>\u0000-\u0008\u000b-\u001f]|\d\s*%|\bQI\b|pontuaç[ãa]o psicol[óo]gica/i.test(value));
const evidenceSchema = z.array(z.object({ source: sourceId, quote: text(4, 160) }).strict()).min(1).max(2)
  .refine((items) => new Set(items.map(({ source }) => source)).size === items.length);
const insightSchema = z.object({ kind: z.enum(["interpretation", "possibility"]), text: text(20, 360), evidence: evidenceSchema }).strict();
const recommendationSchema = z.object({ kind: z.literal("possibility"), text: text(20, 360), evidence: evidenceSchema }).strict();
const insights = z.array(insightSchema).min(1).max(3);

export const ikigaiAnalysisSchema = z.object({
  contractVersion: z.literal(IKIGAI_ANALYSIS_VERSION),
  title: text(8, 90),
  synthesis: z.object({ kind: z.literal("interpretation"), text: text(30, 600), evidence: evidenceSchema }).strict(),
  passions: insights, strengths: insights, values: insights, contribution: insights,
  sustainablePaths: z.array(recommendationSchema).min(1).max(3),
  possibleDirections: z.array(recommendationSchema).min(1).max(3),
  challenges: z.array(z.object({ text: text(4, 160), evidence: evidenceSchema }).strict()).max(3),
  actionPlan: z.object({ days7: recommendationSchema, days30: recommendationSchema, days90: recommendationSchema }).strict(),
  reflection: text(30, 420),
}).strict();
export type IkigaiAnalysis = z.infer<typeof ikigaiAnalysisSchema>;
export type IkigaiInsight = z.infer<typeof insightSchema>;

export function buildAnalysisInput(answers: IkigaiAnswers, followUps: IkigaiFollowUp[]): IkigaiAnalysisInput {
  return ikigaiAnalysisRequestSchema.parse({ analysisConsent: true, answers, followUps });
}

export function analysisSources(input: Pick<IkigaiAnalysisInput, "answers" | "followUps">) {
  const sources = new Map<string, { label: string; answer: string }>();
  for (const question of IKIGAI_QUESTIONS) sources.set(question.id, { label: question.label, answer: input.answers[question.id] });
  if (input.answers.story.trim()) sources.set("story", { label: "Sua história", answer: input.answers.story });
  for (const question of input.followUps) if (question.answer.trim()) sources.set(question.id, { label: question.text, answer: question.answer });
  return sources;
}

const commonWords = new Set(["para", "como", "voce", "seus", "suas", "isso", "essa", "esse", "hoje", "vida", "mais", "muito", "quero", "gosto", "pessoas", "fazer"]);
function themes(value: string) {
  return normalizeQuestion(value).split(" ").filter((word) => word.length >= 4 && !commonWords.has(word));
}

// Verificações estruturais/lexicais detectam referências e alegações inconsistentes.
// Não equivalem a uma certificação semântica das interpretações da IA.
export function validateIkigaiAnalysis(value: unknown, input: Pick<IkigaiAnalysisInput, "answers" | "followUps">): IkigaiAnalysis {
  const result = ikigaiAnalysisSchema.parse(value);
  const sources = analysisSources(input);
  const grounded = [result.synthesis, ...result.passions, ...result.strengths, ...result.values, ...result.contribution,
    ...result.sustainablePaths, ...result.possibleDirections, ...Object.values(result.actionPlan), ...result.challenges];
  for (const item of grounded) {
    for (const ref of item.evidence) {
      const answer = sources.get(ref.source)?.answer;
      if (!answer || !answer.includes(ref.quote)) throw new Error("INVALID_ANALYSIS_EVIDENCE");
    }
    const words = new Set(themes(item.evidence.map(({ quote }) => quote).join(" ")));
    if (!themes(item.text).some((word) => words.has(word))) throw new Error("UNSUPPORTED_ANALYSIS");
    if ("kind" in item && item.kind === "interpretation") {
      const quotes = normalizeQuestion(item.evidence.map(({ quote }) => quote).join(" "));
      const qualifications = normalizeQuestion(item.text).match(/\b(doutorado|mestrado|diploma|diplomas|graduacao|premio|premios|certificacao)\b/g) ?? [];
      if (qualifications.some((word) => !quotes.split(" ").includes(word))) throw new Error("UNSUPPORTED_QUALIFICATION");
    }
  }
  for (const challenge of result.challenges) {
    if (!challenge.evidence.some(({ quote }) => quote === challenge.text) ||
      !/\b(nao|sem|falta|faltam|dificuldade|dificuldades|obstaculo|obstaculos|desafio|desafios|duvida|duvidas|medo|receio|incerteza|limitacao|limitacoes)\b/.test(normalizeQuestion(challenge.text))) throw new Error("UNSUPPORTED_CHALLENGE");
  }
  const allAnswers = new Set(themes([...sources.values()].map(({ answer }) => answer).join(" ")));
  if (!themes(result.title).some((word) => allAnswers.has(word))) throw new Error("UNSUPPORTED_TITLE");
  return result;
}
