"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Menu, PanelLeftOpen, RotateCcw } from "lucide-react";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMessage } from "@/components/chat/chat-message";
import {
  ChatLoadingState,
  HaniraWelcome,
  NiraThinkingIndicator,
} from "@/components/chat/chat-states";
import { Sidebar } from "@/components/chat/sidebar";
import { IconButton } from "@/components/ui/icon-button";
import { PrivacyDialog } from "@/components/media/privacy-dialog";
import { VoiceConversationModal } from "@/components/voice/voice-conversation-modal";
import { useChatStore } from "@/lib/stores/chat-store";
import { DEFAULT_USER_SETTINGS } from "@/lib/settings/defaults";
import type { UserSettings } from "@/types/settings";

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

  const lastMessage = conversation?.messages.at(-1);

  useEffect(() => {
    if (shouldFollowStream.current) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      messagesEnd.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "end",
      });
    }
  }, [conversation?.messages.length, lastMessage?.content, store.isThinking]);

  const showThinking =
    store.isThinking &&
    lastMessage?.role === "assistant" &&
    lastMessage.content.length === 0;

  return (
    <main className="hanira-shell relative flex h-dvh overflow-hidden bg-background text-foreground">
      <div className="hanira-ambient" aria-hidden="true" />
      <Sidebar userName={userName} />

      <section className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-background/80 px-3 backdrop-blur-xl sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <IconButton
              label="Abrir menu"
              onClick={() => store.setSidebarOpen(true)}
              className="lg:hidden"
              aria-controls="hanira-sidebar"
              aria-expanded={store.sidebarOpen}
            >
              <Menu className="size-5" />
            </IconButton>
            {store.sidebarCollapsed && (
              <IconButton
                label="Expandir barra lateral"
                onClick={() => store.setSidebarCollapsed(false)}
                className="hidden lg:inline-grid"
              >
                <PanelLeftOpen className="size-4" />
              </IconButton>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold tracking-tight">Hanira</span>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">
                  Nira Intelligence
                </span>
              </div>
              <p className="hidden text-[10px] text-muted-foreground sm:block">
                Sua conversa com a inteligência da Hanira
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {settings.voiceEnabled && settings.voiceConversationEnabled && (
              <button
                type="button"
                onClick={() => {
                  const dismissed =
                    settings.privacyNoticeDismissed ||
                    window.localStorage.getItem("hanira-media-privacy") === "dismissed";
                  if (dismissed) setVoiceModeOpen(true);
                  else setPrivacyOpen(true);
                }}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/70 px-3 text-xs text-muted-foreground transition hover:border-primary/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AudioLines className="size-3.5 text-primary" />
                <span className="hidden sm:inline">Conversa por voz</span>
              </button>
            )}
            <div
              className="hidden items-center gap-2 rounded-full border border-border bg-card/55 px-3 py-1.5 sm:flex"
              aria-label="Perfil ativo: Nira Local"
            >
              <span className="size-1.5 rounded-full bg-primary" />
              <span className="text-[10px] font-medium text-muted-foreground">Nira Local</span>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="chat-scroll flex-1 overflow-y-auto overscroll-contain"
            onScroll={(event) => {
              const element = event.currentTarget;
              shouldFollowStream.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < 120;
            }}
          >
            {store.status === "loading" && !conversation ? (
              <ChatLoadingState />
            ) : store.status === "error" && !conversation ? (
              <div className="grid h-full place-items-center px-6 text-center">
                <div className="max-w-sm rounded-2xl border border-warning/20 bg-card p-6">
                  <p className="text-sm font-medium">Não foi possível abrir suas conversas</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {store.error ?? "A Hanira encontrou uma instabilidade temporária."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void store.initialize()}
                    className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary"
                  >
                    <RotateCcw className="size-3.5" />
                    Tentar novamente
                  </button>
                </div>
              </div>
            ) : !conversation || conversation.messages.length === 0 ? (
              <HaniraWelcome userName={userName} onPrompt={store.setDraft} />
            ) : (
              <div className="mx-auto w-full max-w-[50rem] px-4 py-8 sm:px-7 sm:py-10">
                <div aria-live="polite">
                  {conversation.messages.map((message, index) => {
                    const previousUser =
                      message.role === "assistant"
                        ? conversation.messages
                            .slice(0, index)
                            .findLast((item) => item.role === "user")
                        : undefined;
                    return (
                      <ChatMessage
                        key={message.id}
                        message={message}
                        previousUser={previousUser}
                        settings={settings}
                        autoSpeak={
                          settings.autoSpeak &&
                          settings.audioAutoplay &&
                          store.isThinking &&
                          index === conversation.messages.length - 1
                        }
                      />
                    );
                  })}
                  {showThinking && <NiraThinkingIndicator />}
                </div>
                <div ref={messagesEnd} className="h-px" />
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
            setSettings((value) => ({ ...value, privacyNoticeDismissed: true }));
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
