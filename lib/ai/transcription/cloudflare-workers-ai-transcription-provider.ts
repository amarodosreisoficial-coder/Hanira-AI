import "server-only";
import { TranscriptionError, type TranscriptionProvider } from "./provider";

export const CLOUDFLARE_STT_MODEL = "@cf/openai/whisper-large-v3-turbo";
const TIMEOUT_MS = 60_000;

type Options = { accountId?: string; apiToken?: string; fetchFn?: typeof fetch; timeoutMs?: number };

export class CloudflareWorkersAITranscriptionProvider implements TranscriptionProvider {
  private readonly accountId: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: Options = {}) {
    this.accountId = options.accountId ?? process.env.CLOUDFLARE_AI_ACCOUNT_ID;
    this.apiToken = options.apiToken ?? process.env.CLOUDFLARE_AI_API_TOKEN;
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  async transcribe(audio: Uint8Array, signal?: AbortSignal): Promise<string> {
    if (!this.accountId?.trim() || !this.apiToken?.trim()) throw new TranscriptionError("invalid_configuration");
    if (!audio.length) throw new TranscriptionError("invalid_request");
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, this.timeoutMs);
    try {
      const response = await this.fetchFn(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId.trim())}/ai/run/${CLOUDFLARE_STT_MODEL}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiToken.trim()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ audio: Buffer.from(audio).toString("base64"), task: "transcribe", language: "pt" }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new TranscriptionError("authentication");
        if (response.status === 413) throw new TranscriptionError("payload_too_large");
        if (response.status === 415) throw new TranscriptionError("unsupported_format");
        if (response.status === 429) throw new TranscriptionError("free_capacity_exhausted");
        if (response.status === 503 || response.status === 529) throw new TranscriptionError("provider_capacity");
        if (response.status === 400 || response.status === 422) throw new TranscriptionError("invalid_request");
        throw new TranscriptionError("provider_error");
      }
      const body: unknown = await response.json().catch(() => null);
      const result = body && typeof body === "object" ? (body as { success?: unknown; result?: unknown }).result : null;
      const text = result && typeof result === "object" ? (result as { text?: unknown }).text : null;
      if ((body as { success?: unknown } | null)?.success !== true || typeof text !== "string" || !text.trim() || text.length > 4_000) {
        throw new TranscriptionError("malformed_response");
      }
      return text.trim();
    } catch (error) {
      if (controller.signal.aborted) throw new TranscriptionError("timeout");
      if (error instanceof TranscriptionError) throw error;
      throw new TranscriptionError("network_error");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
}
