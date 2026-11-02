import "server-only";
import { createTextChatRuntime } from "@/lib/ai/runtime/create-text-chat-runtime";
import { AIProviderError } from "@/lib/ai/types";
import { recordCandidateFailure, recordCandidateSuccess } from "@/lib/ai/capacity/capacity-state";

export async function generateIkigaiJson<T>(options: {
  systemPrompt: string;
  data: object;
  maxOutputTokens: number;
  outputSchema?: Record<string, unknown>;
  signal: AbortSignal;
  parse: (text: string) => T;
  invalidResult: () => Error;
}): Promise<T> {
  // Composition root existente: Zero-Cost Guard e cooldown, sem candidatos injetados.
  const runtime = createTextChatRuntime();
  const hasStrictOutput = runtime.providerId === "groq" && ["openai/gpt-oss-20b", "openai/gpt-oss-120b"].includes(runtime.model);
  const systemPrompt = options.outputSchema && !hasStrictOutput
    ? `${options.systemPrompt}\nContrato JSON: ${JSON.stringify(options.outputSchema)}` : options.systemPrompt;
  try {
    options.signal.throwIfAborted();
    const response = await runtime.provider.generate({
      model: runtime.model,
      messages: [{ role: "system", text: systemPrompt }, { role: "user", text: JSON.stringify(options.data) }],
      maxOutputTokens: options.maxOutputTokens,
      ...(options.outputSchema ? { outputSchema: options.outputSchema } : {}),
      temperature: 0.4,
      signal: options.signal,
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
    const result = options.parse(response.text);
    recordCandidateSuccess(runtime.routing.candidateId);
    return result;
  } catch (error) {
    if (error instanceof AIProviderError) recordCandidateFailure(runtime.routing.candidateId, { code: error.code, retryable: error.retryable });
    throw error;
  }
}
