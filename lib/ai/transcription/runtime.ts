import "server-only";

export type SttCostClass = "FREE" | "PAID" | "PROMOTIONAL" | "UNKNOWN";

// Package 18.3.4 — Production STT activation (normal chat microphone).
// Gate fail-closed: STT só fica elegível quando TODOS os gates obrigatórios
// estiverem explicitamente configurados em runtime:
//   - HANIRA_STT_ENABLED=true            (operacional)
//   - HANIRA_STT_LIVE_ENABLED=true       (chamadas reais ao provider liberadas)
//   - HANIRA_STT_COST_CLASS=FREE         (elegibilidade financeira; sem PAID)
//   - HANIRA_STT_ACCOUNT_VERIFIED_FREE=true (conta Workers Free comprovada)
//   - credenciais Cloudflare presentes   (CLOUDFLARE_AI_ACCOUNT_ID/API_TOKEN)
// Nunca assume FREE silenciosamente. PAID/PROMOTIONAL/UNKNOWN bloqueiam.
// Não há fallback pago: se não elegível, a rota falha de forma amigável.
export function getSttRuntimeState(env: Record<string, string | undefined> = process.env) {
  const costClass: SttCostClass =
    env.HANIRA_STT_COST_CLASS === "FREE" ||
    env.HANIRA_STT_COST_CLASS === "PAID" ||
    env.HANIRA_STT_COST_CLASS === "PROMOTIONAL"
      ? env.HANIRA_STT_COST_CLASS
      : "UNKNOWN";
  const enabled = env.HANIRA_STT_ENABLED === "true";
  const liveEnabled = env.HANIRA_STT_LIVE_ENABLED === "true";
  const accountVerifiedFree = env.HANIRA_STT_ACCOUNT_VERIFIED_FREE === "true";
  const configured = Boolean(env.CLOUDFLARE_AI_ACCOUNT_ID?.trim() && env.CLOUDFLARE_AI_API_TOKEN?.trim());
  return Object.freeze({
    enabled,
    liveEnabled,
    costClass,
    accountVerifiedFree,
    configured,
    eligible: enabled && liveEnabled && costClass === "FREE" && accountVerifiedFree && configured,
  });
}
