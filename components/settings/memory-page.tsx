"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BrainCircuit, Pencil, Trash2 } from "lucide-react";
import { HaniraMark } from "@/components/brand/hanira-mark";
import type { Memory } from "@/types/settings";

interface MemoryViewState {
  conversationId: string;
  memories: Memory[];
  error: string;
}

export function MemoryPage(props: { conversationId?: string }) {
  const [state, setState] = useState<MemoryViewState | null>(null);
  const conversationId = props.conversationId ?? null;

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    let cancelled = false;

    fetch(`/api/memories?conversationId=${encodeURIComponent(conversationId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ memories: Memory[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setState({
          conversationId,
          memories: data.memories,
          error: "",
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          conversationId,
          memories: [],
          error: "Nao foi possivel carregar as memorias.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  async function remove(id?: string) {
    const message = id
      ? "Apagar esta memoria?"
      : "Apagar todas as memorias? Esta acao e permanente.";
    if (!window.confirm(message)) return;
    if (!conversationId) {
      return;
    }

    const params = new URLSearchParams({ conversationId });
    if (id) params.set("id", id);
    const response = await fetch(`/api/memories?${params.toString()}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setState({
        conversationId,
        memories: state?.conversationId === conversationId ? state.memories : [],
        error: "Nao foi possivel apagar agora.",
      });
      return;
    }

    setState((current) => ({
      conversationId,
      memories:
        id && current?.conversationId === conversationId
          ? current.memories.filter((item) => item.id !== id)
          : [],
      error: "",
    }));
  }

  async function edit(memory: Memory) {
    if (!conversationId) return;
    const content = window.prompt("Editar memoria", memory.content)?.trim();
    if (!content || content === memory.content) return;
    const response = await fetch("/api/memories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: memory.id, conversationId, content }),
    });
    if (!response.ok) {
      setState((current) => current ? { ...current, error: "Nao foi possivel editar agora." } : current);
      return;
    }
    setState((current) => current ? {
      ...current,
      memories: current.memories.map((item) => item.id === memory.id ? { ...item, content } : item),
      error: "",
    } : current);
  }

  const loading = Boolean(conversationId) && state?.conversationId !== conversationId;
  const memories =
    state?.conversationId === conversationId ? state.memories : [];
  const error = !conversationId
    ? "Selecione uma conversa para ver as memorias desse contexto."
    : state?.conversationId === conversationId
      ? state.error
      : "";

  return (
    <main className="min-h-screen bg-[#09080a] px-5 py-8 text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <HaniraMark />
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Configuracoes
          </Link>
        </div>
        <div className="mt-16">
          <span className="grid size-11 place-items-center rounded-2xl bg-violet-500/10 text-violet-300">
            <BrainCircuit className="size-5" />
          </span>
          <h1 className="mt-6 text-3xl font-medium tracking-[-0.04em]">
            Memorias da Hanira
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
            Voce controla o que fica salvo. A Hanira usa somente poucas memorias
            relevantes em cada conversa.
          </p>
        </div>
        <div className="mt-8 space-y-2">
          {loading && <p className="text-sm text-zinc-600">Carregando...</p>}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {!loading && memories.length === 0 && !error && (
            <div className="rounded-2xl border border-dashed border-white/[0.09] p-10 text-center text-sm text-zinc-600">
              Nenhuma memoria salva ainda.
            </div>
          )}
          {memories.map((memory) => (
            <article
              key={memory.id}
              className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 text-zinc-300">
                  {memory.content}
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-zinc-700">
                  {memory.category ?? "geral"} | importancia {memory.importance}
                </p>
              </div>
              <button
                onClick={() => void edit(memory)}
                className="p-2 text-zinc-700 hover:text-violet-300"
                aria-label="Editar memoria"
              >
                <Pencil className="size-4" />
              </button>
              <button
                onClick={() => void remove(memory.id)}
                className="p-2 text-zinc-700 hover:text-rose-300"
                aria-label="Apagar memoria"
              >
                <Trash2 className="size-4" />
              </button>
            </article>
          ))}
        </div>
        {memories.length > 0 && (
          <button
            onClick={() => void remove()}
            className="mt-6 inline-flex items-center gap-2 text-xs text-rose-300/70"
          >
            <Trash2 className="size-3.5" />
            Apagar todas as memorias
          </button>
        )}
      </div>
    </main>
  );
}
