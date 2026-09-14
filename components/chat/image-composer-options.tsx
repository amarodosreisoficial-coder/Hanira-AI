"use client";

import Image from "next/image";
import { ImagePlus, Sparkles, X } from "lucide-react";
import {
  IMAGE_ASPECT_RATIO_PRESETS,
  type ImageAspectRatioPreset,
} from "@/lib/ai/image/aspect-ratios";
import type { ImageReferenceDraft } from "@/services/image-service";

export function ImageComposerOptions({
  aspectRatio,
  references,
  busy,
  onExit,
  onRatioChange,
  onPickReferences,
  onRemoveReference,
}: {
  aspectRatio: ImageAspectRatioPreset;
  references: ImageReferenceDraft[];
  busy: boolean;
  onExit: () => void;
  onRatioChange: (ratio: ImageAspectRatioPreset) => void;
  onPickReferences: () => void;
  onRemoveReference: (reference: ImageReferenceDraft) => void;
}) {
  return (
    <div className="px-1 pb-1 pt-0.5" data-composer-mode="image">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 pl-3 pr-1.5 text-xs font-medium text-primary">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Criar imagem
          <button
            type="button"
            onClick={onExit}
            disabled={busy}
            aria-label="Sair do modo imagem"
            className="grid size-6 place-items-center rounded-full transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>

        <label className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-background/30 px-2 text-[11px] text-muted-foreground">
          Proporção
          <select
            aria-label="Proporção da imagem"
            value={aspectRatio}
            disabled={busy}
            onChange={(event) =>
              onRatioChange(event.target.value as ImageAspectRatioPreset)
            }
            className="bg-transparent text-xs font-medium text-foreground outline-none"
          >
            {IMAGE_ASPECT_RATIO_PRESETS.map((ratio) => (
              <option key={ratio} value={ratio} className="bg-background">
                {ratio}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onPickReferences}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <ImagePlus className="size-3.5" aria-hidden="true" />
          Referências{references.length ? ` (${references.length})` : ""}
        </button>
      </div>

      {references.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto" aria-label="Imagens de referência">
          {references.map((reference, index) => (
            <div
              key={reference.id}
              className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-black/20"
            >
              <Image
                src={reference.previewUrl}
                alt={`Referência ${index + 1}: ${reference.file.name}`}
                fill
                unoptimized
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => onRemoveReference(reference)}
                disabled={busy}
                aria-label={`Remover referência ${index + 1}`}
                className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/75 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
