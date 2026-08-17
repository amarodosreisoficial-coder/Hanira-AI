"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BrainCircuit,
  Copy,
  Lightbulb,
  Menu,
  PenLine,
  RotateCcw,
  Sparkles,
  AudioLines,
} from "lucide-react";
import { HaniraMark } from "@/components/brand/hanira-mark";
import { ChatComposer } from "@/components/chat/chat-composer";
import { Sidebar } from "@/components/chat/sidebar";
import { MessageAttachments } from "@/components/media/message-attachments";
import { PrivacyDialog } from "@/components/media/privacy-dialog";
import { SpeechControls } from "@/components/voice/speech-controls";
import { VoiceConversationModal } from "@/components/voice/voice-conversation-modal";
import { useChatStore } from "@/lib/stores/chat-store";
import { DEFAULT_USER_SETTINGS } from "@/lib/settings/defaults";
import type { UserSettings } from "@/types/settings";

const prompts = [
  {
    icon: Lightbulb,
    title: "Explorar uma ideia",
    prompt: "Ajude-me a transformar uma ideia solta em um plano claro.",
  },
  {
    icon: PenLine,
    title: "Criar algo",
    prompt: "Quero criar algo original. Me ajude a encontrar uma direção.",
  },
  {
    icon: BrainCircuit,
    title: "Pensar com clareza",
    prompt: "Organize meus pensamentos sobre uma decisão importante.",
  },
];

export function ChatInterface({ userName }: { userName: string }) {
  const store = useChatStore();
  const conversation = store.activeConversation();
  const messagesEnd = useRef<HTMLDivElement>(null);
  const shouldFollowStream = useRef(true);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    void store.initialize();
    // Zustand actions are stable and initialization must run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ settings: UserSettings }>;
      })
      .then((data) => setSettings(data.settings))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (shouldFollowStream.current) messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length, store.isThinking]);

  const lastMessage = conversation?.messages.at(-1);
  const showThinking =
    store.isThinking &&
    lastMessage?.role === "assistant" &&
    lastMessage.content.length === 0;

  return (
    <main className="flex h-dvh overflow-hidden bg-[#0c0a0d]">
      <Sidebar userName={userName} />
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.055] px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => store.setSidebarOpen(true)}
              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/[0.05] hover:text-white lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="size-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-200">Hanira</span>
                <span className="rounded-md border border-violet-300/10 bg-violet-500/[0.08] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-violet-300">
                  AI
                </span>
              </div>
              <p className="hidden text-[10px] text-zinc-600 sm:block">
                Sua inteligência pessoal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {settings.voiceEnabled && settings.voiceConversationEnabled && (
              <button
                onClick={() => {
                  const dismissed =
                    settings.privacyNoticeDismissed ||
                    window.localStorage.getItem("hanira-media-privacy") ===
                      "dismissed";
                  if (dismissed) setVoiceModeOpen(true);
                  else setPrivacyOpen(true);
                }}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-violet-300/10 bg-violet-500/[0.07] px-3 text-xs text-violet-200"
              >
                <AudioLines className="size-3.5" />
                <span className="hidden sm:inline">Conversa por voz</span>
              </button>
            )}
            <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
              <span className="size-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_8px_rgba(74,222,128,.5)]" />
              Online
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex-1 overflow-y-auto"
            onScroll={(event) => {
              const element = event.currentTarget;
              shouldFollowStream.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
            }}
          >
            {store.status === "loading" && !conversation ? (
              <div className="grid h-full place-items-center text-sm text-zinc-600">
                <div className="flex flex-col items-center gap-4">
                  <HaniraMark compact className="scale-125 animate-pulse" />
                  Carregando suas conversas...
                </div>
              </div>
            ) : !conversation || conversation.messages.length === 0 ? (
              <EmptyChat onPrompt={store.setDraft} />
            ) : (
              <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
                {conversation.messages.map((message, index) => {
                  const previousUser =
                    message.role === "assistant"
                      ? [...conversation.messages.slice(0, index)]
                          .reverse()
                          .find((item) => item.role === "user")
                      : null;
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={message.id}
                      className={`group mb-8 flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {message.role === "assistant" && (
                        <div className="mt-0.5 shrink-0">
                          <HaniraMark compact />
                        </div>
                      )}
                      <div className="max-w-[88%]">
                        <MessageAttachments
                          attachments={message.attachments ?? []}
                          messageId={message.id}
                          removable={message.role === "user"}
                        />
                        <div
                          className={
                            message.role === "user"
                              ? "rounded-2xl rounded-br-md bg-white/[0.075] px-4 py-3 text-[15px] leading-6 text-zinc-200"
                              : "whitespace-pre-wrap pt-1.5 text-[15px] leading-7 text-zinc-300"
                          }
                        >
                          {message.content ||
                            (message.failed
                              ? "A resposta foi interrompida."
                              : "")}
                          {message.pending && message.content && (
                            <>
                              <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-violet-300 align-middle" />
                              <span className="ml-2 text-xs text-zinc-600">Gerando resposta...</span>
                            </>
                          )}
                        </div>
                        {message.role === "assistant" &&
                          !message.pending && (
                            <div className="mt-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                              <button
                                disabled={!message.content}
                                onClick={() =>
                                  void navigator.clipboard.writeText(
                                    message.content,
                                  )
                                }
                                className="rounded-lg p-2 text-zinc-700 hover:bg-white/[0.04] hover:text-zinc-400 disabled:hidden"
                                aria-label="Copiar resposta"
                              >
                                <Copy className="size-3.5" />
                              </button>
                              <SpeechControls
                                text={message.content}
                                pending={message.pending}
                                autoSpeak={
                                  settings.autoSpeak &&
                                  settings.audioAutoplay &&
                                  store.isThinking &&
                                  index === conversation.messages.length - 1
                                }
                                voice={settings.ttsVoice}
                                speed={settings.speechRate}
                              />
                              {message.failed && previousUser && (
                                <button
                                  onClick={() =>
                                    window.dispatchEvent(
                                      new CustomEvent("hanira:retry", {
                                        detail: {
                                          content: previousUser.content,
                                          assistantId: message.id,
                                          attachments:
                                            previousUser.attachments ?? [],
                                        },
                                      }),
                                    )
                                  }
                                  className="rounded-lg p-2 text-zinc-700 hover:text-violet-300"
                                  aria-label="Tentar novamente"
                                >
                                  <RotateCcw className="size-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                      </div>
                    </motion.div>
                  );
                })}
                {showThinking && (
                  <div className="mb-8 flex items-center gap-3">
                    <HaniraMark compact />
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                      <Sparkles className="size-3.5 animate-pulse text-violet-400" />
                      <span className="shimmer">Preparando o motor local...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEnd} />
              </div>
            )}
          </div>
          <ChatComposer settings={settings} />
        </div>
      </section>
      <VoiceConversationModal
        open={voiceModeOpen}
        settings={settings}
        onClose={() => setVoiceModeOpen(false)}
      />
      <PrivacyDialog
        open={privacyOpen}
        kind="microphone"
        onClose={() => setPrivacyOpen(false)}
        onAccept={(dismiss) => {
          setPrivacyOpen(false);
          if (dismiss) {
            window.localStorage.setItem("hanira-media-privacy", "dismissed");
            setSettings((value) => ({
              ...value,
              privacyNoticeDismissed: true,
            }));
            void fetch("/api/settings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ privacyNoticeDismissed: true }),
            });
          }
          setVoiceModeOpen(true);
        }}
      />
    </main>
  );
}

function EmptyChat({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-5 py-14 text-center">
      <HaniraMark compact />
      <h1 className="mt-7 text-3xl font-medium tracking-[-0.045em] text-zinc-100 sm:text-4xl">
        O que vamos descobrir hoje?
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
        Pode ser uma ideia, uma dúvida ou algo que ainda não tem nome.
      </p>
      <div className="mt-10 grid w-full gap-2.5 sm:grid-cols-3">
        {prompts.map(({ icon: Icon, title, prompt }) => (
          <button
            key={title}
            onClick={() => onPrompt(prompt)}
            className="group rounded-2xl border border-white/[0.075] bg-white/[0.025] p-4 text-left transition hover:border-violet-300/20"
          >
            <Icon className="mb-5 size-4 text-zinc-600 group-hover:text-violet-300" />
            <span className="flex items-center justify-between text-xs text-zinc-400">
              {title}
              <ArrowUpRight className="size-3 text-zinc-700" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
