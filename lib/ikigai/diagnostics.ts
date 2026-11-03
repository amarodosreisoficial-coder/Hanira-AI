import "server-only";
import { AIProviderError, AI_PROVIDER_ERROR_CODES } from "@/lib/ai/types";
import { ModelRouterError, ROUTER_ERROR_CODES } from "@/lib/ai/router/errors";
import { IKIGAI_SERVICE_ERRORS } from "./public-errors";

export type IkigaiStage = "session" | "input" | "quota" | "schema" | "runtime" | "provider" | "parse" | "validation" | "render" | "pdf" | "complete";
export interface IkigaiDiagnosticContext {
  requestId: string;
  startedAtMs: number;
  stage: IkigaiStage;
  provider?: string;
  model?: string;
}

export const IKIGAI_PUBLIC_ERRORS = IKIGAI_SERVICE_ERRORS;

const validationCategories = new Set(["json", "size", "finish_reason", "schema", "evidence", "grounding", "qualification", "challenge", "title"]);
export function classifyIkigaiFailure(error: unknown, context: IkigaiDiagnosticContext, invalidResult: boolean, aborted?: "timeout" | "cancelled") {
  let category = "unexpected_error";
  let internalCode = "UNEXPECTED_ERROR";
  let publicCode: keyof typeof IKIGAI_PUBLIC_ERRORS = "technical";
  let status = 500;
  if (aborted) {
    category = aborted; internalCode = aborted.toUpperCase(); publicCode = aborted === "cancelled" ? "cancelled" : "providerUnavailable"; status = 503;
  } else if (invalidResult) {
    const detail = (error as { category?: unknown })?.category;
    category = typeof detail === "string" && validationCategories.has(detail) ? `analysis_${detail}` : "invalid_analysis";
    internalCode = "INVALID_RESULT"; status = 502;
  } else if (error instanceof ModelRouterError) {
    internalCode = ROUTER_ERROR_CODES.includes(error.code) ? error.code : "ROUTER_ERROR";
    const rejected = error.metadata?.rejected;
    const cooldown = error.code === "capacity_unavailable" && !!rejected?.length && rejected.every(item => item.reason === "capacity_cooldown");
    category = cooldown ? "capacity_cooldown" : "router_configuration";
    publicCode = cooldown ? "capacity" : "configuration"; status = 503;
  } else if (error instanceof AIProviderError) {
    internalCode = AI_PROVIDER_ERROR_CODES.includes(error.code) ? error.code : "PROVIDER_ERROR";
    if ((error.code === "invalid_request" || error.code === "unavailable") && context.stage === "runtime" && !error.retryable) {
      category = "runtime_configuration"; publicCode = "configuration"; status = 503;
    } else if (error.code === "authentication" || error.code === "authorization") {
      category = "provider_authentication"; publicCode = "configuration"; status = 503;
    } else if (error.code === "model_not_found") {
      category = "model_unavailable"; publicCode = "configuration"; status = 503;
    } else if (error.code === "invalid_request") {
      category = error.metadata?.providerFailure === "schema_rejected" ? "provider_schema_rejected" : "provider_request_rejected";
      if (error.metadata?.providerFailure === "output_invalid") category = "provider_output_invalid";
      status = 502;
    } else if (error.code === "rate_limit") {
      category = "provider_rate_limit"; publicCode = "capacity"; status = 429;
    } else if (error.code === "timeout") {
      category = error.metadata?.reason === "output_token_limit" ? "output_token_limit" : "timeout";
      publicCode = "providerUnavailable"; status = 503;
    } else if (error.code === "cancelled") {
      category = "cancelled"; publicCode = "cancelled"; status = 503;
    } else if (error.metadata?.reason === "invalid-json" || error.metadata?.reason === "malformed-response") {
      category = "provider_malformed_response"; status = 502;
    } else if (error.code === "unavailable" || error.code === "provider_error") {
      category = "provider_unavailable"; publicCode = "providerUnavailable"; status = 503;
    }
  }
  return { category, internalCode, publicCode, status };
}

// Never log Error.message/cause/stack, arbitrary metadata, Zod issues or input.
export function logIkigaiFailure(error: unknown, context: IkigaiDiagnosticContext, failure: ReturnType<typeof classifyIkigaiFailure>) {
  const identifier = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_./:-]{0,119}$/.test(value) ? value : undefined;
  const providerError = error instanceof AIProviderError ? error : undefined;
  const rawSection = error && typeof error === "object" && "section" in error ? error.section : undefined;
  const section = typeof rawSection === "string" && /^(?:synthesis|title|actionPlan\.days(?:7|30|90)|(?:passions|strengths|values|contribution|sustainablePaths|possibleDirections|challenges)\[[0-2]\])$/.test(rawSection) ? rawSection : undefined;
  console.error(JSON.stringify({
    requestId: context.requestId, stage: context.stage, internalCode: failure.internalCode,
    ...(providerError?.statusCode && Number.isInteger(providerError.statusCode) && providerError.statusCode >= 100 && providerError.statusCode <= 599 ? { providerStatus: providerError.statusCode } : {}),
    provider: identifier(context.provider) ?? identifier(providerError?.provider),
    model: identifier(context.model) ?? identifier(providerError?.model),
    durationMs: Math.max(0, Date.now() - context.startedAtMs), failureCategory: failure.category,
    ...(failure.category.startsWith("analysis_") && section ? { section } : {}),
  }));
}
