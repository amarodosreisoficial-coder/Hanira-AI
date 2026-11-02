import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { tryAcquireConcurrencyLock, releaseConcurrencyLock } from "@/lib/security/concurrency-guard";
import { consumeDailyUsage } from "@/lib/security/usage-guard";
import { getUsageSupabaseClient } from "@/services/usage-service";
import { AIProviderError } from "@/lib/ai/types";

class InvalidBodyError extends Error {}

async function readPayload<T>(request: Request, schema: z.ZodType<T>, maxBytes: number) {
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
      if (bytes > maxBytes) { await reader.cancel(); throw new InvalidBodyError(); }
      chunks.push(value);
    }
    return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { throw new InvalidBodyError(); }
  finally { reader.releaseLock(); }
}

function json(body: object, status = 200, retryAfter?: number) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
  } });
}

// Guardas compartilhadas entre entrevista e análise. Nenhum conteúdo é logado.
export function createIkigaiHandler<T>(options: {
  schema: z.ZodType<T>;
  generate: (payload: T, signal: AbortSignal) => Promise<object>;
  isInvalidResult: (error: unknown) => boolean;
  invalidInputMessage: string;
  invalidResultMessage: string;
  maxBodyBytes: number;
}) {
  return async function POST(request: Request) {
    let lock: { userId: string; requestId: string } | undefined;
    try {
      const user = await requireSessionUser();
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
      const rate = checkRateLimit(`${user.id}:${ip}`);
      if (!rate.allowed) return json({ error: "Muitas solicitações. Aguarde um instante e tente novamente." }, 429, rate.retryAfter);
      const payload = await readPayload(request, options.schema, options.maxBodyBytes);
      if (user.demo) return json({ error: "A IA do Ikigai está indisponível no modo demonstração. Continue com sua prévia local." }, 503);
      const requestId = randomUUID();
      if (!tryAcquireConcurrencyLock(user.id, requestId)) return json({ error: "A Nira já está atendendo uma solicitação sua. Aguarde um instante." }, 429, 5);
      lock = { userId: user.id, requestId };
      const quota = await consumeDailyUsage({ userId: user.id, kind: "text", supabase: getUsageSupabaseClient() });
      if (!quota.allowed) return json({ error: "Seu limite diário foi atingido. Você pode continuar com as respostas iniciais." }, 429, quota.retryAfterSeconds);
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]);
      signal.throwIfAborted();
      const result = await options.generate(payload, signal);
      signal.throwIfAborted();
      return json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHENTICATED") return json({ error: "Faça login para usar a Nira no Ikigai." }, 401);
      if (error instanceof InvalidBodyError) return json({ error: options.invalidInputMessage }, 400);
      if (options.isInvalidResult(error)) return json({ error: options.invalidResultMessage }, 502);
      if (error instanceof AIProviderError && error.code === "rate_limit") return json({ error: "A capacidade gratuita está ocupada. Aguarde ou continue com sua prévia local." }, 429, 60);
      if (error instanceof AIProviderError && error.code === "timeout") return json({ error: "A análise excedeu o tempo disponível. Tente novamente com respostas mais concisas." }, 503);
      return json({ error: "A Nira está temporariamente sem capacidade gratuita disponível. Suas respostas continuam nesta página para uma nova tentativa manual." }, 503);
    } finally {
      if (lock) releaseConcurrencyLock(lock.userId, lock.requestId);
    }
  };
}
