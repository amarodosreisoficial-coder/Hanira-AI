"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, RotateCcw } from "lucide-react";
import { HaniraMark } from "@/components/brand/hanira-mark";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMessage } from "@/components/chat/chat-message";
import {
  ChatLoadingState,
  HaniraWelcome,
  NiraThinkingIndicator,
} from "@/components/chat/chat-states";
import { Sidebar } from "@/components/chat/sidebar";
import { IconButton } from "@/components/ui/icon-button";
import { useChatStore } from "@/lib/stores/chat-store";
import { niraRuntimeBadge } from "@/lib/chat/runtime-state";
import { cn } from "@/lib/utils";
import { DEFAULT_USER_SETTINGS } from "@/lib/settings/defaults";
import type { UserSettings } from "@/types/settings";

export function ChatInterface({ userName }: { userName: string }) {
  const store = useChatStore();
  const conversation = store.activeConversation();
  const messagesEnd = useRef<HTMLDivElement>(null);
  const shouldFollowStream = useRef(true);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);

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
        {/* HANIRA NEON (18.3.6) — header textual pesado removido (rejeitado na
            revisão). Somente o símbolo Hanira (link → /) + controles mínimos.
            Sem border-bottom, sem altura desperdiçada. */}
        <header className="flex h-12 shrink-0 items-center justify-between bg-transparent px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-1">
            <IconButton
              label="Abrir menu"
              onClick={() => store.setSidebarOpen(true)}
              className="rounded-full lg:hidden"
              aria-controls="hanira-sidebar"
              aria-expanded={store.sidebarOpen}
            >
              <Menu className="size-5" />
            </IconButton>
            <Link
              href="/"
              aria-label="Hanira — início"
              title="Hanira — início"
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HaniraMark
                compact
                className={cn(
                  "gap-0 [&>span:last-child]:hidden",
                  store.sidebarCollapsed ? "lg:hidden" : ""
                )}
              />
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {(() => {
              const badge = niraRuntimeBadge(store.runtimeState);
              if (!badge.label) return null;
              return (
                <div
                  className="hidden items-center gap-2 px-1 sm:flex"
                  aria-label={`Estado do runtime: ${badge.label}`}
                  data-runtime-state={badge.state}
                >
                  <span className={cn("size-1.5 rounded-full", badge.dotClassName)} />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {badge.label}
                  </span>
                </div>
              );
            })()}
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
                        // Pacote 18.4: override temporário de idioma da conversa
                        // (TTS lê neste idioma; ausente = idioma primário do perfil).
                        conversationLanguage={
                          store.activeId
                            ? (store.conversationLanguages[store.activeId] ??
                              null)
                            : null
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

    </main>
  );
}
