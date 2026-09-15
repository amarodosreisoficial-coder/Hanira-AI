import { getServerAICapabilities } from "@/lib/ai/capabilities";
import { createTextChatRuntime } from "@/lib/ai/runtime";
import { isDemoMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getReleaseInfo } from "@/lib/version";

// Package 17.6: readiness seguro. Estados de capacidade sao booleans/labels
// genericos — nunca chaves, baseUrl, erros brutos de provider ou SQL.
// `usageTracking` verifica (somente-leitura) se a tabela daily_usage da
// migration 009 responde via service role: e o sinal do guard distribuido.
export async function GET() {
  const capabilities = getServerAICapabilities();
  if (isDemoMode())
    return Response.json({
      status: "ready",
      checks: { env: true, database: false, ollama: false, text: true, usageGuard: false },
      capabilities: { text: "available", image: "disabled", usageTracking: "disabled" },
    });
  let database = false;
  let ollama = false;
  let usageGuard = false;
  const admin = createSupabaseAdminClient();
  try { const { error } = await admin.from("system_metadata").select("key", { head: true, count: "exact" }).limit(1); database = !error; } catch { database = false; }
  try { const { error } = await admin.from("daily_usage").select("user_id", { head: true, count: "exact" }).limit(1); usageGuard = !error; } catch { usageGuard = false; }
  try { ollama = (await createTextChatRuntime().provider.healthCheck()).ok; } catch { ollama = false; }
  const text = capabilities.text.status === "available" && ollama;
  const imageConfigured = Boolean(process.env.CLOUDFLARE_AI_ACCOUNT_ID && process.env.CLOUDFLARE_AI_API_TOKEN);
  const image: "available" | "unavailable" = imageConfigured && usageGuard ? "available" : "unavailable";
  const usageTracking: "available" | "unavailable" = usageGuard ? "available" : "unavailable";
  const status = database && text ? "ready" : database || text ? "degraded" : "unavailable";
  return Response.json(
    {
      status,
      checks: { env: capabilities.text.status !== "misconfigured", database, ollama, text, usageGuard },
      capabilities: { text: text ? "available" : "unavailable", image, usageTracking },
      capabilitiesMeta: { vision: capabilities.vision.status, transcription: capabilities.transcription.status, speech: capabilities.speech.status },
      release: getReleaseInfo(),
    },
    { status: status === "ready" ? 200 : 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
