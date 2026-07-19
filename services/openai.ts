import "server-only";
import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

let client: OpenAI | null = null;

export function getOpenAIClient() {
  const env = getServerEnv();
  client ??= new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: 45_000,
    maxRetries: 1,
  });
  return client;
}
