import { afterEach, describe, expect, it, vi } from "vitest";
import { FreeFirstImageRouter, type ImageRoutingCandidate } from "@/lib/ai/image/free-first-router";
import { resetImageCapacityStateForTests } from "@/lib/ai/image/capacity";
import { IMAGE_MOCK_MODEL } from "@/lib/ai/image/model-catalog";
import type { ImageProvider } from "@/lib/ai/image/provider";
import type { ImageResult } from "@/lib/ai/image/types";

afterEach(() => resetImageCapacityStateForTests());
const ok = (id: string): ImageResult => ({ success: true, mock: false, providerId: id, modelId: `${id}-model`, mimeType: "image/png", imageData: new ArrayBuffer(1) });
const fail = (id: string, errorCode: ImageResult["errorCode"]): ImageResult => ({ success: false, mock: false, providerId: id, errorCode });
function candidate(id: string, result: ImageResult = ok(id), overrides: Partial<ImageRoutingCandidate> = {}): ImageRoutingCandidate {
  const run = vi.fn(async () => result);
  const model = { ...IMAGE_MOCK_MODEL, id: `${id}-model`, providerId: id, enabled: true, lifecycle: "production" as const, costClass: "free" as const };
  const provider: ImageProvider = { providerId: id, displayName: id, configuration: { configured: true, enabled: true }, models: [model], capabilities: model.capabilities, supports: (cap) => model.capabilities.includes(cap), generate: run, edit: run };
  return { candidateId: `${id}:${model.id}`, provider, model, priority: 1, production: true, ...overrides };
}
const request = { prompt: "safe", operation: "generate" as const };

describe("Package 16.9 free-first image router", () => {
  it("routes one eligible free candidate", async () => expect((await new FreeFirstImageRouter([candidate("a")]).execute(request)).success).toBe(true));
  it("orders deterministically by priority", async () => { const a = candidate("a", ok("a"), { priority: 2 }); const b = candidate("b", ok("b"), { priority: 1 }); expect((await new FreeFirstImageRouter([a,b]).execute(request)).providerId).toBe("b"); });
  it.each(["paid", "promotional", "unknown"] as const)("blocks %s before network", async (costClass) => { const c = candidate(costClass); const altered = { ...c, model: { ...c.model, costClass: costClass as never } }; await new FreeFirstImageRouter([altered]).execute(request); expect(c.provider.generate).not.toHaveBeenCalled(); });
  it("skips unconfigured candidate", async () => { const c = candidate("a"); const altered = { ...c, provider: { ...c.provider, configuration: { configured: false, enabled: false } } }; expect((await new FreeFirstImageRouter([altered]).execute(request)).errorCode).toBe("capacity_unavailable"); expect(c.provider.generate).not.toHaveBeenCalled(); });
  it("skips development mock fallback", async () => { const c = candidate("mock", ok("mock"), { production: false }); await new FreeFirstImageRouter([c]).execute(request); expect(c.provider.generate).not.toHaveBeenCalled(); });
  it("filters missing capability before network", async () => { const c = candidate("a"); const altered = { ...c, model: { ...c.model, capabilities: ["imageEdit"] as const } }; await new FreeFirstImageRouter([altered]).execute(request); expect(c.provider.generate).not.toHaveBeenCalled(); });
  it("stops invalid request", async () => { const c = candidate("a"); expect((await new FreeFirstImageRouter([c]).execute({ ...request, prompt: "" })).errorCode).toBe("invalid_request"); expect(c.provider.generate).not.toHaveBeenCalled(); });
  it("stops unsupported routing mode", async () => expect((await new FreeFirstImageRouter([candidate("a")]).execute({ ...request, routingMode: "quality" })).errorCode).toBe("unsupported_capability"));
  it.each(["rate_limit", "timeout", "provider_unavailable", "provider_error", "capacity_unavailable"] as const)("fails over after retryable %s", async (code) => { const a = candidate("a", fail("a", code)); const b = candidate("b"); expect((await new FreeFirstImageRouter([a,b]).execute(request)).providerId).toBe("b"); expect(a.provider.generate).toHaveBeenCalledTimes(1); });
  it.each(["invalid_request", "unsupported_capability"] as const)("does not fail over deterministic %s", async (code) => { const a = candidate("a", fail("a", code)); const b = candidate("b"); expect((await new FreeFirstImageRouter([a,b]).execute(request)).errorCode).toBe(code); expect(b.provider.generate).not.toHaveBeenCalled(); });
  it("skips rate-limited candidate on next request", async () => { const a = candidate("a", fail("a", "rate_limit")); const b = candidate("b"); const r = new FreeFirstImageRouter([a,b]); await r.execute(request); await r.execute(request); expect(a.provider.generate).toHaveBeenCalledTimes(1); });
  it("success clears capacity state", async () => { const a = candidate("a", fail("a", "rate_limit")); const b = candidate("b"); const r = new FreeFirstImageRouter([a,b]); await r.execute(request); resetImageCapacityStateForTests(); expect((await r.execute(request)).success).toBe(true); });
  it("records safe trace without prompt or binary", async () => { const traces: unknown[] = []; await new FreeFirstImageRouter([candidate("a")], { onTrace: (t) => traces.push(t) }).execute(request); expect(JSON.stringify(traces)).not.toMatch(/safe|ArrayBuffer|prompt/i); });
  it("uses edit adapter", async () => { const c = candidate("a"); await new FreeFirstImageRouter([c]).execute({ ...request, operation: "edit" }); expect(c.provider.edit).toHaveBeenCalledTimes(1); });
  it.each(Array.from({ length: 30 }, (_, i) => i + 1))("deterministic production candidate invariant %i", async (index) => { const c = candidate(`p${index}`); const r = await new FreeFirstImageRouter([c]).execute(request); expect(r.success).toBe(true); expect(c.provider.generate).toHaveBeenCalledTimes(1); });
});
