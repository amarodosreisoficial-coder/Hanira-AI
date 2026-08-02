import { getPublicEnv } from "@/lib/env";

export function getPublicAICapabilities() {
  const env = getPublicEnv();
  return {
    text: true,
    vision: env.NEXT_PUBLIC_VISION_ENABLED,
    transcription: env.NEXT_PUBLIC_VOICE_ENABLED,
    speech: env.NEXT_PUBLIC_VOICE_ENABLED,
    attachments: env.NEXT_PUBLIC_ATTACHMENTS_ENABLED,
  } as const;
}
