import { ACCEPTED_IMAGE_MIME_TYPES, mediaConfig } from "@/lib/media/config";
import { resolveImageAspectRatio } from "@/lib/ai/image/aspect-ratios";

export const IMAGE_PROMPT_MAX_LENGTH = 2_000;
export const IMAGE_REFERENCE_MAX_COUNT = 4;
export interface ImageReferencePayload { readonly mimeType: string; readonly dataUrl: string; readonly sizeBytes: number }
export interface ValidImageRequest { readonly prompt: string; readonly aspectRatio: ReturnType<typeof resolveImageAspectRatio>; readonly references: readonly ImageReferencePayload[] }
export function validateImageRequest(value: unknown): ValidImageRequest {
  if (!value || typeof value !== "object") throw new Error("invalid_request");
  const input = value as { prompt?: unknown; aspectRatio?: unknown; references?: unknown };
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt || prompt.length > IMAGE_PROMPT_MAX_LENGTH) throw new Error("invalid_request");
  const references = Array.isArray(input.references) ? input.references : [];
  if (references.length > IMAGE_REFERENCE_MAX_COUNT) throw new Error("invalid_request");
  const parsed = references.map((item) => {
    if (!item || typeof item !== "object") throw new Error("invalid_request");
    const ref = item as Partial<ImageReferencePayload>;
    const sizeBytes = ref.sizeBytes;
    if (!ACCEPTED_IMAGE_MIME_TYPES.includes(ref.mimeType as (typeof ACCEPTED_IMAGE_MIME_TYPES)[number]) || typeof ref.dataUrl !== "string" || !ref.dataUrl.startsWith(`data:${ref.mimeType};base64,`) || typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > mediaConfig.maxImageSizeBytes) throw new Error("invalid_request");
    return { mimeType: ref.mimeType!, dataUrl: ref.dataUrl, sizeBytes };
  });
  return { prompt, aspectRatio: resolveImageAspectRatio(input.aspectRatio), references: parsed };
}
