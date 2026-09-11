import "server-only";

import {
  CLOUDFLARE_FLUX_KLEIN_MODEL,
  CLOUDFLARE_FLUX_KLEIN_MODEL_ID,
  CLOUDFLARE_WORKERS_AI_PROVIDER_ID,
} from "@/lib/ai/image/model-catalog";
import { BaseImageProvider, type ImageProviderRequest } from "@/lib/ai/image/provider";
import type { ImageErrorCode, ImageResult } from "@/lib/ai/image/types";

export const CLOUDFLARE_WORKERS_AI_MODEL_API_NAME =
  "@cf/black-forest-labs/flux-2-klein-4b";
export const CLOUDFLARE_IMAGE_TIMEOUT_MS = 60_000;
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;

export interface CloudflareWorkersAIImageProviderOptions {
  readonly accountId?: string;
  readonly apiToken?: string;
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
}

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeError(code: ImageErrorCode, operation: "generate" | "edit", durationMs: number, diagnosticCode?: ImageResult["diagnosticCode"]): ImageResult {
  return Object.freeze({
    success: false, mock: false, providerId: CLOUDFLARE_WORKERS_AI_PROVIDER_ID,
    modelId: CLOUDFLARE_FLUX_KLEIN_MODEL_ID, operation, errorCode: code,
    errorMessage: "A geracao de imagem esta indisponivel no momento.", durationMs, diagnosticCode,
  });
}

function errorForStatus(status: number): ImageErrorCode {
  if (status === 401 || status === 403) return "authentication";
  if (status === 400 || status === 413 || status === 422) return "invalid_request";
  if (status === 429) return "rate_limit";
  if (status === 503 || status === 529) return "capacity_unavailable";
  if (status >= 500) return "provider_error";
  return "provider_error";
}

function validDimension(value: number | undefined, min: number, max: number): boolean {
  return value === undefined || (Number.isInteger(value) && value >= min && value <= max);
}

/** Server-only adapter. It never accepts/fetches remote reference URLs. */
export class CloudflareWorkersAIImageProvider extends BaseImageProvider {
  readonly providerId = CLOUDFLARE_WORKERS_AI_PROVIDER_ID;
  readonly displayName = "Cloudflare Workers AI";
  readonly models = Object.freeze([CLOUDFLARE_FLUX_KLEIN_MODEL]);
  private readonly accountId?: string;
  private readonly apiToken?: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: CloudflareWorkersAIImageProviderOptions = {}) {
    super();
    this.accountId = options.accountId ?? process.env.CLOUDFLARE_AI_ACCOUNT_ID;
    this.apiToken = options.apiToken ?? process.env.CLOUDFLARE_AI_API_TOKEN;
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? CLOUDFLARE_IMAGE_TIMEOUT_MS;
  }

  get configuration() {
    const configured = nonEmpty(this.accountId) && nonEmpty(this.apiToken);
    return Object.freeze({ configured, enabled: configured });
  }

  async generate(request: ImageProviderRequest): Promise<ImageResult> {
    return this.run(request, "generate");
  }

  async edit(request: ImageProviderRequest): Promise<ImageResult> {
    return this.run(request, "edit");
  }

  private validate(request: ImageProviderRequest): ImageErrorCode | undefined {
    if (!this.configuration.configured) return "invalid_configuration";
    if (request.modelId !== CLOUDFLARE_FLUX_KLEIN_MODEL_ID || !request.prompt.trim()) return "invalid_request";
    const limits = CLOUDFLARE_FLUX_KLEIN_MODEL.limits!;
    if (!validDimension(request.width, limits.minWidth!, limits.maxWidth!) ||
        !validDimension(request.height, limits.minHeight!, limits.maxHeight!)) return "invalid_request";
    const refs = request.references ?? [];
    if (refs.length > (limits.maxReferences ?? 4)) return "invalid_request";
    for (const ref of refs) {
      if (!limits.supportedMimeTypes!.includes(ref.mimeType) || !ref.data ||
          ref.data.size > MAX_REFERENCE_BYTES || (ref.sizeBytes !== undefined && ref.sizeBytes !== ref.data.size) ||
          !validDimension(ref.width, 1, 16384) || !validDimension(ref.height, 1, 16384)) return "invalid_request";
    }
    return undefined;
  }

  private async run(request: ImageProviderRequest, operation: "generate" | "edit"): Promise<ImageResult> {
    const startMs = Date.now();
    const invalid = this.validate(request);
    if (invalid) return safeError(invalid, operation, Date.now() - startMs);

    const form = new FormData();
    form.set("prompt", request.prompt);
    if (request.width) form.set("width", String(request.width));
    if (request.height) form.set("height", String(request.height));
    if (request.seed !== undefined) form.set("seed", String(request.seed));
    (request.references ?? []).forEach((reference, index) => {
      form.set(`input_image_${index}`, reference.data!, `${reference.id || `reference-${index}`}.${reference.mimeType.split("/")[1]}`);
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId!.trim())}/ai/run/${CLOUDFLARE_WORKERS_AI_MODEL_API_NAME}`,
        { method: "POST", headers: { Authorization: `Bearer ${this.apiToken!.trim()}` }, body: form, signal: controller.signal },
      );
      if (!response.ok) return safeError(errorForStatus(response.status), operation, Date.now() - startMs);
      const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase();
      if (!contentType?.startsWith("image/")) return safeError("provider_error", operation, Date.now() - startMs);
      const imageData = await response.arrayBuffer();
      if (imageData.byteLength === 0) return safeError("provider_error", operation, Date.now() - startMs);
      return Object.freeze({
        success: true, mock: false, mimeType: contentType, imageData,
        width: request.width, height: request.height, providerId: this.providerId,
        modelId: CLOUDFLARE_FLUX_KLEIN_MODEL_ID, operation, costClass: "free",
        estimatedCost: 0, actualCost: 0, currency: "BRL", durationMs: Date.now() - startMs,
      });
    } catch (error) {
      if (controller.signal.aborted) return safeError("timeout", operation, Date.now() - startMs, "timeout");
      const causeCode = typeof error === "object" && error !== null && "cause" in error && typeof (error as { cause?: unknown }).cause === "object" ? (error as { cause?: { code?: unknown } }).cause?.code : undefined;
      const diagnosticCode = causeCode === "ENOTFOUND" ? "dns_error" : causeCode === "ECONNREFUSED" || causeCode === "ECONNRESET" ? "connection_error" : causeCode === "CERT_HAS_EXPIRED" || causeCode === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ? "tls_error" : undefined;
      return safeError("provider_unavailable", operation, Date.now() - startMs, diagnosticCode);
    } finally {
      clearTimeout(timer);
    }
  }
}
