export const MAX_IMAGES_PER_MESSAGE = 4;
export const MAX_RECORDING_SECONDS = 180;

function publicNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const mediaConfig = {
  maxImageSizeBytes:
    publicNumber(process.env.NEXT_PUBLIC_MAX_IMAGE_SIZE_MB, 10) * 1024 * 1024,
  maxAudioSizeBytes:
    publicNumber(process.env.NEXT_PUBLIC_MAX_AUDIO_SIZE_MB, 25) * 1024 * 1024,
  voiceEnabled: process.env.NEXT_PUBLIC_VOICE_ENABLED !== "false",
  visionEnabled: process.env.NEXT_PUBLIC_VISION_ENABLED !== "false",
} as const;

export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const ACCEPTED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
] as const;

export const TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;
