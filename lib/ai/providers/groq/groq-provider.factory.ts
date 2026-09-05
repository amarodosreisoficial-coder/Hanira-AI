import { GROQ_PROVIDER_ID } from "./groq-types";
import { GroqProvider, type GroqProviderOptions } from "./groq-provider";

export function createGroqProvider(
  overrides: Omit<GroqProviderOptions, "apiKey" | "defaultModel"> = {},
): GroqProvider {
  return new GroqProvider({
    apiKey: process.env.GROQ_API_KEY,
    defaultModel: process.env.GROQ_MODEL,
    ...overrides,
  });
}

export function createGroqProviderIfConfigured():
  | GroqProvider
  | undefined {
  if (!process.env.GROQ_API_KEY) {
    return undefined;
  }
  return createGroqProvider();
}

export { GROQ_PROVIDER_ID };
