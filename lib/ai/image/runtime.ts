import "server-only";

import { ImageCapabilityRouter } from "@/lib/ai/image/capability-router";
import {
  CloudflareWorkersAIImageProvider,
  type CloudflareWorkersAIImageProviderOptions,
} from "@/lib/ai/image/cloudflare-workers-ai-provider";

/**
 * Production image routing intentionally contains real providers only.
 * MockImageProvider is test/development tooling and must be injected explicitly.
 */
export function createProductionImageRouter(
  options: CloudflareWorkersAIImageProviderOptions = {},
): ImageCapabilityRouter {
  return new ImageCapabilityRouter([new CloudflareWorkersAIImageProvider(options)]);
}
