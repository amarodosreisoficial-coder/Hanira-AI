import "server-only";
import { getOpenAIChatModel } from "@/lib/ai/models";
import { getOpenAIClient } from "@/services/openai";
import { OpenAIProvider } from "./openai-provider";

export function createDefaultOpenAIProvider() {
  return new OpenAIProvider({
    clientFactory: () => getOpenAIClient(),
    defaultModelResolver: () => getOpenAIChatModel(),
  });
}
