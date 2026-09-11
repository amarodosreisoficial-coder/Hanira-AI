import "server-only";

import { FreeFirstImageRouter } from "@/lib/ai/image/free-first-router";
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
): FreeFirstImageRouter {
  const provider = new CloudflareWorkersAIImageProvider(options);
  return new FreeFirstImageRouter([{ candidateId: "cloudflare-workers-ai:nira-image-flux-klein", provider, model: provider.models[0], priority: 1, production: true }]);
}
