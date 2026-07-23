import "server-only";
import { getAIModelConfig } from "@/lib/ai/models";
import { getOpenAIClient } from "@/services/openai";
import { OpenAIProvider } from "./openai-provider";

export function createDefaultOpenAIProvider() {
  return new OpenAIProvider({
    clientFactory: () => getOpenAIClient(),
    defaultModelResolver: () => getAIModelConfig().chat,
  });
}
