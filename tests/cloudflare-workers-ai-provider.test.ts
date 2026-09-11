import { describe, expect, it, vi } from "vitest";
import {
  CLOUDFLARE_FLUX_KLEIN_MODEL_ID,
  CLOUDFLARE_WORKERS_AI_PROVIDER_ID,
} from "@/lib/ai/image/model-catalog";
import { CloudflareWorkersAIImageProvider } from "@/lib/ai/image/cloudflare-workers-ai-provider";
import { createProductionImageRouter } from "@/lib/ai/image/runtime";

vi.mock("server-only", () => ({}));

const request = { prompt: "a blue circle", operation: "generate" as const, modelId: CLOUDFLARE_FLUX_KLEIN_MODEL_ID, width: 512, height: 512 };
const configured = (fetchFn: typeof fetch) => new CloudflareWorkersAIImageProvider({ accountId: "account", apiToken: "token", fetchFn });

describe("Cloudflare Workers AI image provider", () => {
  it("is unconfigured without either secret", () => {
    expect(new CloudflareWorkersAIImageProvider({ apiToken: "x" }).configuration.configured).toBe(false);
    expect(new CloudflareWorkersAIImageProvider({ accountId: "x" }).configuration.configured).toBe(false);
    expect(new CloudflareWorkersAIImageProvider({ accountId: "x", apiToken: "y" }).configuration.configured).toBe(true);
  });

  it("production routing includes no mock fallback", () => {
    const router = createProductionImageRouter({ accountId: "", apiToken: "" });
    expect(() => router.select({ prompt: "test", operation: "generate" })).toThrow(/Nenhum provider/);
  });

  it("translates a text request with native FormData and normalizes image output", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(_url).toContain("/accounts/account/ai/run/@cf/black-forest-labs/flux-2-klein-4b");
      expect(init?.headers).toEqual({ Authorization: "Bearer token" });
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get("prompt")).toBe("a blue circle");
      expect(form.get("width")).toBe("512");
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
    }) as unknown as typeof fetch;
    const result = await configured(fetchFn).generate(request);
    expect(result).toMatchObject({ success: true, mock: false, providerId: CLOUDFLARE_WORKERS_AI_PROVIDER_ID, modelId: CLOUDFLARE_FLUX_KLEIN_MODEL_ID, mimeType: "image/png" });
    expect(result.imageData?.byteLength).toBe(4);
  });

  it("normalizes Flux JSON base64 output without exposing it", async () => {
    const image = Buffer.from([137, 80, 78, 71]).toString("base64");
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ result: { image } }), { headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const result = await configured(fetchFn).generate(request);
    expect(result).toMatchObject({ success: true, mimeType: "image/png", mock: false });
    expect(result.imageData?.byteLength).toBe(4);
    expect(JSON.stringify(result)).not.toContain(image);
  });

  it("maps edit references, including up to four local blobs", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(form.get("input_image_0")).toBeInstanceOf(Blob);
      expect(form.get("input_image_3")).toBeInstanceOf(Blob);
      return new Response(new Uint8Array([1]), { headers: { "content-type": "image/webp" } });
    }) as unknown as typeof fetch;
    const refs = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, mimeType: "image/png", data: new Blob(["x"], { type: "image/png" }), sizeBytes: 1, width: 1, height: 1 }));
    const result = await configured(fetchFn).edit({ ...request, operation: "edit", references: refs });
    expect(result.success).toBe(true);
  });

  it("rejects malformed dimensions and more than four references before network", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const provider = configured(fetchFn);
    expect((await provider.generate({ ...request, width: 200 })).errorCode).toBe("invalid_request");
    const refs = Array.from({ length: 5 }, () => ({ id: "r", mimeType: "image/png", data: new Blob(["x"], { type: "image/png" }) }));
    expect((await provider.edit({ ...request, operation: "edit", references: refs })).errorCode).toBe("invalid_request");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([[401, "authentication"], [429, "rate_limit"], [503, "capacity_unavailable"], [500, "provider_error"]] as const)("normalizes %i safely", async (status, code) => {
    const fetchFn = vi.fn(async () => new Response("private provider details", { status })) as unknown as typeof fetch;
    const result = await configured(fetchFn).generate(request);
    expect(result.errorCode).toBe(code);
    expect(result.errorMessage).not.toContain("private provider details");
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("normalizes timeout and never sends a request without configuration", async () => {
    const slow = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    expect((await new CloudflareWorkersAIImageProvider({ accountId: "a", apiToken: "t", fetchFn: slow, timeoutMs: 1 }).generate(request)).errorCode).toBe("timeout");
    const noConfigFetch = vi.fn() as unknown as typeof fetch;
    expect((await new CloudflareWorkersAIImageProvider({ accountId: "", apiToken: "", fetchFn: noConfigFetch }).generate(request)).errorCode).toBe("invalid_configuration");
    expect(noConfigFetch).not.toHaveBeenCalled();
  });
});
