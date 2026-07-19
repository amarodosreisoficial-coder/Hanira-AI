"use client";

import { useState } from "react";
import { Camera, Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrivacyDialog({
  open,
  kind,
  onAccept,
  onClose,
}: {
  open: boolean;
  kind: "camera" | "microphone";
  onAccept: (dismiss: boolean) => void;
  onClose: () => void;
}) {
  const [dismiss, setDismiss] = useState(false);
  if (!open) return null;
  const Icon = kind === "camera" ? Camera : Mic;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/75 px-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-privacy-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#100d12] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <span className="grid size-11 place-items-center rounded-2xl bg-violet-500/10 text-violet-300">
            <Icon className="size-5" />
          </span>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-600 hover:text-white"
            aria-label="Fechar aviso"
          >
            <X className="size-4" />
          </button>
        </div>
        <h2 id="media-privacy-title" className="mt-5 text-xl font-medium">
          Sua privacidade vem primeiro
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          A Hanira só acessará sua câmera ou microfone quando você permitir. O
          conteúdo enviado poderá ser processado para responder à sua
          solicitação.
        </p>
        <label className="mt-5 flex items-center gap-3 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={dismiss}
            onChange={(event) => setDismiss(event.target.checked)}
            className="size-4 accent-violet-500"
          />
          Não mostrar novamente
        </label>
        <div className="mt-7 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="h-11 rounded-xl px-4 text-sm text-zinc-500"
          >
            Agora não
          </button>
          <Button onClick={() => onAccept(dismiss)}>Continuar</Button>
        </div>
      </div>
    </div>
  );
}
