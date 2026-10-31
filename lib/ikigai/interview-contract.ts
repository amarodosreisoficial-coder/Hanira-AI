import { z } from "zod";
import { IKIGAI_MAX_LENGTH, IKIGAI_QUESTIONS } from "./flow";

const answer = z.string().trim().min(1).max(IKIGAI_MAX_LENGTH);
export const ikigaiInterviewRequestSchema = z.object({
  consent: z.literal(true),
  answers: z.object({
    identity: answer, love: answer, strengths: answer, impact: answer, future: answer,
    story: z.string().trim().max(IKIGAI_MAX_LENGTH),
  }).strict(),
}).strict();

export function normalizeQuestion(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function similarQuestions(left: string, right: string): boolean {
  const a = normalizeQuestion(left);
  const b = normalizeQuestion(right);
  if (a === b) return true;
  const wordsA = new Set(a.split(" ").filter((word) => word.length > 3));
  const wordsB = new Set(b.split(" ").filter((word) => word.length > 3));
  const overlap = [...wordsA].filter((word) => wordsB.has(word)).length;
  return overlap > 0 && overlap / new Set([...wordsA, ...wordsB]).size >= 0.7;
}

export const followUpTextSchema = z.string().trim().min(20).max(240)
  .refine((text) => text.endsWith("?") && (text.match(/\?/g) ?? []).length === 1 && !/[<>\u0000-\u001f]/.test(text))
  .refine((text) => !IKIGAI_QUESTIONS.some((initial) => similarQuestions(text, initial.label)));

export const ikigaiInterviewResponseSchema = z.object({
  questions: z.array(z.object({ id: z.string().regex(/^nira-[1-3]$/), text: followUpTextSchema }).strict()).min(1).max(3),
}).strict().refine(({ questions }) => new Set(questions.map(({ id }) => id)).size === questions.length &&
  questions.every((question, index) => questions.slice(0, index).every((other) => !similarQuestions(question.text, other.text))));
