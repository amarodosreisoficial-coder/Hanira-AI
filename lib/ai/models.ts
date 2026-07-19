import "server-only";
import { getServerEnv } from "@/lib/env";

export function getAIModelConfig() {
  const env = getServerEnv();
  return {
    chat: env.OPENAI_MODEL,
    vision: env.OPENAI_VISION_MODEL,
    transcription: env.OPENAI_TRANSCRIPTION_MODEL,
    speech: env.OPENAI_TTS_MODEL,
    voice: env.OPENAI_TTS_VOICE,
  } as const;
}
