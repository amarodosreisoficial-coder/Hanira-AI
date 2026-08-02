"use client";

import { useState } from "react";
import Image from "next/image";
import {
  FileAudio,
  FileText,
  ImageOff,
  Trash2,
} from "lucide-react";
import { ImageLightbox } from "@/components/media/image-lightbox";
import { useChatStore } from "@/lib/stores/chat-store";
import type { Attachment } from "@/types/media";

export function MessageAttachments({
  attachments,
  messageId,
  removable = false,
}: {
  attachments: Attachment[];
  messageId: string;
  removable?: boolean;
}) {
  const [selected, setSelected] = useState<Attachment | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const removeFromStore = useChatStore((state) => state.removeAttachment);
  if (!attachments.length) return null;

  async function remove(attachment: Attachment) {
    if (!window.confirm(`Excluir ${attachment.originalName}?`)) return;
    const response = await fetch(`/api/attachments/${attachment.id}`, {
      method: "DELETE",
    });
    if (response.ok) removeFromStore(messageId, attachment.id);
  }

  return (
    <>
      <div className="mb-2 grid max-w-md grid-cols-2 gap-2">
        {attachments.map((attachment) =>
          attachment.type === "image" ? (
            <div
              key={attachment.id}
              className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-black/20"
            >
              <button
                onClick={() => setSelected(attachment)}
                className="relative h-full w-full"
                aria-label={`Ampliar ${attachment.originalName}`}
              >
                {failed.includes(attachment.id) ? (
                  <span className="grid h-full place-items-center text-zinc-600">
                    <ImageOff className="size-5" />
                  </span>
                ) : (
                  <Image
                    src={attachment.url}
                    alt={attachment.originalName}
                    fill
                    unoptimized
                    onError={() => setFailed((value) => [...value, attachment.id])}
                    className="object-cover"
                  />
                )}
              </button>
              {removable && (
                <button
                  onClick={() => void remove(attachment)}
                  className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/75 text-zinc-300 hover:text-rose-300"
                  aria-label={`Excluir ${attachment.originalName}`}
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          ) : attachment.type === "audio" ? (
            <div key={attachment.id} className="col-span-2 flex items-center gap-2">
              <FileAudio className="size-4 shrink-0 text-violet-300" />
              <audio
                controls
                preload="metadata"
                src={attachment.url}
                className="h-10 min-w-0 flex-1"
                aria-label={`Audio ${attachment.originalName}`}
              />
              {removable && (
                <button
                  onClick={() => void remove(attachment)}
                  className="grid size-8 place-items-center rounded-lg text-zinc-600 hover:text-rose-300"
                  aria-label={`Excluir ${attachment.originalName}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div
              key={attachment.id}
              className="col-span-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3"
            >
              <FileText className="size-4 shrink-0 text-amber-300" />
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1"
              >
                <p className="truncate text-sm text-zinc-200">{attachment.originalName}</p>
                <p className="text-[11px] text-zinc-500">{attachment.mimeType}</p>
              </a>
              {removable && (
                <button
                  onClick={() => void remove(attachment)}
                  className="grid size-8 place-items-center rounded-lg text-zinc-600 hover:text-rose-300"
                  aria-label={`Excluir ${attachment.originalName}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ),
        )}
      </div>
      <ImageLightbox attachment={selected} onClose={() => setSelected(null)} />
    </>
  );
}
