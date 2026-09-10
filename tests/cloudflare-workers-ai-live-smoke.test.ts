import { expect, it } from "vitest";
import { CloudflareWorkersAIImageProvider } from "@/lib/ai/image/cloudflare-workers-ai-provider";
import { CLOUDFLARE_FLUX_KLEIN_MODEL_ID } from "@/lib/ai/image/model-catalog";

const enabled = process.env.HANIRA_LIVE_IMAGE_SMOKE === "1";
const credentialsPresent = Boolean(process.env.CLOUDFLARE_AI_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_AI_API_TOKEN?.trim());

it.skipIf(!enabled || !credentialsPresent)("generates one controlled real Cloudflare image", async () => {
  const result = await new CloudflareWorkersAIImageProvider().generate({
    prompt: "A simple blue circle centered on a white background.", operation: "generate",
    modelId: CLOUDFLARE_FLUX_KLEIN_MODEL_ID, width: 512, height: 512,
  });
  const safeDiagnostic = JSON.stringify({
    success: result.success,
    errorCode: result.errorCode,
    providerId: result.providerId,
    modelId: result.modelId,
    mock: result.mock,
    mimeType: result.mimeType,
    durationMs: result.durationMs,
    payloadBytes: result.success ? result.imageData?.byteLength : undefined,
  });
  expect(result.success, safeDiagnostic).toBe(true);
  expect(result.mock).toBe(false);
  expect(result.mimeType).toMatch(/^image\//);
  expect(result.imageData?.byteLength).toBeGreaterThan(0);
}, 70_000);
