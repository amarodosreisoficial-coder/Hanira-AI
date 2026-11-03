import { z } from "zod";
import { analysisEvidenceCatalog, AnalysisValidationError, type AnalysisSection, type IkigaiAnalysisInput } from "./analysis-contract";

// Closed wire objects select IDs. Only the server copies personal citations.
const evidence = z.array(z.string()).min(1).max(2);
const insight = z.object({ kind: z.enum(["interpretation", "possibility"]), text: z.string().min(20).max(360), evidence }).strict();
const recommendation = insight.extend({ kind: z.literal("possibility") });
export const generatedAnalysisSchema = z.object({
  contractVersion: z.literal("1.0"), title: z.string().min(8).max(90),
  synthesis: insight.extend({ kind: z.literal("interpretation"), text: z.string().min(30).max(600) }),
  passions: z.array(insight).min(1).max(3), strengths: z.array(insight).min(1).max(3),
  values: z.array(insight).min(1).max(3), contribution: z.array(insight).min(1).max(3),
  sustainablePaths: z.array(recommendation).min(1).max(3), possibleDirections: z.array(recommendation).min(1).max(3),
  challenges: z.array(z.object({ evidenceId: z.string() }).strict()).max(3),
  actionPlan: z.object({ days7: recommendation, days30: recommendation, days90: recommendation }).strict(),
  reflection: z.string().min(30).max(420),
}).strict();

export function analysisOutputSchema(input: IkigaiAnalysisInput) {
  const schema = z.toJSONSchema(generatedAnalysisSchema);
  const ids = analysisEvidenceCatalog(input).map(({ id }) => id);
  if (!ids.length) throw new AnalysisValidationError("evidence");
  function constrain(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const object = node as Record<string, unknown>;
    if (object.properties && typeof object.properties === "object") {
      const props = object.properties as Record<string, Record<string, unknown>>;
      if (props.evidence) props.evidence.items = { type: "string", enum: ids };
      if (props.evidenceId) props.evidenceId.enum = ids;
    }
    for (const child of Object.values(object)) {
      if (Array.isArray(child)) child.forEach(constrain); else constrain(child);
    }
  }
  constrain(schema);
  return schema;
}

export function hydrateAnalysisEvidence(value: unknown, input: IkigaiAnalysisInput) {
  const parsed = generatedAnalysisSchema.safeParse(value);
  if (!parsed.success) throw new AnalysisValidationError("schema");
  const catalog = new Map(analysisEvidenceCatalog(input).map(({ id, ...entry }) => [id, entry]));
  function resolve(id: string, section: AnalysisSection) {
    const entry = catalog.get(id);
    if (!entry) throw new AnalysisValidationError("evidence", section);
    return entry;
  }
  const hydrate = (item: z.infer<typeof insight>, section: AnalysisSection) => ({ ...item, evidence: item.evidence.map((id) => resolve(id, section)) });
  const result = parsed.data;
  return { ...result, synthesis: hydrate(result.synthesis, "synthesis"),
    passions: result.passions.map((item, i) => hydrate(item, `passions[${i}]`)), strengths: result.strengths.map((item, i) => hydrate(item, `strengths[${i}]`)), values: result.values.map((item, i) => hydrate(item, `values[${i}]`)),
    contribution: result.contribution.map((item, i) => hydrate(item, `contribution[${i}]`)), sustainablePaths: result.sustainablePaths.map((item, i) => hydrate(item, `sustainablePaths[${i}]`)), possibleDirections: result.possibleDirections.map((item, i) => hydrate(item, `possibleDirections[${i}]`)),
    challenges: result.challenges.map(({ evidenceId }, i) => { const entry = resolve(evidenceId, `challenges[${i}]`); return { text: entry.quote, evidence: [entry] }; }),
    actionPlan: { days7: hydrate(result.actionPlan.days7, "actionPlan.days7"), days30: hydrate(result.actionPlan.days30, "actionPlan.days30"), days90: hydrate(result.actionPlan.days90, "actionPlan.days90") },
  };
}
