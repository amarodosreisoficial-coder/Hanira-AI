import "server-only";

import { deriveRequiredCapabilities } from "@/lib/ai/image/capability-router";
import { evaluateImageCostPolicy } from "@/lib/ai/image/cost-policy";
import { getImageAvailabilityGate, reportImageCapacitySignal, reportImageCapacitySuccess } from "@/lib/ai/image/capacity";
import type { ImageModelDefinition } from "@/lib/ai/image/model-catalog";
import type { ImageProvider, ImageProviderRequest } from "@/lib/ai/image/provider";
import type { ImageRequest, ImageResult } from "@/lib/ai/image/types";

/** A deterministic, production-only free candidate.  Mock providers require explicit test injection. */
export interface ImageRoutingCandidate {
  readonly candidateId: string;
  readonly provider: ImageProvider;
  readonly model: ImageModelDefinition;
  readonly priority: number;
  readonly production: boolean;
}

export interface ImageRouteTrace {
  readonly event: "image_route_started" | "image_candidate_considered" | "image_candidate_skipped" | "image_candidate_attempted" | "image_candidate_succeeded" | "image_candidate_rate_limited" | "image_candidate_unhealthy" | "image_capacity_unavailable" | "image_generation_failed";
  readonly candidateId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly reasonCode?: string;
  readonly attempt?: number;
}

export interface FreeFirstImageRouterOptions { readonly onTrace?: (trace: ImageRouteTrace) => void }

function unavailable(request: ImageRequest): ImageResult {
  return Object.freeze({ success: false, mock: false, operation: request.operation, errorCode: "capacity_unavailable", errorMessage: "A geracao de imagem esta indisponivel no momento." });
}

function asProviderRequest(request: ImageRequest, modelId: string): ImageProviderRequest {
  return { prompt: request.prompt, operation: request.operation, modelId, width: request.width, height: request.height, aspectRatio: request.aspectRatio, negativePrompt: request.negativePrompt, seed: request.seed, qualityMode: request.qualityMode, references: (request.references ?? []).map((r) => ({ id: r.id ?? "", mimeType: r.mimeType ?? "image/png", data: r.data, sizeBytes: r.sizeBytes, width: r.width, height: r.height })) };
}

function retryable(code: ImageResult["errorCode"]): boolean { return code === "rate_limit" || code === "timeout" || code === "provider_unavailable" || code === "provider_error" || code === "capacity_unavailable"; }

/**
 * Production routing boundary: capability, zero-cost, configuration and capacity
 * are all evaluated before an adapter can perform network I/O. Each candidate is
 * attempted at most once, and no non-free candidate can enter the attempt loop.
 */
export class FreeFirstImageRouter {
  private readonly candidates: readonly ImageRoutingCandidate[];
  private readonly onTrace?: (trace: ImageRouteTrace) => void;
  constructor(candidates: readonly ImageRoutingCandidate[], options: FreeFirstImageRouterOptions = {}) {
    this.candidates = Object.freeze([...candidates].sort((a, b) => a.priority - b.priority || a.candidateId.localeCompare(b.candidateId)));
    this.onTrace = options.onTrace;
  }
  private trace(event: ImageRouteTrace["event"], candidate?: ImageRoutingCandidate, reasonCode?: string, attempt?: number) {
    this.onTrace?.({ event, candidateId: candidate?.candidateId, providerId: candidate?.provider.providerId, modelId: candidate?.model.id, reasonCode, attempt });
  }
  /** Read-only compatibility helper; execute() remains the production boundary. */
  select(request: ImageRequest): { readonly candidate: ImageRoutingCandidate } {
    const required = deriveRequiredCapabilities(request);
    const candidate = this.candidates.find((item) => item.production && item.provider.configuration.configured && item.provider.configuration.enabled && item.model.enabled && item.model.lifecycle === "production" && required.every((cap) => item.model.capabilities.includes(cap)) && evaluateImageCostPolicy(item.model.costClass).eligible && getImageAvailabilityGate(item.candidateId).available);
    if (!candidate) throw new Error("Nenhum provider/model de imagem elegivel para o request.");
    return Object.freeze({ candidate });
  }
  async execute(request: ImageRequest): Promise<ImageResult> {
    const required = deriveRequiredCapabilities(request);
    if (!request.prompt?.trim() || (request.operation !== "generate" && request.operation !== "edit")) return Object.freeze({ success: false, mock: false, operation: request.operation, errorCode: "invalid_request", errorMessage: "Requisicao de imagem invalida." });
    if ((request.routingMode ?? "free_first") !== "free_first") return Object.freeze({ success: false, mock: false, operation: request.operation, errorCode: "unsupported_capability", errorMessage: "Modo de imagem indisponivel." });
    this.trace("image_route_started");
    let attempted = 0;
    for (const candidate of this.candidates) {
      this.trace("image_candidate_considered", candidate);
      if (!candidate.production || !candidate.provider.configuration.enabled || !candidate.provider.configuration.configured || !candidate.model.enabled || candidate.model.lifecycle !== "production") { this.trace("image_candidate_skipped", candidate, "not_configured_or_enabled"); continue; }
      if (!required.every((cap) => candidate.model.capabilities.includes(cap))) { this.trace("image_candidate_skipped", candidate, "capability_not_supported"); continue; }
      if (!evaluateImageCostPolicy(candidate.model.costClass).eligible) { this.trace("image_candidate_skipped", candidate, "cost_not_eligible"); continue; }
      const gate = getImageAvailabilityGate(candidate.candidateId);
      if (!gate.available) { this.trace("image_candidate_skipped", candidate, gate.state); continue; }
      attempted += 1; this.trace("image_candidate_attempted", candidate, undefined, attempted);
      const result = request.operation === "edit" ? await candidate.provider.edit(asProviderRequest(request, candidate.model.id)) : await candidate.provider.generate(asProviderRequest(request, candidate.model.id));
      if (result.success) { reportImageCapacitySuccess(candidate.candidateId); this.trace("image_candidate_succeeded", candidate, undefined, attempted); return result; }
      const code = result.errorCode;
      if (code === "invalid_request" || code === "unsupported_capability") { this.trace("image_generation_failed", candidate, code, attempted); return result; }
      if (code === "rate_limit") { reportImageCapacitySignal({ candidateId: candidate.candidateId, signal: "rate_limit" }); this.trace("image_candidate_rate_limited", candidate, code, attempted); }
      else if (retryable(code)) { reportImageCapacitySignal({ candidateId: candidate.candidateId, signal: code === "timeout" ? "timeout" : code === "provider_error" ? "provider_error" : "unavailable" }); this.trace("image_candidate_unhealthy", candidate, code, attempted); }
      else { reportImageCapacitySignal({ candidateId: candidate.candidateId, signal: "model_not_found", retryable: false }); this.trace("image_generation_failed", candidate, code, attempted); }
    }
    this.trace("image_capacity_unavailable", undefined, "no_eligible_free_candidate", attempted);
    return unavailable(request);
  }
}
