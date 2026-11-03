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

const literal = (min: number, max: number) => z.string().trim().min(min).max(max)
  .refine((value) => !/[<>\u0000-\u0008\u000b-\u001f]/.test(value));
const text = (min: number, max: number) => literal(min, max)
  .refine((value) => !/\d\s*%|\bQI\b|pontuaç[ãa]o psicol[óo]gica/i.test(value));
// Literal evidence is not a generated psychological assessment. A percentage
// provided by the person must not invalidate an otherwise exact citation.
const evidenceSchema = z.array(z.object({ source: sourceId, quote: literal(4, 160) }).strict()).min(1).max(2)
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
  challenges: z.array(z.object({ text: literal(4, 160), evidence: evidenceSchema }).strict()).max(3),
  actionPlan: z.object({ days7: recommendationSchema, days30: recommendationSchema, days90: recommendationSchema }).strict(),
  reflection: text(30, 420),
}).strict();
export type IkigaiAnalysis = z.infer<typeof ikigaiAnalysisSchema>;
export type IkigaiInsight = z.infer<typeof insightSchema>;

export type AnalysisValidationCategory = "schema" | "evidence" | "grounding" | "qualification" | "challenge" | "title";
export type AnalysisSection = "synthesis" | "title" | `passions[${number}]` | `strengths[${number}]` | `values[${number}]` | `contribution[${number}]` | `sustainablePaths[${number}]` | `possibleDirections[${number}]` | `challenges[${number}]` | "actionPlan.days7" | "actionPlan.days30" | "actionPlan.days90";
export class AnalysisValidationError extends Error {
  constructor(readonly category: AnalysisValidationCategory, readonly section?: AnalysisSection) { super(`INVALID_ANALYSIS_${category.toUpperCase()}`); }
}

// The model selects IDs; only the server copies personal text into citations.
export function analysisEvidenceCatalog(input: Pick<IkigaiAnalysisInput, "answers" | "followUps">) {
  return [...analysisSources(input)].flatMap(([source, { answer }]) => {
    const entries: { id: string; source: IkigaiEvidenceId; quote: string }[] = [];
    let offset = 0;
    while (offset < answer.length) {
      let end = Math.min(offset + 160, answer.length);
      if (end < answer.length) {
        const space = answer.lastIndexOf(" ", end);
        if (space > offset + 60) end = space;
      }
      const quote = answer.slice(offset, end).trim();
      if (quote.length >= 4 && !/[<>\u0000-\u0008\u000b-\u001f]/.test(quote)) entries.push({ id: `${source}:${entries.length + 1}`, source: source as IkigaiEvidenceId, quote });
      offset = end;
    }
    return entries;
  });
}

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
// Small, deliberately explicit families: no unrestricted stemming or guessed synonyms.
const wordFamilies = [
  ["ensinar", "ensino", "ensina", "ensinam", "ensinando", "ensinado", "ensinada", "ensinados", "ensinadas", "lecionar", "leciona", "lecionando"],
  ["organizar", "organiza", "organizam", "organizando", "organizado", "organizada", "organizados", "organizadas"],
  ["estudante", "estudantes", "aluno", "aluna", "alunos", "alunas"],
  ["educador", "educadora", "educadores", "educadoras"],
  ["jovem", "jovens"],
  ["comunitario", "comunitaria", "comunitarios", "comunitarias"],
];
const familyByWord = new Map(wordFamilies.flatMap((family) => family.map((word) => [word, family[0]] as const)));
function anchor(word: string): string {
  const family = familyByWord.get(word);
  if (family) return family;
  // Plural only when the singular is also present in the compared text; this
  // normalization does not invent synonyms or strip arbitrary verb endings.
  if (word.length >= 6 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}
function themes(value: string) {
  return normalizeQuestion(value).split(" ").filter((word) => word.length >= 4 && !commonWords.has(word)).map(anchor);
}

const claims = /\b(doutorado|mestrado|diplomas?|graduacao|premios?|premiad[oa]s?|certificaca[ou]|certificad[oa]s?|formad[oa]s?|especialist[as]+|conquistei|conquistou|venci|venceu|ganhei|ganhou|recebi|recebeu|liderei|liderou|publiquei|publicou|fundei|fundou|criou)\b/g;
const unsupportedCertainty = /\b(?:comprova|garante|prova|certamente|indiscutivelmente|detesta|odeia)\b/g;
// Concrete personal assertions need the same explicit verb in the evidence;
// this is a narrow guard, not a general-purpose semantic verifier.
const personalFacts = /\b(?:mora|moro|vive|vivo|trabalha|trabalho|estudou|estudei|nasceu|nasci|possui|possuo)\b/g;

// Verificações estruturais/lexicais detectam referências e alegações inconsistentes.
// Não equivalem a uma certificação semântica das interpretações da IA.
export function validateIkigaiAnalysis(value: unknown, input: Pick<IkigaiAnalysisInput, "answers" | "followUps">): IkigaiAnalysis {
  const parsed = ikigaiAnalysisSchema.safeParse(value);
  if (!parsed.success) throw new AnalysisValidationError("schema");
  const result = parsed.data;
  const sources = analysisSources(input);
  const grounded: { item: IkigaiAnalysis["synthesis"] | IkigaiInsight | IkigaiAnalysis["challenges"][number]; section: AnalysisSection }[] = [
    { item: result.synthesis, section: "synthesis" },
    ...(["passions", "strengths", "values", "contribution", "sustainablePaths", "possibleDirections", "challenges"] as const)
      .flatMap((key) => result[key].map((item, index) => ({ item, section: `${key}[${index}]` as AnalysisSection }))),
    ...(["days7", "days30", "days90"] as const).map((key) => ({ item: result.actionPlan[key], section: `actionPlan.${key}` as AnalysisSection })),
  ];
  for (const { item, section } of grounded) {
    for (const ref of item.evidence) {
      const answer = sources.get(ref.source)?.answer;
      if (!answer || !answer.normalize("NFC").replace(/\s+/g, " ").includes(ref.quote.normalize("NFC").replace(/\s+/g, " "))) throw new AnalysisValidationError("evidence", section);
    }
    if ("kind" in item) {
      const quotes = normalizeQuestion(item.evidence.map(({ quote }) => quote).join(" "));
      const qualifications = normalizeQuestion(item.text).match(claims) ?? [];
      if (qualifications.some((word) => !quotes.split(" ").includes(word))) throw new AnalysisValidationError("qualification", section);
      const certainty = normalizeQuestion(item.text).match(unsupportedCertainty) ?? [];
      if (certainty.some((word) => !quotes.split(" ").includes(word))) throw new AnalysisValidationError("grounding", section);
      const facts = normalizeQuestion(item.text).match(personalFacts) ?? [];
      if (facts.some((word) => !quotes.split(" ").includes(word))) throw new AnalysisValidationError("grounding", section);
      const textAnchors = new Set(themes(item.text));
      const matched = new Set<string>();
      for (const ref of item.evidence) {
        if (/\b(?:nao|nunca|jamais)\b/.test(normalizeQuestion(ref.quote)) && !/\b(?:nao|nunca|jamais)\b/.test(normalizeQuestion(item.text))) throw new AnalysisValidationError("grounding", section);
        const overlap = themes(ref.quote).filter((word) => textAnchors.has(word));
        if (!overlap.length) throw new AnalysisValidationError("grounding", section);
        overlap.forEach((word) => matched.add(word));
      }
      if (matched.size < 2) throw new AnalysisValidationError("grounding", section);
    }
  }
  for (const [index, challenge] of result.challenges.entries()) {
    if (!challenge.evidence.every(({ quote }) => quote === challenge.text) ||
      !/\b(nao|sem|falta|faltam|dificuldade|dificuldades|obstaculo|obstaculos|desafio|desafios|duvida|duvidas|medo|receio|incerteza|limitacao|limitacoes)\b/.test(normalizeQuestion(challenge.text))) throw new AnalysisValidationError("challenge", `challenges[${index}]`);
  }
  const allAnswers = new Set(themes([...sources.values()].map(({ answer }) => answer).join(" ")));
  if (!themes(result.title).some((word) => allAnswers.has(word))) throw new AnalysisValidationError("title", "title");
  return result;
}
