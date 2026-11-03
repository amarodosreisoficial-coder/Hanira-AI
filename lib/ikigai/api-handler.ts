import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { tryAcquireConcurrencyLock, releaseConcurrencyLock } from "@/lib/security/concurrency-guard";
import { consumeDailyUsage } from "@/lib/security/usage-guard";
import { getUsageSupabaseClient } from "@/services/usage-service";
import { classifyIkigaiFailure, logIkigaiFailure, IKIGAI_PUBLIC_ERRORS, type IkigaiDiagnosticContext } from "./diagnostics";
import { persistIkigaiDiagnostic } from "./diagnostic-store";

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

function jsonResponse(body: object, status: number, retryAfter: number | undefined, requestId: string) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-Id": requestId,
    ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
  } });
}

// Guardas compartilhadas entre entrevista e análise. Nenhum conteúdo é logado.
export function createIkigaiHandler<T>(options: {
  schema: z.ZodType<T>;
  generate: (payload: T, signal: AbortSignal, context?: IkigaiDiagnosticContext) => Promise<object>;
  isInvalidResult: (error: unknown) => boolean;
  invalidInputMessage: string;
  invalidResultMessage: string;
  maxBodyBytes: number;
}) {
  return async function POST(request: Request) {
    const context: IkigaiDiagnosticContext = { requestId: randomUUID(), startedAtMs: Date.now(), stage: "session" };
    const json = (body: object, status = 200, retryAfter?: number) => jsonResponse(body, status, retryAfter, context.requestId);
    let lock: { userId: string; requestId: string } | undefined;
    let signal: AbortSignal | undefined;
    try {
      const user = await requireSessionUser();
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
      const rate = checkRateLimit(`${user.id}:${ip}`);
      if (!rate.allowed) return json({ error: "Muitas solicitações. Aguarde um instante e tente novamente." }, 429, rate.retryAfter);
      context.stage = "input";
      const payload = await readPayload(request, options.schema, options.maxBodyBytes);
      if (user.demo) return json({ error: "A IA do Ikigai está indisponível no modo demonstração. Continue com sua prévia local." }, 503);
      const requestId = context.requestId;
      if (!tryAcquireConcurrencyLock(user.id, requestId)) return json({ error: "A Nira já está atendendo uma solicitação sua. Aguarde um instante." }, 429, 5);
      lock = { userId: user.id, requestId };
      context.stage = "quota";
      const quota = await consumeDailyUsage({ userId: user.id, kind: "text", supabase: getUsageSupabaseClient() });
      if (!quota.allowed) return json({ error: "Seu limite diário foi atingido. Você pode continuar com as respostas iniciais." }, 429, quota.retryAfterSeconds);
      signal = AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]);
      signal.throwIfAborted();
      context.stage = "runtime";
      const result = await options.generate(payload, signal, context);
      signal.throwIfAborted();
      return json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHENTICATED") return json({ error: "Faça login para usar a Nira no Ikigai." }, 401);
      if (error instanceof InvalidBodyError) return json({ error: options.invalidInputMessage }, 400);
      const aborted = signal?.aborted ? (signal.reason?.name === "TimeoutError" ? "timeout" : "cancelled") : request.signal.aborted ? "cancelled" : undefined;
      const invalidResult = options.isInvalidResult(error);
      const failure = classifyIkigaiFailure(error, context, invalidResult, aborted);
      logIkigaiFailure(error, context, failure);
       void persistIkigaiDiagnostic(context, failure, "/api/ikigai/analyze", (error as { section?: string })?.section);
      let message: string = IKIGAI_PUBLIC_ERRORS[failure.publicCode];
      if (invalidResult && !aborted) message = options.invalidResultMessage;
      if (failure.category === "provider_rate_limit") message = "A capacidade gratuita está ocupada. Aguarde ou continue com sua prévia local.";
      if (failure.category === "output_token_limit") message = "A análise foi interrompida pelo limite de tokens de saída. Tente novamente com respostas mais concisas.";
      if (failure.category === "timeout") message = "A Nira excedeu o tempo disponível para concluir a análise. Suas respostas foram mantidas para uma nova tentativa manual.";
      return json({ error: message, code: failure.publicCode, requestId: context.requestId }, failure.status, failure.status === 429 ? 60 : undefined);
    } finally {
      if (lock) releaseConcurrencyLock(lock.userId, lock.requestId);
    }
  };
}
