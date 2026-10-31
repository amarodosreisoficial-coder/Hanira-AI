import { randomUUID } from "node:crypto";
import { requireSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { tryAcquireConcurrencyLock, releaseConcurrencyLock } from "@/lib/security/concurrency-guard";
import { consumeDailyUsage } from "@/lib/security/usage-guard";
import { getUsageSupabaseClient } from "@/services/usage-service";
import { ikigaiInterviewRequestSchema } from "@/lib/ikigai/interview-contract";
import { generateIkigaiQuestions, InvalidIkigaiQuestionsError } from "@/lib/ikigai/interview-generator";
import { AIProviderError } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BODY_BYTES = 80_000;
class InvalidBodyError extends Error {}

async function readPayload(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new InvalidBodyError();
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidBodyError();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new InvalidBodyError(); }
      chunks.push(value);
    }
    return ikigaiInterviewRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { throw new InvalidBodyError(); }
  finally { reader.releaseLock(); }
}

function json(body: object, status = 200, retryAfter?: number) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
  } });
}

export async function POST(request: Request) {
  let lock: { userId: string; requestId: string } | undefined;
  try {
    const user = await requireSessionUser();
    // Compartilha rate limit e concorrência com o chat; identidade vem da sessão.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
    const rate = checkRateLimit(`${user.id}:${ip}`);
    if (!rate.allowed) return json({ error: "Muitas solicitações. Aguarde um instante e tente novamente." }, 429, rate.retryAfter);
    const payload = await readPayload(request);
    if (user.demo) return json({ error: "Perguntas inteligentes indisponíveis no modo demonstração. Continue com sua prévia local." }, 503);
    const requestId = randomUUID();
    if (!tryAcquireConcurrencyLock(user.id, requestId)) return json({ error: "A Nira já está atendendo uma solicitação sua. Aguarde um instante." }, 429, 5);
    lock = { userId: user.id, requestId };
    const quota = await consumeDailyUsage({ userId: user.id, kind: "text", supabase: getUsageSupabaseClient() });
    if (!quota.allowed) return json({ error: "Seu limite diário foi atingido. Você pode continuar com as respostas iniciais." }, 429, quota.retryAfterSeconds);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]);
    return json(await generateIkigaiQuestions(payload.answers, signal));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") return json({ error: "Faça login para aprofundar com a Nira." }, 401);
    if (error instanceof InvalidBodyError) return json({ error: "Revise as cinco respostas e confirme seu consentimento antes de enviar." }, 400);
    if (error instanceof InvalidIkigaiQuestionsError) return json({ error: "A Nira não conseguiu formular perguntas válidas desta vez. Você pode continuar com sua prévia local." }, 502);
    if (error instanceof AIProviderError && error.code === "rate_limit") return json({ error: "A capacidade gratuita está ocupada. Aguarde ou continue com sua prévia local." }, 429, 60);
    // Erros de provider/configuração nunca são serializados nem logados com conteúdo.
    return json({ error: "A Nira está temporariamente sem capacidade gratuita disponível. Você pode continuar com as respostas iniciais." }, 503);
  } finally {
    if (lock) releaseConcurrencyLock(lock.userId, lock.requestId);
  }
}
