"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
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

/* HANIRA NEON (18.3.6) — sidebar mínima.
 * Recolhida: faixa fina quase preta, somente ícones puros (sem cards, sem
 * borda externa, sem divisória vertical forte). Expandida: ícone + texto em
 * linha, sem botão retangular grande; ativo usa fundo translúcido + barra
 * neon mínima. O símbolo Hanira no topo é o controle de expansão: hover
 * revela o affordance, click expande. Mobile usa tap normal. */

function RailButton({
  label,
  tooltip,
  active,
  onClick,
  children,
}: {
  label: string;
  tooltip?: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={tooltip ?? label}
      onClick={onClick}
      data-active={active ? "true" : undefined}
      className={cn(
        "group/rail relative grid size-10 place-items-center rounded-full text-muted-foreground transition",
        "hover:bg-white/[0.06] hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "text-foreground",
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="hanira-neon-line--vertical absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full opacity-80"
        />
      )}
      {active && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-white/[0.05]" />}
      <span className="relative">{children}</span>
    </button>
  );
}

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
        data-sidebar-state={store.sidebarCollapsed ? "collapsed" : "expanded"}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[18rem] shrink-0 flex-col bg-sidebar backdrop-blur-xl transition-[width,transform] duration-300 lg:static lg:translate-x-0",
          store.sidebarOpen
            ? "visible translate-x-0 shadow-2xl shadow-black/40"
            : "invisible -translate-x-full shadow-none lg:visible",
          store.sidebarCollapsed && "lg:w-[4.25rem]",
        )}
      >
        {/* Assinatura neon Hanira — fio vertical finíssimo, sem divisória. */}
        <span
          aria-hidden="true"
          className="hanira-neon-line--vertical pointer-events-none absolute bottom-10 right-0 top-10 hidden w-px opacity-30 lg:block"
        />
        <div className={cn("flex h-16 shrink-0 items-center gap-2 px-4", store.sidebarCollapsed && "justify-center px-0")}>
          {store.sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => store.setSidebarCollapsed(false)}
              aria-label="Expandir barra lateral"
              title="Expandir barra lateral"
              className="group hidden size-11 place-items-center rounded-full transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid"
            >
              <span
                className="transition group-hover:opacity-100 group-focus-visible:opacity-100 hover:bg-white/[0.06]"
                onMouseEnter={() => store.setSidebarCollapsed(false)}
              >
                <HaniraMark compact />
              </span>
              <span className="absolute inset-0 hidden place-items-center text-muted-foreground group-hover:grid group-focus-visible:grid">
                <PanelLeftOpen className="size-4" />
              </span>
            </button>
          ) : (
            <>
              <Link
                href="/"
                aria-label="Página inicial da Hanira"
                className="group relative min-w-0 flex-1"
                onClick={() => store.setSidebarCollapsed(false)}
              >
                <span className="sr-only">Recolher barra lateral</span>
                
                <span
                  className="absolute inset-0 place-items-center text-muted-foreground group-hover:grid group-focus-visible:grid"
                  aria-hidden="true"
                >
                  <PanelLeftClose className="size-4" />
                </span>
              </Link>
            </>
          )}
          <IconButton
            label="Fechar menu"
            onClick={() => store.setSidebarOpen(false)}
            className="lg:hidden"
          >
            <X className="size-4" />
          </IconButton>
        </div>

        {/* Faixa fina de ícones (desktop recolhido): ícones puros, sem cards. */}
        <nav
          aria-label="Atalhos"
          className={cn("hidden flex-1 flex-col items-center gap-1 py-2", store.sidebarCollapsed && "lg:flex")}
        >
          <RailButton label="Nova conversa" tooltip="Nova conversa" onClick={() => void store.newConversation()}>
            <Plus className="size-[18px]" />
          </RailButton>
          <RailButton label="Buscar conversas" tooltip="Buscar conversas" onClick={() => store.setSidebarCollapsed(false)}>
            <Search className="size-[18px]" />
          </RailButton>
          <RailButton label="Conversas recentes" tooltip="Conversas recentes" active onClick={() => store.setSidebarCollapsed(false)}>
            <MessageSquare className="size-[18px]" />
          </RailButton>
          <Link
            href="/settings/memory"
            aria-label="Memória Hanira"
            title="Memória Hanira"
            className="grid size-10 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Sparkles className="size-[18px]" />
          </Link>
          <div className="mt-auto flex flex-col items-center gap-1">
            <Link
              href="/settings"
              aria-label="Configurações"
              title="Configurações"
              className="grid size-10 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Settings className="size-[18px]" />
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Sair"
                title="Sair"
                className="grid size-10 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-[18px]" />
              </button>
            </form>
            <span
              aria-label={userName}
              title={userName}
              className="grid size-8 place-items-center rounded-full bg-white/[0.06] text-xs font-semibold text-foreground"
            >
              {userName.charAt(0).toUpperCase()}
            </span>
          </div>
        </nav>

        <div className={cn("flex min-h-0 flex-1 flex-col", store.sidebarCollapsed && "lg:hidden")}>

        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={() => void store.newConversation()}
            title="Nova conversa"
            className={cn(
              "group flex h-11 w-full items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.06] px-3.5 text-sm font-medium text-foreground transition hover:border-primary/30 hover:bg-primary/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              store.sidebarCollapsed && "lg:justify-center lg:px-0",
            )}
          >
            <Plus className="size-4 shrink-0 text-primary transition group-hover:rotate-90" />
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
                    ? "bg-primary/[0.08] text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
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
              "mt-7 flex items-center gap-3 rounded-xl p-3 transition hover:bg-accent",
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
        </div>
      </aside>
    </>
  );
}
