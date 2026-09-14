"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Download,
  ImageOff,
  LoaderCircle,
  Maximize2,
  RotateCcw,
} from "lucide-react";
import { ImageLightbox } from "@/components/media/image-lightbox";
import { IconButton } from "@/components/ui/icon-button";
import type { ImageGenerationState } from "@/types/chat";
import type { Attachment } from "@/types/media";

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

export function GeneratedImageResponse({
  messageId,
  generation,
}: {
  messageId: string;
  generation: ImageGenerationState;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const regenerate = () => {
    window.dispatchEvent(
      new CustomEvent("hanira:regenerate-image", {
        detail: {
          assistantId: messageId,
          prompt: generation.prompt,
          aspectRatio: generation.aspectRatio,
          references: generation.references,
        },
      }),
    );
  };

  if (generation.status === "generating") {
    return (
      <div
        className="grid min-h-52 max-w-xl place-items-center overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-card to-card p-8"
        role="status"
        aria-label="Gerando imagem"
      >
        <div className="text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">Gerando imagem...</p>
          <p className="mt-1 text-xs text-muted-foreground">A Nira está criando sua imagem.</p>
        </div>
      </div>
    );
  }

  if (generation.status === "error" || !generation.result) {
    return (
      <div className="max-w-xl rounded-2xl border border-warning/15 bg-warning/5 p-4" role="alert">
        <div className="flex items-start gap-3">
          <ImageOff className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">A imagem não ficou pronta</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {generation.errorMessage ?? "Tente novamente em alguns instantes."}
            </p>
            <button
              type="button"
              onClick={regenerate}
              className="mt-2.5 inline-flex items-center gap-2 rounded-lg text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { result } = generation;
  const attachment: Attachment = {
    id: `generated-${messageId}`,
    type: "image",
    originalName: "Imagem criada pela Nira",
    mimeType: result.mimeType,
    sizeBytes: 0,
    url: result.dataUrl,
  };

  const download = () => {
    const anchor = document.createElement("a");
    anchor.href = result.dataUrl;
    anchor.download = `nira-image-${new Date().toISOString().replace(/[:.]/g, "-")}.${extensionForMimeType(result.mimeType)}`;
    anchor.click();
  };

  return (
    <>
      <figure className="max-w-xl overflow-hidden rounded-2xl border border-border/80 bg-card/55 shadow-lg shadow-black/10">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          disabled={imageFailed}
          className="group/image relative block w-full overflow-hidden bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label="Ampliar imagem criada pela Nira"
        >
          {imageFailed ? (
            <span className="grid min-h-52 place-items-center text-muted-foreground">
              <span className="text-center text-xs">
                <ImageOff className="mx-auto mb-2 size-5" aria-hidden="true" />
                Não foi possível exibir a imagem.
              </span>
            </span>
          ) : (
            <Image
              src={result.dataUrl}
              alt="Imagem criada pela Nira"
              width={result.width ?? 512}
              height={result.height ?? 512}
              unoptimized
              onError={() => setImageFailed(true)}
              className="h-auto max-h-[65vh] w-full object-contain transition duration-300 group-hover/image:scale-[1.01]"
            />
          )}
          {!imageFailed && (
            <span className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/60 text-white opacity-100 backdrop-blur transition sm:opacity-0 sm:group-hover/image:opacity-100">
              <Maximize2 className="size-4" aria-hidden="true" />
            </span>
          )}
        </button>
        <figcaption className="flex items-center justify-between gap-3 border-t border-border/70 px-3 py-2.5">
          <span className="truncate text-[11px] text-muted-foreground">
            Imagem criada pela Nira · {generation.aspectRatio}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <IconButton label="Baixar imagem" onClick={download} className="size-8">
              <Download className="size-3.5" />
            </IconButton>
            <IconButton label="Regenerar imagem" onClick={regenerate} className="size-8">
              <RotateCcw className="size-3.5" />
            </IconButton>
          </span>
        </figcaption>
      </figure>
      <ImageLightbox
        attachment={lightboxOpen ? attachment : null}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
