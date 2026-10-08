import "server-only";

export type SttCostClass = "FREE" | "PAID" | "PROMOTIONAL" | "UNKNOWN";

export function getSttRuntimeState(env: Record<string, string | undefined> = process.env) {
  const costClass: SttCostClass =
    env.HANIRA_STT_COST_CLASS === "FREE" ||
    env.HANIRA_STT_COST_CLASS === "PAID" ||
    env.HANIRA_STT_COST_CLASS === "PROMOTIONAL"
      ? env.HANIRA_STT_COST_CLASS
      : "UNKNOWN";
  const configured = Boolean(env.CLOUDFLARE_AI_ACCOUNT_ID?.trim() && env.CLOUDFLARE_AI_API_TOKEN?.trim());
  return Object.freeze({
    enabled: env.HANIRA_STT_ENABLED === "true",
    costClass,
    configured,
    eligible: env.HANIRA_STT_ENABLED === "true" && costClass === "FREE" && configured,
  });
}
