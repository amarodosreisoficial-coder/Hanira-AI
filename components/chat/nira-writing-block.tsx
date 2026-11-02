"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

export type WritingBlockType =
  | "prompt"
  | "whatsapp"
  | "email"
  | "documento"
  | "rede-social"
  | "comunicado"
  | "codigo";

interface NiraWritingBlockProps {
  writingType: string;
  title: string;
  /** Conteúdo bruto (sem delimitadores, sem cabeçalho, sem botões). Usado apenas
   * para copiar/compartilhar este bloco. */
  text: string;
  children: React.ReactNode;
}

function writingCategoryLabel(type: string): string {
  const labels: Record<string, string> = {
    prompt: "Prompt",
    whatsapp: "WhatsApp",
    email: "E-mail",
    documento: "Documento",
    "rede-social": "Redes sociais",
    comunicado: "Comunicado",
    codigo: "Código",
  };
  return labels[type] ?? "Texto";
}

/** Copia somente o texto informado para a área de transferência. */
export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/**
 * Compartilha o conteúdo. Quando o navegador suporta, usa navigator.share()
 * (disparo a partir da interação do usuário). Senão, fallback: copia o
 * conteúdo para o usuário colar manualmente.
 */
export async function shareContent(title: string, text: string): Promise<void> {
  if (typeof navigator.share === "function") {
    await navigator.share({ title, text });
    return;
  }
  await navigator.clipboard.writeText(text);
}

export function NiraWritingBlock({
  writingType,
  title,
  text,
  children,
}: NiraWritingBlockProps) {
  const [copied, setCopied] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "ok" | "error">("idle");

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(text);
      setCopied(true);
      setShareState("idle");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setShareState("error");
      window.setTimeout(() => setShareState("idle"), 1500);
    }
  }, [text]);

  const handleShare = useCallback(async () => {
    setShareState("idle");
    try {
      await shareContent(title, text);
      setShareState("ok");
      window.setTimeout(() => setShareState("idle"), 1500);
    } catch {
      setShareState("error");
      window.setTimeout(() => setShareState("idle"), 1500);
    }
  }, [title, text]);

  const category = writingCategoryLabel(writingType);

  return (
    <section
      className="nira-writing-block"
      aria-label={`Bloco de escrita: ${category}`}
    >
      <div className="nira-writing-block__header">
        <span className="nira-writing-block__category" aria-hidden={true}>
          Escrita · {category}
        </span>
        <span className="nira-writing-block__title">{title}</span>
        <div className="nira-writing-block__actions">
          <IconButton
            label={copied ? "Conteúdo do bloco copiado" : "Copiar conteúdo do bloco"}
            variant="soft"
            onClick={handleCopy}
          >
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
          </IconButton>
          <IconButton
            label={
              shareState === "ok"
                ? "Conteúdo compartilhado"
                : shareState === "error"
                ? "Falha ao compartilhar"
                : "Compartilhar conteúdo do bloco"
            }
            variant="soft"
            onClick={handleShare}
            disabled={shareState === "ok"}
          >
            {shareState === "ok" ? (
              <Check className="size-4 text-success" />
            ) : (
              <Share2 className="size-4" />
            )}
          </IconButton>
        </div>
      </div>
      <div className="nira-writing-block__body">{children}</div>
      {shareState === "error" && (
        <p className="nira-writing-block__status">
          Não foi possível copiar ou compartilhar o conteúdo.
        </p>
      )}
    </section>
  );
}
