import "server-only";
import { getServerEnv } from "@/lib/env";

function requireModel(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `Configuracao invalida da Hanira. Verifique: ${name}. Consulte .env.example.`,
    );
  }
  return value;
}

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

export function getOpenAIChatModel() {
  return requireModel("OPENAI_MODEL", getServerEnv().OPENAI_MODEL);
}

export function getOpenAIVisionModel() {
  return requireModel("OPENAI_VISION_MODEL", getServerEnv().OPENAI_VISION_MODEL);
}

export function getOpenAIVoiceConfig() {
  const env = getServerEnv();
  return {
    transcription: requireModel(
      "OPENAI_TRANSCRIPTION_MODEL",
      env.OPENAI_TRANSCRIPTION_MODEL,
    ),
    speech: requireModel("OPENAI_TTS_MODEL", env.OPENAI_TTS_MODEL),
    voice: requireModel("OPENAI_TTS_VOICE", env.OPENAI_TTS_VOICE),
  } as const;
}
