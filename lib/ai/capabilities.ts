import "server-only";
import { getAIModelConfig } from "@/lib/ai/models";
import { getPublicEnv, getServerEnv, isDemoMode } from "@/lib/env";

export const AI_CAPABILITY_NAMES = [
  "text",
  "vision",
  "transcription",
  "speech",
  "attachments",
] as const;

export type AICapabilityName = (typeof AI_CAPABILITY_NAMES)[number];

export const AI_CAPABILITY_STATUSES = [
  "available",
  "disabled",
  "misconfigured",
  "unavailable",
] as const;

export type AICapabilityStatus = (typeof AI_CAPABILITY_STATUSES)[number];

export interface AICapabilityDescriptor {
  enabled: boolean;
  status: AICapabilityStatus;
  provider?: string;
  model?: string;
  voice?: string;
  reason?: string;
}

export interface AICapabilities {
  text: AICapabilityDescriptor;
  vision: AICapabilityDescriptor;
  transcription: AICapabilityDescriptor;
  speech: AICapabilityDescriptor;
  attachments: AICapabilityDescriptor;
}

function availabilityResult(
  enabled: boolean,
  provider?: string,
  model?: string,
  reason?: string,
  voice?: string,
): AICapabilityDescriptor {
  if (!enabled) {
    return { enabled: false, status: "disabled", provider, model, voice, reason };
  }

  if (reason) {
    return { enabled: true, status: "misconfigured", provider, model, voice, reason };
  }

  return { enabled: true, status: "available", provider, model, voice };
}

export function getPublicAICapabilityFlags() {
  const env = getPublicEnv();
  return {
    vision: env.NEXT_PUBLIC_VISION_ENABLED,
    voice: env.NEXT_PUBLIC_VOICE_ENABLED,
    attachments: env.NEXT_PUBLIC_ATTACHMENTS_ENABLED,
  } as const;
}

export function getServerAICapabilities(): AICapabilities {
  const publicEnv = getPublicEnv();

  if (isDemoMode()) {
    return {
      text: {
        enabled: true,
        status: "available",
        provider: "demo",
        model: "demo",
      },
      vision: availabilityResult(
        publicEnv.NEXT_PUBLIC_VISION_ENABLED,
        "openai",
        undefined,
        publicEnv.NEXT_PUBLIC_VISION_ENABLED
          ? "Modo demonstracao nao realiza analise real de imagens."
          : undefined,
      ),
      transcription: availabilityResult(
        publicEnv.NEXT_PUBLIC_VOICE_ENABLED,
        "openai",
        undefined,
        publicEnv.NEXT_PUBLIC_VOICE_ENABLED
          ? "Modo demonstracao nao realiza transcricao real de audio."
          : undefined,
      ),
      speech: availabilityResult(
        publicEnv.NEXT_PUBLIC_VOICE_ENABLED,
        "openai",
        undefined,
        publicEnv.NEXT_PUBLIC_VOICE_ENABLED
          ? "Modo demonstracao usa a voz local do navegador."
          : undefined,
      ),
      attachments: availabilityResult(
        publicEnv.NEXT_PUBLIC_ATTACHMENTS_ENABLED,
        "supabase",
        undefined,
        publicEnv.NEXT_PUBLIC_ATTACHMENTS_ENABLED
          ? "Modo demonstracao nao persiste anexos reais."
          : undefined,
      ),
    };
  }

  const env = getServerEnv();
  const models = getAIModelConfig();
  const openAIKeyMissing = !env.OPENAI_API_KEY;

  return {
    text: env.AI_ENGINE_OLLAMA_ENABLED && env.OLLAMA_MODEL && env.OLLAMA_BASE_URL
      ? {
          enabled: true,
          status: "available",
          provider: "ollama",
          model: env.OLLAMA_MODEL,
        }
      : {
          enabled: true,
          status: "misconfigured",
          provider: "ollama",
          model: env.OLLAMA_MODEL,
          reason: "Runtime textual Ollama incompleto.",
        },
    vision: availabilityResult(
      env.NEXT_PUBLIC_VISION_ENABLED,
      "openai",
      models.vision,
      openAIKeyMissing
        ? "OPENAI_API_KEY ausente."
        : !models.vision
          ? "OPENAI_VISION_MODEL ausente."
          : undefined,
    ),
    transcription: availabilityResult(
      env.NEXT_PUBLIC_VOICE_ENABLED,
      "openai",
      models.transcription,
      openAIKeyMissing
        ? "OPENAI_API_KEY ausente."
        : !models.transcription
          ? "OPENAI_TRANSCRIPTION_MODEL ausente."
          : undefined,
    ),
    speech: availabilityResult(
      env.NEXT_PUBLIC_VOICE_ENABLED,
      "openai",
      models.speech,
      openAIKeyMissing
        ? "OPENAI_API_KEY ausente."
        : !models.speech
          ? "OPENAI_TTS_MODEL ausente."
          : !models.voice
            ? "OPENAI_TTS_VOICE ausente."
            : undefined,
      models.voice,
    ),
    attachments: availabilityResult(
      env.NEXT_PUBLIC_ATTACHMENTS_ENABLED,
      "supabase",
      undefined,
      undefined,
    ),
  };
}
