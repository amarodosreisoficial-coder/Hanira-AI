import "server-only";
import { createTextChatRuntime } from "@/lib/ai/runtime/create-text-chat-runtime";
import { AIProviderError } from "@/lib/ai/types";
import { recordCandidateFailure, recordCandidateSuccess } from "@/lib/ai/capacity/capacity-state";
import type { IkigaiDiagnosticContext } from "./diagnostics";

export async function generateIkigaiJson<T>(options: {
  systemPrompt: string;
  data: object;
  maxOutputTokens: number;
  outputSchema?: Record<string, unknown>;
  context?: IkigaiDiagnosticContext;
  signal: AbortSignal;
  parse: (text: string) => T;
  invalidResult: () => Error;
}): Promise<T> {
  // Composition root existente: Zero-Cost Guard e cooldown, sem candidatos injetados.
  if (options.context) options.context.stage = "runtime";
  const runtime = createTextChatRuntime();
  if (options.context) { options.context.provider = runtime.providerId; options.context.model = runtime.model; }
  const hasStrictOutput = runtime.providerId === "groq" && ["openai/gpt-oss-20b", "openai/gpt-oss-120b"].includes(runtime.model);
  const systemPrompt = options.outputSchema && !hasStrictOutput
    ? `${options.systemPrompt}\nContrato JSON: ${JSON.stringify(options.outputSchema)}` : options.systemPrompt;
  try {
    options.signal.throwIfAborted();
    if (options.context) options.context.stage = "provider";
    const response = await runtime.provider.generate({
      model: runtime.model,
      messages: [{ role: "system", text: systemPrompt }, { role: "user", text: JSON.stringify(options.data) }],
      maxOutputTokens: options.maxOutputTokens,
      ...(options.outputSchema ? { outputSchema: options.outputSchema } : {}),
      temperature: 0.4,
      signal: options.signal,
      ...(options.context ? { metadata: { requestId: options.context.requestId, generationStartedAtMs: options.context.startedAtMs, diagnosticScope: "ikigai" } } : {}),
    });
    options.signal.throwIfAborted();
    if (response.finishReason === "max_output_tokens") {
      throw new AIProviderError({
        code: "timeout",
        message: "A geração foi interrompida por limite de tokens de saída.",
        provider: runtime.providerId,
        model: runtime.model,
        retryable: true,
        metadata: { reason: "output_token_limit" },
      });
    }
    if (response.finishReason !== "stop") throw options.invalidResult();
    if (options.context) options.context.stage = "parse";
    const result = options.parse(response.text);
    if (options.context) options.context.stage = "complete";
    recordCandidateSuccess(runtime.routing.candidateId);
    return result;
  } catch (error) {
    if (error instanceof AIProviderError) recordCandidateFailure(runtime.routing.candidateId, { code: error.code, retryable: error.retryable });
    throw error;
  }
}
