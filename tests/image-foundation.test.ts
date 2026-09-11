import { describe, it, expect, beforeEach } from "vitest";
import {
  createImageModelCatalog,
  IMAGE_MOCK_MODEL,
  IMAGE_MOCK_PROVIDER_ID,
  IMAGE_MOCK_MODEL_ID,
  validateModelDefinition,
} from "@/lib/ai/image/model-catalog";
import { createImageProviderRegistry } from "@/lib/ai/image/provider-registry";
import type { ImageProvider } from "@/lib/ai/image/provider";
import { MockImageProvider } from "@/lib/ai/image/mock-provider";
import { ImageCapabilityRouter, deriveRequiredCapabilities } from "@/lib/ai/image/capability-router";
import { ImageRouterError } from "@/lib/ai/image/errors";
import { ZERO_COST_IMAGE_POLICY, evaluateImageCostPolicy } from "@/lib/ai/image/cost-policy";
import {
  toImageRoutingTraceLogFields,
  IMAGE_ROUTING_TRACE_EVENTS,
} from "@/lib/ai/image/observability";
import type { ImageRoutingTraceMeta } from "@/lib/ai/image/observability";
import {
  isImageOperation,
  isImageCapability,
  isImageAspectRatio,
  isImageRoutingMode,
  isImageQualityMode,
  isImageErrorCode,
  isImageModelLifecycle,
  IMAGE_OPERATIONS,
  IMAGE_CAPABILITIES,
  IMAGE_ASPECT_RATIOS,
  IMAGE_ROUTING_MODES,
  IMAGE_QUALITY_MODES,
  IMAGE_ERROR_CODES,
  IMAGE_MODEL_LIFECYCLES,
} from "@/lib/ai/image/types";
import type { ImageOperation } from "@/lib/ai/image/types";
import { resetImageCapacityStateForTests } from "@/lib/ai/image/capacity";

beforeEach(() => {
  resetImageCapacityStateForTests();
});

describe("image domain types", () => {
  it("validates image operations", () => {
    expect(isImageOperation("generate")).toBe(true);
    expect(isImageOperation("edit")).toBe(true);
    expect(isImageOperation("invalid")).toBe(false);
    expect(IMAGE_OPERATIONS).toEqual(["generate", "edit"]);
  });

  it("validates image capabilities", () => {
    expect(isImageCapability("textToImage")).toBe(true);
    expect(isImageCapability("imageEdit")).toBe(true);
    expect(isImageCapability("referenceImage")).toBe(true);
    expect(isImageCapability("multipleReferences")).toBe(true);
    expect(isImageCapability("invalid")).toBe(false);
    expect(IMAGE_CAPABILITIES).toHaveLength(9);
  });

  it("validates aspect ratios", () => {
    expect(isImageAspectRatio("1:1")).toBe(true);
    expect(isImageAspectRatio("16:9")).toBe(true);
    expect(isImageAspectRatio("99:99")).toBe(false);
  });

  it("validates routing modes", () => {
    expect(isImageRoutingMode("free_first")).toBe(true);
    expect(isImageRoutingMode("economy")).toBe(true);
    expect(isImageRoutingMode("invalid")).toBe(false);
    expect(IMAGE_ROUTING_MODES).toEqual(["free_first", "economy", "balanced", "quality", "manual"]);
  });

  it("validates quality modes", () => {
    expect(isImageQualityMode("standard")).toBe(true);
    expect(isImageQualityMode("economy")).toBe(true);
    expect(isImageQualityMode("quality")).toBe(true);
    expect(isImageQualityMode("invalid")).toBe(false);
  });

  it("validates error codes", () => {
    expect(isImageErrorCode("invalid_request")).toBe(true);
    expect(isImageErrorCode("unsupported_capability")).toBe(true);
    expect(isImageErrorCode("invalid")).toBe(false);
  });

  it("validates model lifecycles", () => {
    expect(isImageModelLifecycle("production")).toBe(true);
    expect(isImageModelLifecycle("preview")).toBe(true);
    expect(isImageModelLifecycle("deprecated")).toBe(true);
    expect(isImageModelLifecycle("disabled")).toBe(true);
    expect(isImageModelLifecycle("invalid")).toBe(false);
  });
});

describe("image model catalog", () => {
  it("1. valid mock provider registration", () => {
    const catalog = createImageModelCatalog();
    expect(catalog.models.length).toBeGreaterThanOrEqual(1);
    expect(catalog.getModel(IMAGE_MOCK_MODEL_ID)).toBeDefined();
  });

  it("7. free model eligible", () => {
    const evaluation = evaluateImageCostPolicy("free");
    expect(evaluation.eligible).toBe(true);
  });

  it("8. paid model blocked", () => {
    const evaluation = evaluateImageCostPolicy("paid");
    expect(evaluation.eligible).toBe(false);
    if (!evaluation.eligible) {
      expect(evaluation.reason).toBe("cost_blocked_paid");
    }
  });

  it("9. promotional blocked by default", () => {
    const evaluation = evaluateImageCostPolicy("promotional");
    expect(evaluation.eligible).toBe(false);
    if (!evaluation.eligible) {
      expect(evaluation.reason).toBe("cost_blocked_promotional");
    }
  });

  it("6. unknown cost class fail-closed", () => {
    const evaluation = evaluateImageCostPolicy(undefined);
    expect(evaluation.eligible).toBe(false);
    if (!evaluation.eligible) {
      expect(evaluation.reason).toBe("cost_class_unknown");
    }
  });

  it("rejects malformed model definition", () => {
    expect(() => validateModelDefinition({})).toThrow();
    expect(() => validateModelDefinition(null)).toThrow();
    expect(() => validateModelDefinition({ id: "", providerId: "x", displayName: "x", lifecycle: "production", capabilities: [], costClass: "free", enabled: true })).toThrow();
  });

  it("rejects model with invalid cost class", () => {
    expect(() => validateModelDefinition({ id: "x", providerId: "p", displayName: "X", lifecycle: "production", capabilities: [], costClass: "unknown", enabled: true })).toThrow();
  });

  it("rejects model with invalid lifecycle", () => {
    expect(() => validateModelDefinition({ id: "x", providerId: "p", displayName: "X", lifecycle: "beta", capabilities: [], costClass: "free", enabled: true })).toThrow();
  });

  it("rejects model with invalid capability", () => {
    expect(() => validateModelDefinition({ id: "x", providerId: "p", displayName: "X", lifecycle: "production", capabilities: ["invalid"], costClass: "free", enabled: true })).toThrow();
  });

  it("finds models by capabilities", () => {
    const catalog = createImageModelCatalog();
    const result = catalog.findByCapabilities(["textToImage", "imageEdit"]);
    expect(result.map((model) => model.id)).toContain(IMAGE_MOCK_MODEL_ID);
  });

  it("returns empty for unsupported capabilities", () => {
    const catalog = createImageModelCatalog();
    const result = catalog.findByCapabilities(["asyncGeneration"]);
    expect(result).toHaveLength(0);
  });

  it("gets models by provider", () => {
    const catalog = createImageModelCatalog();
    const result = catalog.getModelsByProvider(IMAGE_MOCK_PROVIDER_ID);
    expect(result).toHaveLength(1);
  });
});

describe("image provider registry", () => {
  it("registers valid mock provider", () => {
    const mock = new MockImageProvider();
    const registry = createImageProviderRegistry({ providers: [mock] });
    expect(registry.providers).toHaveLength(1);
    expect(registry.getProvider(IMAGE_MOCK_PROVIDER_ID)).toBeDefined();
  });

  it("2. duplicate provider ID rejected", () => {
    const mock1 = new MockImageProvider();
    const mock2 = new MockImageProvider();
    expect(() => createImageProviderRegistry({ providers: [mock1, mock2] })).toThrow(ImageRouterError);
  });

  it("rejects malformed provider", () => {
    const malformed = {
      providerId: "",
      displayName: "",
      configuration: { configured: true, enabled: true },
      models: [],
      capabilities: [],
    } as unknown as ImageProvider;
    expect(() => createImageProviderRegistry({ providers: [malformed] })).toThrow(ImageRouterError);
  });

  it("lists configured providers", () => {
    const mock = new MockImageProvider({ configured: true, enabled: true });
    const registry = createImageProviderRegistry({ providers: [mock] });
    expect(registry.configuredProviders).toHaveLength(1);
  });

  it("excludes unconfigured providers", () => {
    const mock = new MockImageProvider({ configured: false, enabled: true });
    const registry = createImageProviderRegistry({ providers: [mock] });
    expect(registry.configuredProviders).toHaveLength(0);
  });

  it("excludes disabled providers", () => {
    const mock = new MockImageProvider({ configured: true, enabled: false });
    const registry = createImageProviderRegistry({ providers: [mock] });
    expect(registry.configuredProviders).toHaveLength(0);
  });

  it("lists all models", () => {
    const mock = new MockImageProvider();
    const registry = createImageProviderRegistry({ providers: [mock] });
    expect(registry.allModels).toHaveLength(1);
  });

  it("finds by capabilities", () => {
    const mock = new MockImageProvider();
    const registry = createImageProviderRegistry({ providers: [mock] });
    const result = registry.findByCapabilities(["textToImage"]);
    expect(result).toHaveLength(1);
  });
});

describe("capability router", () => {
  it("10. capability filtering textToImage", () => {
    const mock = new MockImageProvider();
    const router = new ImageCapabilityRouter([mock]);
    const decision = router.select({ prompt: "test", operation: "generate" });
    expect(decision.candidate.model.capabilities).toContain("textToImage");
  });

  it("11. capability filtering imageEdit", () => {
    const mock = new MockImageProvider();
    const router = new ImageCapabilityRouter([mock]);
    const decision = router.select({ prompt: "test", operation: "edit" });
    expect(decision.candidate.model.capabilities).toContain("imageEdit");
  });

  it("12. capability filtering referenceImage", () => {
    const mock = new MockImageProvider();
    const router = new ImageCapabilityRouter([mock]);
    const decision = router.select({ prompt: "test", operation: "edit", references: [{ id: "r1", mimeType: "image/png" }] });
    expect(decision.candidate.model.capabilities).toContain("referenceImage");
  });

  it("13. capability filtering multipleReferences", () => {
    const mock = new MockImageProvider();
    const router = new ImageCapabilityRouter([mock]);
    const decision = router.select({ prompt: "test", operation: "edit", references: [{ id: "r1" }, { id: "r2" }] });
    expect(decision.candidate.model.capabilities).toContain("multipleReferences");
  });

  it("14. multipleReferences request rejects single-reference model", () => {
    const singleRefModel = {
      ...IMAGE_MOCK_MODEL,
      id: "single-ref-model",
      capabilities: ["textToImage", "imageEdit", "referenceImage", "aspectRatio", "resolution"] as const,
    };
    const provider = {
      providerId: "test-provider",
      displayName: "Test",
      configuration: { configured: true, enabled: true },
      models: [singleRefModel],
      capabilities: singleRefModel.capabilities,
      supports: (cap: string) => (singleRefModel.capabilities as readonly string[]).includes(cap),
      generate: async () => ({ success: true, mock: true }),
      edit: async () => ({ success: true, mock: true }),
    };
    const router = new ImageCapabilityRouter([provider] as unknown as readonly ImageProvider[]);
    expect(() => router.select({ prompt: "test", operation: "edit", references: [{ id: "r1" }, { id: "r2" }] })).toThrow(ImageRouterError);
  });

  it("15. deterministic model selection", () => {
    const mock = new MockImageProvider();
    const router = new ImageCapabilityRouter([mock]);
    const d1 = router.select({ prompt: "test", operation: "generate" });
    const d2 = router.select({ prompt: "test", operation: "generate" });
    expect(d1.candidate.model.id).toBe(d2.candidate.model.id);
    expect(d1.candidate.provider.providerId).toBe(d2.candidate.provider.providerId);
  });

  it("23. no eligible provider -> structured unavailable", () => {
    const router = new ImageCapabilityRouter([]);
    expect(() => router.select({ prompt: "test", operation: "generate" })).toThrow(ImageRouterError);
    try {
      router.select({ prompt: "test", operation: "generate" });
    } catch (e) {
      expect(e).toBeInstanceOf(ImageRouterError);
      expect((e as ImageRouterError).code).toBe("no_eligible_provider");
    }
  });

  it("24. unsafe/manual paid preference cannot bypass Zero-Cost policy", () => {
    const mock = new MockImageProvider();
    const router = new ImageCapabilityRouter([mock]);
    expect(() => router.select({ prompt: "test", operation: "generate", routingMode: "quality" })).toThrow(ImageRouterError);
    expect(() => router.select({ prompt: "test", operation: "generate", routingMode: "manual" })).toThrow(ImageRouterError);
  });

  it("25. malformed request rejected", () => {
    const mock = new MockImageProvider();
    const router = new ImageCapabilityRouter([mock]);
    expect(() => router.select({ prompt: "", operation: "generate" })).toThrow();
    expect(() => router.select({ prompt: "test", operation: "invalid" as unknown as ImageOperation })).toThrow();
  });

  it("derives required capabilities correctly", () => {
    expect(deriveRequiredCapabilities({ prompt: "test", operation: "generate" })).toContain("textToImage");
    expect(deriveRequiredCapabilities({ prompt: "test", operation: "edit" })).toContain("imageEdit");
    expect(deriveRequiredCapabilities({ prompt: "test", operation: "generate", references: [{ id: "r1" }] })).toContain("referenceImage");
    expect(deriveRequiredCapabilities({ prompt: "test", operation: "generate", references: [{ id: "r1" }, { id: "r2" }] })).toContain("multipleReferences");
    expect(deriveRequiredCapabilities({ prompt: "test", operation: "generate", aspectRatio: "1:1" })).toContain("aspectRatio");
    expect(deriveRequiredCapabilities({ prompt: "test", operation: "generate", width: 512 })).toContain("resolution");
  });

  it("executes generate via router", async () => {
    const mock = new MockImageProvider();
    const router = new ImageCapabilityRouter([mock]);
    const result = await router.execute({ prompt: "test", operation: "generate" });
    expect(result.success).toBe(true);
    expect(result.mock).toBe(true);
  });

  it("executes edit via router", async () => {
    const mock = new MockImageProvider();
    const router = new ImageCapabilityRouter([mock]);
    const result = await router.execute({ prompt: "test", operation: "edit" });
    expect(result.success).toBe(true);
    expect(result.mock).toBe(true);
  });
});

describe("mock provider", () => {
  it("16. mock generation succeeds", async () => {
    const mock = new MockImageProvider();
    const result = await mock.generate({ prompt: "test", operation: "generate", modelId: IMAGE_MOCK_MODEL_ID });
    expect(result.success).toBe(true);
  });

  it("17. mock result explicitly says mock=true", async () => {
    const mock = new MockImageProvider();
    const result = await mock.generate({ prompt: "test", operation: "generate", modelId: IMAGE_MOCK_MODEL_ID });
    expect(result.mock).toBe(true);
  });

  it("18. mock cost = zero", async () => {
    const mock = new MockImageProvider();
    const result = await mock.generate({ prompt: "test", operation: "generate", modelId: IMAGE_MOCK_MODEL_ID });
    expect(result.costClass).toBe("free");
    expect(result.estimatedCost).toBe(0);
    expect(result.actualCost).toBe(0);
  });

  it("19. mock requires no API key", () => {
    const mock = new MockImageProvider();
    expect(mock.configuration.configured).toBe(true);
    expect(Object.keys(mock.configuration)).toEqual(["configured", "enabled"]);
  });

  it("20. mock performs no network call", async () => {
    const mock = new MockImageProvider();
    const result = await mock.generate({ prompt: "test", operation: "generate", modelId: IMAGE_MOCK_MODEL_ID });
    expect(result.success).toBe(true);
    expect(result.mock).toBe(true);
  });

  it("21. simulated provider failure normalized safely", async () => {
    const mock = new MockImageProvider({ simulateFailure: true });
    const result = await mock.generate({ prompt: "test", operation: "generate", modelId: IMAGE_MOCK_MODEL_ID });
    expect(result.success).toBe(false);
    expect(result.mock).toBe(true);
    expect(result.errorCode).toBe("provider_error");
  });

  it("22. simulated capacity exhaustion", async () => {
    const mock = new MockImageProvider({ simulateCapacityUnavailable: true });
    const result = await mock.generate({ prompt: "test", operation: "generate", modelId: IMAGE_MOCK_MODEL_ID });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("capacity_unavailable");
  });

  it("simulated unsupported capability", async () => {
    const mock = new MockImageProvider({ simulateUnsupportedCapability: true });
    const result = await mock.generate({ prompt: "test", operation: "generate", modelId: IMAGE_MOCK_MODEL_ID });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("unsupported_capability");
  });

  it("mock edit succeeds", async () => {
    const mock = new MockImageProvider();
    const result = await mock.edit({ prompt: "test", operation: "edit", modelId: IMAGE_MOCK_MODEL_ID });
    expect(result.success).toBe(true);
    expect(result.mock).toBe(true);
    expect(result.operation).toBe("edit");
  });

  it("mock returns correct dimensions", async () => {
    const mock = new MockImageProvider({ defaultWidth: 256, defaultHeight: 256 });
    const result = await mock.generate({ prompt: "test", operation: "generate", modelId: IMAGE_MOCK_MODEL_ID });
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
  });

  it("mock returns MIME type", async () => {
    const mock = new MockImageProvider();
    const result = await mock.generate({ prompt: "test", operation: "generate", modelId: IMAGE_MOCK_MODEL_ID });
    expect(result.mimeType).toBe("image/png");
  });

  it("mock provider declares capabilities", () => {
    const mock = new MockImageProvider();
    expect(mock.capabilities).toContain("textToImage");
    expect(mock.capabilities).toContain("imageEdit");
    expect(mock.capabilities).toContain("referenceImage");
    expect(mock.capabilities).toContain("multipleReferences");
    expect(mock.capabilities).toContain("aspectRatio");
    expect(mock.capabilities).toContain("resolution");
  });

  it("mock supports() works", () => {
    const mock = new MockImageProvider();
    expect(mock.supports("textToImage")).toBe(true);
    expect(mock.supports("asyncGeneration")).toBe(false);
  });
});

describe("zero-cost image policy", () => {
  it("ZERO_COST_IMAGE_POLICY is frozen", () => {
    expect(Object.isFrozen(ZERO_COST_IMAGE_POLICY)).toBe(true);
    expect(ZERO_COST_IMAGE_POLICY.mode).toBe("zero_cost");
    expect(ZERO_COST_IMAGE_POLICY.allowPromotional).toBe(false);
  });

  it("paid always blocked", () => {
    const evaluation = evaluateImageCostPolicy("paid", ZERO_COST_IMAGE_POLICY);
    expect(evaluation.eligible).toBe(false);
  });

  it("promotional blocked by default", () => {
    const evaluation = evaluateImageCostPolicy("promotional", ZERO_COST_IMAGE_POLICY);
    expect(evaluation.eligible).toBe(false);
  });

  it("free eligible", () => {
    const evaluation = evaluateImageCostPolicy("free", ZERO_COST_IMAGE_POLICY);
    expect(evaluation.eligible).toBe(true);
  });

  it("unknown fail-closed", () => {
    const evaluation = evaluateImageCostPolicy(undefined, ZERO_COST_IMAGE_POLICY);
    expect(evaluation.eligible).toBe(false);
  });
});

describe("image routing observability", () => {
  it("27. no prompt in observability", () => {
    const fields = toImageRoutingTraceLogFields({ requestId: "r1", providerId: "p1", prompt: "secret" } as unknown as ImageRoutingTraceMeta);
    expect(fields).not.toHaveProperty("prompt");
    expect(fields.requestId).toBe("r1");
  });

  it("28. no reference image content in observability", () => {
    const fields = toImageRoutingTraceLogFields({ requestId: "r1", referenceBase64: "binary" } as unknown as ImageRoutingTraceMeta);
    expect(fields).not.toHaveProperty("referenceBase64");
  });

  it("only allows safe scalar fields", () => {
    const fields = toImageRoutingTraceLogFields({
      requestId: "r1", providerId: "p1", modelId: "m1", operation: "generate",
      costClass: "free", mock: true, durationMs: 100, outcome: "success", reasonCode: "none",
    });
    expect(Object.keys(fields).sort()).toEqual([
      "costClass", "durationMs", "mock", "modelId", "operation", "outcome", "providerId", "reasonCode", "requestId",
    ]);
  });

  it("rejects non-scalar values", () => {
    const fields = toImageRoutingTraceLogFields({ requestId: "r1", nested: { a: 1 } } as unknown as ImageRoutingTraceMeta);
    expect(fields).not.toHaveProperty("nested");
    expect(fields.requestId).toBe("r1");
  });

  it("IMAGE_ROUTING_TRACE_EVENTS has expected events", () => {
    expect(IMAGE_ROUTING_TRACE_EVENTS).toEqual([
      "image_routing_started", "image_candidate_considered", "image_candidate_selected",
      "image_candidate_rejected", "image_generation_completed", "image_generation_failed",
      "image_routing_exhausted",
    ]);
  });
});

describe("image capacity foundation", () => {
  it("resets capacity state for tests", () => {
    resetImageCapacityStateForTests();
  });
});

describe("image router error", () => {
  it("carries code and metadata", () => {
    const error = new ImageRouterError({
      code: "no_eligible_provider",
      message: "test",
      metadata: { providersConsidered: 0 },
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ImageRouterError");
    expect(error.code).toBe("no_eligible_provider");
    expect(error.metadata?.providersConsidered).toBe(0);
  });
});
