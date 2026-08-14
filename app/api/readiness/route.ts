import { getServerAICapabilities } from "@/lib/ai/capabilities";
import { createTextChatRuntime } from "@/lib/ai/runtime";
import { isDemoMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const capabilities = getServerAICapabilities();
  if (isDemoMode()) return Response.json({ status: "ready", checks: { env: true, database: false, ollama: false, text: true } });
  let database = false;
  let ollama = false;
  try { const { error } = await createSupabaseAdminClient().from("system_metadata").select("key", { head: true, count: "exact" }).limit(1); database = !error; } catch { database = false; }
  try { ollama = (await createTextChatRuntime().provider.healthCheck()).ok; } catch { ollama = false; }
  const text = capabilities.text.status === "available" && ollama;
  const status = database && text ? "ready" : database || text ? "degraded" : "unavailable";
  return Response.json({ status, checks: { env: capabilities.text.status !== "misconfigured", database, ollama, text }, capabilities: { vision: capabilities.vision.status, transcription: capabilities.transcription.status, speech: capabilities.speech.status } }, { status: status === "ready" ? 200 : 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
