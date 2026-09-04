"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, RotateCcw, TriangleAlert } from "lucide-react";
import { MessageContent } from "@/components/chat/message-content";
import { NiraPresence } from "@/components/chat/nira-presence";
import { MessageAttachments } from "@/components/media/message-attachments";
import { IconButton } from "@/components/ui/icon-button";
import { SpeechControls } from "@/components/voice/speech-controls";
import { chatIssueForCode } from "@/lib/chat/chat-errors";
import type { ChatMessage as ChatMessageData } from "@/types/chat";
import type { UserSettings } from "@/types/settings";

export function ChatMessage({
  message,
  previousUser,
  settings,
  autoSpeak,
}: {
  message: ChatMessageData;
  previousUser?: ChatMessageData;
  settings: UserSettings;
  autoSpeak: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const reduceMotion = useReducedMotion();
  const issue = message.failed
    ? chatIssueForCode(message.errorCode ?? "unknown")
    : null;

  if (message.role === "user") {
    return (
      <motion.article
        initial={reduceMotion ? false : { opacity: 0, y: 7 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex justify-end"
        aria-label="Sua mensagem"
      >
        <div className="max-w-[88%] sm:max-w-[78%]">
          <MessageAttachments
            attachments={message.attachments ?? []}
            messageId={message.id}
            removable
          />
          {message.content && (
            <div className="rounded-[1.35rem] rounded-br-md border border-border bg-user-message px-4 py-3 text-[15px] leading-6 text-foreground shadow-sm">
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          )}
        </div>
      </motion.article>
    );
  }

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      className="group mb-9 grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3"
      aria-label="Resposta da Nira"
    >
      <NiraPresence status={message.pending ? "responding" : issue ? "unavailable" : "idle"} />
      <div className="min-w-0 pt-1">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Nira</span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Inteligência Hanira</span>
        </div>
        <MessageAttachments
          attachments={message.attachments ?? []}
          messageId={message.id}
        />

        {message.content && <MessageContent content={message.content} />}

        {message.pending && message.content && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <span className="inline-block h-4 w-0.5 animate-pulse rounded-full bg-primary" />
            Respondendo...
          </div>
        )}

        {issue && (
          <div className="mt-2 max-w-xl rounded-2xl border border-warning/20 bg-warning/5 p-4" role="alert">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="text-sm font-medium text-foreground">{issue.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{issue.message}</p>
                {issue.retryable && previousUser && (
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("hanira:retry", {
                          detail: {
                            content: previousUser.content,
                            assistantId: message.id,
                            attachments: previousUser.attachments ?? [],
                          },
                        }),
                      )
                    }
                    className="mt-3 inline-flex items-center gap-2 rounded-lg text-xs font-medium text-primary transition hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <RotateCcw className="size-3.5" />
                    Tentar novamente
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!message.pending && !issue && (
          <div className="mt-3 flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <IconButton
              label={copied ? "Resposta copiada" : "Copiar resposta"}
              disabled={!message.content}
              onClick={() => {
                void navigator.clipboard.writeText(message.content);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }}
              className="size-8"
            >
              {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            </IconButton>
            <SpeechControls
              text={message.content}
              pending={message.pending}
              autoSpeak={autoSpeak}
              voice={settings.ttsVoice}
              speed={settings.speechRate}
            />
          </div>
        )}
      </div>
    </motion.article>
  );
}
