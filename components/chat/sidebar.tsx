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
import { useChatStore } from "@/lib/stores/chat-store";
import { cn } from "@/lib/utils";

export function Sidebar({ userName }: { userName: string }) {
  const [search, setSearch] = useState("");
  const store = useChatStore();
  const conversations = store.conversations.filter((conversation) =>
    conversation.title.toLocaleLowerCase("pt-BR").includes(
      search.toLocaleLowerCase("pt-BR"),
    ),
  );

  return (
    <>
      {store.sidebarOpen && (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-black/65 backdrop-blur-sm lg:hidden"
          onClick={() => store.setSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[278px] flex-col border-r border-white/[0.065] bg-[#0a090b] transition-transform duration-300 lg:static lg:translate-x-0",
          store.sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <Link href="/">
            <HaniraMark />
          </Link>
          <button
            onClick={() => store.setSidebarOpen(false)}
            className="rounded-lg p-2 text-zinc-600 hover:bg-white/[0.05]"
            aria-label="Recolher menu"
          >
            <X className="size-4 lg:hidden" />
            <PanelLeftClose className="hidden size-4 lg:block" />
          </button>
        </div>
        <div className="px-3 pt-2">
          <button
            onClick={() => void store.newConversation()}
            className="flex h-11 w-full items-center gap-3 rounded-xl border border-violet-300/10 bg-violet-500/[0.08] px-3.5 text-sm text-violet-100"
          >
            <Plus className="size-4 text-violet-300" />
            Nova conversa
          </button>
          <label className="mt-2 flex h-10 items-center gap-3 rounded-xl px-3.5 text-zinc-500 focus-within:bg-white/[0.035]">
            <Search className="size-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar conversas"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600"
            />
          </label>
        </div>
        <div className="mt-5 flex-1 overflow-y-auto px-3">
          <p className="mb-2 px-3 text-[10px] uppercase tracking-[0.13em] text-zinc-700">
            Recentes
          </p>
          <div className="space-y-1">
            {conversations.length === 0 && (
              <p className="px-3 py-4 text-xs text-zinc-700">
                Nenhuma conversa encontrada.
              </p>
            )}
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group flex h-10 items-center rounded-xl px-3 text-sm",
                  conversation.id === store.activeId
                    ? "bg-white/[0.06] text-zinc-200"
                    : "text-zinc-500 hover:bg-white/[0.035]",
                )}
              >
                <button
                  onClick={() => void store.selectConversation(conversation.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <MessageSquare className="size-3.5 shrink-0 opacity-65" />
                  <span className="truncate">{conversation.title}</span>
                </button>
                <div className="hidden items-center group-hover:flex">
                  <button
                    aria-label="Renomear conversa"
                    onClick={() => {
                      const title = window.prompt(
                        "Novo título",
                        conversation.title,
                      );
                      if (title?.trim()) {
                        void store.renameConversation(
                          conversation.id,
                          title.trim(),
                        );
                      }
                    }}
                    className="p-1 text-zinc-600 hover:text-zinc-300"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    aria-label="Arquivar conversa"
                    onClick={() =>
                      void store.archiveConversation(conversation.id)
                    }
                    className="p-1 text-zinc-600 hover:text-zinc-300"
                  >
                    <Archive className="size-3" />
                  </button>
                  <button
                    aria-label="Excluir conversa"
                    onClick={() => {
                      if (window.confirm("Excluir esta conversa?")) {
                        void store.deleteConversation(conversation.id);
                      }
                    }}
                    className="p-1 text-zinc-600 hover:text-rose-300"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/settings/memory"
            className="mt-7 flex items-center gap-3 rounded-xl border border-white/[0.055] bg-white/[0.025] p-3"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-violet-500/10 text-violet-300">
              <Sparkles className="size-3.5" />
            </span>
            <div>
              <p className="text-xs text-zinc-400">Memória Hanira</p>
              <p className="mt-0.5 text-[10px] text-zinc-700">
                Gerenciar lembranças
              </p>
            </div>
          </Link>
        </div>
        <div className="border-t border-white/[0.06] p-3">
          <Link
            href="/settings"
            className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-zinc-500 hover:bg-white/[0.04]"
          >
            <Settings className="size-4" />
            Configurações
          </Link>
          <form action={logoutAction}>
            <button className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-zinc-600 hover:bg-white/[0.04]">
              <LogOut className="size-4" />
              Sair
            </button>
          </form>
          <div className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2">
            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-violet-300 to-violet-700 text-xs font-semibold">
              {userName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs text-zinc-300">{userName}</p>
              <p className="text-[10px] text-zinc-700">Plano Essencial</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
