export const MAX_IMAGES_PER_MESSAGE = 4;
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_DOCUMENTS_PER_MESSAGE = 2;
export const MAX_RECORDING_SECONDS = 180;
export const MAX_DOCUMENT_CONTEXT_CHARACTERS = 12_000;

function publicNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const mediaConfig = {
  maxImageSizeBytes:
    publicNumber(process.env.NEXT_PUBLIC_MAX_IMAGE_SIZE_MB, 10) * 1024 * 1024,
  maxAudioSizeBytes:
    publicNumber(process.env.NEXT_PUBLIC_MAX_AUDIO_SIZE_MB, 25) * 1024 * 1024,
  maxDocumentSizeBytes:
    publicNumber(process.env.NEXT_PUBLIC_MAX_DOCUMENT_SIZE_MB, 5) * 1024 * 1024,
  attachmentsEnabled: process.env.NEXT_PUBLIC_ATTACHMENTS_ENABLED === "true",
  voiceEnabled: process.env.NEXT_PUBLIC_VOICE_ENABLED === "true",
  visionEnabled: process.env.NEXT_PUBLIC_VISION_ENABLED === "true",
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

export const ACCEPTED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
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
