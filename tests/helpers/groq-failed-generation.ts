import { generatedAnalysisSchema } from "@/lib/ikigai/analysis-output";

// Only used by the opt-in smoke test with fictional data. The provider body
// and generated text stay in memory; callers receive a fixed category only.
export function classifyFailedGeneration(body: string): string {
  if (body.length > 1_000_000) return "body_too_large";
  let envelope: unknown;
  try { envelope = JSON.parse(body); } catch { return "body_invalid_json"; }
  const error = (envelope as { error?: { failed_generation?: unknown } } | null)?.error;
  const generated = error?.failed_generation;
  if (typeof generated !== "string") return "not_available";
  if (generated.length > 64_000) return "generated_too_large";
  let value: unknown;
  try { value = JSON.parse(generated); } catch { return "generated_invalid_json"; }
  const result = generatedAnalysisSchema.safeParse(value);
  // This checks the static shape only, not request-specific evidence IDs.
  if (result.success) return "wire_shape_valid";
  const allowed = new Set(["invalid_type", "invalid_value", "too_small", "too_big", "unrecognized_keys", "invalid_format"]);
  const code = result.error.issues[0]?.code;
  return code && allowed.has(code) ? `wire_${code}` : "wire_other";
}
