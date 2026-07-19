"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import type { Attachment } from "@/types/media";

export function ImageLightbox({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!attachment) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [attachment, onClose]);
  if (!attachment) return null;

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Visualização de ${attachment.originalName}`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <button
        ref={closeRef}
        onClick={onClose}
        className="absolute right-5 top-5 grid size-11 place-items-center rounded-full bg-white/10 text-white"
        aria-label="Fechar imagem"
      >
        <X className="size-5" />
      </button>
      <div className="relative h-[82vh] w-full max-w-5xl">
        <Image
          src={attachment.url}
          alt={attachment.originalName}
          fill
          unoptimized
          className="object-contain"
        />
      </div>
    </div>
  );
}
