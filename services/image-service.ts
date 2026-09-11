import type { ImageAspectRatioPreset } from "@/lib/ai/image/aspect-ratios";

export interface ImageReferenceDraft {
  id: string;
  file: File;
  previewUrl: string;
}

export interface GeneratedImageResult {
  dataUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export type ImageGenerationErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "capacity_unavailable"
  | "generation_unavailable"
  | "unknown";

export class ImageGenerationError extends Error {
  constructor(readonly code: ImageGenerationErrorCode) {
    super(code);
    this.name = "ImageGenerationError";
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageGenerationError("invalid_request"));
    reader.readAsDataURL(file);
  });
}

export async function generateImage(
  input: {
    prompt: string;
    aspectRatio: ImageAspectRatioPreset;
    references: ImageReferenceDraft[];
  },
  signal?: AbortSignal,
): Promise<GeneratedImageResult> {
  const references = await Promise.all(
    input.references.map(async ({ file }) => ({
      mimeType: file.type,
      sizeBytes: file.size,
      dataUrl: await readFileAsDataUrl(file),
    })),
  );

  const response = await fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      references,
    }),
    signal,
  });
  const body = (await response.json().catch(() => null)) as
    | (GeneratedImageResult & {
        success?: boolean;
        errorCode?: ImageGenerationErrorCode;
      })
    | null;

  if (!response.ok || !body?.success || !body.dataUrl || !body.mimeType) {
    throw new ImageGenerationError(body?.errorCode ?? "unknown");
  }

  return {
    dataUrl: body.dataUrl,
    mimeType: body.mimeType,
    width: body.width,
    height: body.height,
  };
}

export function imageGenerationErrorMessage(code: ImageGenerationErrorCode) {
  if (code === "capacity_unavailable") {
    return "A criação de imagens está muito concorrida agora. Tente novamente em alguns instantes.";
  }
  if (code === "authentication_required") {
    return "Sua sessão expirou. Entre novamente para criar a imagem.";
  }
  if (code === "invalid_request") {
    return "Revise a descrição e as imagens de referência antes de tentar novamente.";
  }
  return "Não foi possível criar a imagem agora. Tente novamente mais tarde.";
}
