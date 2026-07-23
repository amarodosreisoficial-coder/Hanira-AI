import { OllamaProvider, type OllamaProviderOptions } from "./ollama-provider";
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
} from "./ollama-types";

export function createDefaultOllamaProvider(
  overrides: Omit<OllamaProviderOptions, "baseUrl" | "defaultModel"> = {},
) {
  return new OllamaProvider({
    baseUrl: process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
    defaultModel: process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
    ...overrides,
  });
}
