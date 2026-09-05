"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { HaniraMark } from "@/components/brand/hanira-mark";
import { IconButton } from "@/components/ui/icon-button";
import { useChatStore } from "@/lib/stores/chat-store";
import { cn } from "@/lib/utils";

export function Sidebar({ userName }: { userName: string }) {
  const [search, setSearch] = useState("");
  const store = useChatStore();
  const conversations = store.conversations.filter((conversation) =>
    conversation.title
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );

  return (
    <>
      {store.sidebarOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-background/75 backdrop-blur-sm lg:hidden"
          onClick={() => store.setSidebarOpen(false)}
        />
      )}
      <aside
        id="hanira-sidebar"
        aria-label="Navegação e conversas"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[18rem] shrink-0 flex-col border-r border-border bg-sidebar/95 shadow-2xl shadow-black/20 backdrop-blur-xl transition-[width,transform] duration-300 lg:static lg:translate-x-0 lg:shadow-none",
          store.sidebarOpen
            ? "visible translate-x-0"
            : "invisible -translate-x-full lg:visible",
          store.sidebarCollapsed && "lg:w-[4.75rem]",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <Link
            href="/"
            aria-label="Página inicial da Hanira"
            className={cn("min-w-0", store.sidebarCollapsed && "lg:hidden")}
          >
            <HaniraMark />
          </Link>
          {store.sidebarCollapsed && (
            <Link href="/" aria-label="Página inicial da Hanira" className="hidden lg:block">
              <HaniraMark compact />
            </Link>
          )}
          <IconButton
            label="Fechar menu"
            onClick={() => store.setSidebarOpen(false)}
            className="lg:hidden"
          >
            <X className="size-4" />
          </IconButton>
          <IconButton
            label="Recolher barra lateral"
            onClick={() => store.setSidebarCollapsed(true)}
            className={cn("hidden lg:inline-grid", store.sidebarCollapsed && "lg:hidden")}
          >
            <PanelLeftClose className="size-4" />
          </IconButton>
        </div>

        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={() => void store.newConversation()}
            title="Nova conversa"
            className={cn(
              "flex h-11 w-full items-center gap-3 rounded-xl border border-border bg-card/60 px-3.5 text-sm font-medium text-foreground transition hover:border-primary/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              store.sidebarCollapsed && "lg:justify-center lg:px-0",
            )}
          >
            <Plus className="size-4 shrink-0 text-primary" />
            <span className={cn(store.sidebarCollapsed && "lg:hidden")}>Nova conversa</span>
          </button>

          <label
            className={cn(
              "mt-2 flex h-10 items-center gap-3 rounded-xl px-3.5 text-muted-foreground transition focus-within:bg-accent focus-within:ring-2 focus-within:ring-ring",
              store.sidebarCollapsed && "lg:hidden",
            )}
          >
            <Search className="size-4" />
            <span className="sr-only">Buscar conversas</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar conversas"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/65"
            />
          </label>
        </div>

        <div className="mt-5 flex-1 overflow-y-auto px-3">
          <p className={cn("mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70", store.sidebarCollapsed && "lg:hidden")}>
            Recentes
          </p>
          <div className="space-y-1">
            {conversations.length === 0 && (
              <p className={cn("px-3 py-4 text-xs text-muted-foreground", store.sidebarCollapsed && "lg:hidden")}>
                Nenhuma conversa encontrada.
              </p>
            )}
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group flex min-h-10 items-center rounded-xl px-3 text-sm transition",
                  conversation.id === store.activeId
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                  store.sidebarCollapsed && "lg:justify-center lg:px-0",
                )}
              >
                <button
                  type="button"
                  title={conversation.title}
                  onClick={() => void store.selectConversation(conversation.id)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    store.sidebarCollapsed && "lg:flex-none lg:justify-center",
                  )}
                >
                  <MessageSquare className="size-3.5 shrink-0 opacity-70" />
                  <span className={cn("truncate", store.sidebarCollapsed && "lg:hidden")}>{conversation.title}</span>
                </button>
                <div className={cn("hidden items-center group-focus-within:flex group-hover:flex", store.sidebarCollapsed && "lg:hidden")}>
                  <IconButton
                    label="Renomear conversa"
                    className="size-7 rounded-lg"
                    onClick={() => {
                      const title = window.prompt("Novo título", conversation.title);
                      if (title?.trim()) void store.renameConversation(conversation.id, title.trim());
                    }}
                  >
                    <Pencil className="size-3" />
                  </IconButton>
                  <IconButton
                    label="Arquivar conversa"
                    className="size-7 rounded-lg"
                    onClick={() => void store.archiveConversation(conversation.id)}
                  >
                    <Archive className="size-3" />
                  </IconButton>
                  <IconButton
                    label="Excluir conversa"
                    variant="danger"
                    className="size-7 rounded-lg"
                    onClick={() => {
                      if (window.confirm("Excluir esta conversa?")) {
                        void store.deleteConversation(conversation.id);
                      }
                    }}
                  >
                    <Trash2 className="size-3" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/settings/memory"
            title="Memória Hanira"
            className={cn(
              "mt-7 flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3 transition hover:border-border hover:bg-accent",
              store.sidebarCollapsed && "lg:justify-center lg:p-2.5",
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-muted-foreground">
              <Sparkles className="size-3.5" />
            </span>
            <div className={cn("min-w-0", store.sidebarCollapsed && "lg:hidden")}>
              <p className="text-xs text-foreground">Memória Hanira</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Gerenciar lembranças</p>
            </div>
          </Link>
        </div>

        <div className="border-t border-border p-3">
          <Link
            href="/settings"
            title="Configurações"
            className={cn(
              "flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground",
              store.sidebarCollapsed && "lg:justify-center",
            )}
          >
            <Settings className="size-4 shrink-0" />
            <span className={cn(store.sidebarCollapsed && "lg:hidden")}>Configurações</span>
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Sair"
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground",
                store.sidebarCollapsed && "lg:justify-center",
              )}
            >
              <LogOut className="size-4 shrink-0" />
              <span className={cn(store.sidebarCollapsed && "lg:hidden")}>Sair</span>
            </button>
          </form>
          <div className={cn("mt-2 flex items-center gap-3 rounded-xl px-3 py-2", store.sidebarCollapsed && "lg:justify-center lg:px-0")}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-accent text-xs font-semibold text-foreground">
              {userName.charAt(0).toUpperCase()}
            </span>
            <div className={cn("min-w-0", store.sidebarCollapsed && "lg:hidden")}>
              <p className="truncate text-xs text-foreground">{userName}</p>
              <p className="text-[10px] text-muted-foreground">Conta Hanira</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
