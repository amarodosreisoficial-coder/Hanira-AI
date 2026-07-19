import { z } from "zod";
import {
  ACCEPTED_AUDIO_MIME_TYPES,
  ACCEPTED_IMAGE_MIME_TYPES,
  mediaConfig,
  TTS_VOICES,
} from "@/lib/media/config";

const extensionByMime: Record<string, readonly string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "audio/webm": ["webm"],
  "audio/ogg": ["ogg", "oga"],
  "audio/wav": ["wav"],
  "audio/mpeg": ["mp3", "mpeg", "mpga"],
  "audio/mp4": ["m4a", "mp4"],
  "audio/x-m4a": ["m4a"],
};

export const speechRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Não há texto para reproduzir.")
    .max(4_096, "A resposta é muito longa para leitura em voz alta."),
  voice: z.enum(TTS_VOICES).optional(),
  speed: z.number().min(0.5).max(2).default(1),
});

export function extensionForMime(mimeType: string) {
  return extensionByMime[mimeType]?.[0] ?? null;
}

function fileExtension(name: string) {
  const value = name.split(".").pop()?.toLowerCase();
  return value && value !== name.toLowerCase() ? value : "";
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isValidPng(bytes: Uint8Array) {
  if (
    bytes.length < 45 ||
    !startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let hasHeader = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const chunkEnd = offset + 12 + length;
    if (length > bytes.length || chunkEnd > bytes.length) return false;
    const typeBytes = bytes.slice(offset + 4, offset + 8);
    const type = new TextDecoder().decode(typeBytes);
    const data = bytes.slice(offset + 8, offset + 8 + length);
    const expectedCrc = view.getUint32(offset + 8 + length);
    const crcInput = new Uint8Array(typeBytes.length + data.length);
    crcInput.set(typeBytes);
    crcInput.set(data, typeBytes.length);
    if (crc32(crcInput) !== expectedCrc) return false;
    if (type === "IHDR") {
      if (hasHeader || offset !== 8 || length !== 13) return false;
      const width = view.getUint32(offset + 8);
      const height = view.getUint32(offset + 12);
      if (!width || !height) return false;
      hasHeader = true;
    }
    if (type === "IEND") {
      return hasHeader && length === 0 && chunkEnd === bytes.length;
    }
    offset = chunkEnd;
  }
  return false;
}

function isValidJpeg(bytes: Uint8Array) {
  if (
    bytes.length < 16 ||
    !startsWith(bytes, [0xff, 0xd8, 0xff]) ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    return false;
  }
  let offset = 2;
  let dimensionsFound = false;
  while (offset + 4 < bytes.length - 2) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0x01) continue;
    if (marker === 0xda) return dimensionsFound;
    if (marker === 0xd9) return dimensionsFound;
    if (offset + 2 > bytes.length) return false;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return false;
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb,
        0xcd, 0xce, 0xcf,
      ].includes(marker)
    ) {
      if (length < 7) return false;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      dimensionsFound = width > 0 && height > 0;
    }
    offset += length;
  }
  return dimensionsFound;
}

function hasValidImageSignature(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "image/png") {
    return isValidPng(bytes);
  }
  if (mimeType === "image/jpeg") {
    return isValidJpeg(bytes);
  }
  if (mimeType === "image/webp") {
    const declaredSize =
      bytes.length >= 8
        ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
            4,
            true,
          )
        : 0;
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP" &&
      declaredSize + 8 === bytes.length &&
      ["VP8 ", "VP8L", "VP8X"].includes(
        new TextDecoder().decode(bytes.slice(12, 16)),
      )
    );
  }
  return false;
}

function hasValidAudioSignature(mimeType: string, bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes.slice(0, 12));
  if (mimeType === "audio/webm") return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  if (mimeType === "audio/ogg") return text.startsWith("OggS");
  if (mimeType === "audio/wav") {
    return text.startsWith("RIFF") && text.slice(8, 12) === "WAVE";
  }
  if (mimeType === "audio/mpeg") {
    return text.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a") {
    return text.slice(4, 8) === "ftyp";
  }
  return false;
}

export async function validateMediaFile(
  file: File,
  type: "image" | "audio",
) {
  if (!file.size) throw new Error("O arquivo está vazio.");
  const accepted =
    type === "image" ? ACCEPTED_IMAGE_MIME_TYPES : ACCEPTED_AUDIO_MIME_TYPES;
  const mimeType = file.type.split(";")[0].toLowerCase();
  if (!(accepted as readonly string[]).includes(mimeType)) {
    throw new Error(
      type === "image"
        ? "Use uma imagem PNG, JPEG ou WEBP."
        : "Use áudio WEBM, OGG, WAV, MP3 ou M4A.",
    );
  }
  const max =
    type === "image"
      ? mediaConfig.maxImageSizeBytes
      : mediaConfig.maxAudioSizeBytes;
  if (file.size > max) {
    throw new Error(
      `O arquivo excede o limite de ${Math.round(max / 1024 / 1024)} MB.`,
    );
  }
  const extension = fileExtension(file.name);
  if (!extensionByMime[mimeType]?.includes(extension)) {
    throw new Error("A extensão não corresponde ao conteúdo informado.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid =
    type === "image"
      ? hasValidImageSignature(mimeType, bytes)
      : hasValidAudioSignature(mimeType, bytes);
  if (!valid) {
    throw new Error(
      type === "image"
        ? "A imagem está corrompida ou possui conteúdo inválido."
        : "O áudio está corrompido ou possui conteúdo inválido.",
    );
  }
  return { extension, bytes, mimeType };
}
