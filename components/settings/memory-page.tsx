"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BrainCircuit, Trash2 } from "lucide-react";
import { HaniraMark } from "@/components/brand/hanira-mark";
import type { Memory } from "@/types/settings";

export function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/memories")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ memories: Memory[] }>;
      })
      .then((data) => setMemories(data.memories))
      .catch(() => setError("Não foi possível carregar as memórias."))
      .finally(() => setLoading(false));
  }, []);

  async function remove(id?: string) {
    const message = id
      ? "Apagar esta memória?"
      : "Apagar todas as memórias? Esta ação é permanente.";
    if (!window.confirm(message)) return;
    const response = await fetch(`/api/memories${id ? `?id=${id}` : ""}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setError("Não foi possível apagar agora.");
      return;
    }
    setMemories((items) => (id ? items.filter((item) => item.id !== id) : []));
  }

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
            Configurações
          </Link>
        </div>
        <div className="mt-16">
          <span className="grid size-11 place-items-center rounded-2xl bg-violet-500/10 text-violet-300">
            <BrainCircuit className="size-5" />
          </span>
          <h1 className="mt-6 text-3xl font-medium tracking-[-0.04em]">
            Memórias da Hanira
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
            Você controla o que fica salvo. A Hanira usa somente poucas memórias
            relevantes em cada conversa.
          </p>
        </div>
        <div className="mt-8 space-y-2">
          {loading && <p className="text-sm text-zinc-600">Carregando...</p>}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {!loading && memories.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/[0.09] p-10 text-center text-sm text-zinc-600">
              Nenhuma memória salva ainda.
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
                  {memory.category ?? "geral"} · importância {memory.importance}
                </p>
              </div>
              <button
                onClick={() => void remove(memory.id)}
                className="p-2 text-zinc-700 hover:text-rose-300"
                aria-label="Apagar memória"
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
            Apagar todas as memórias
          </button>
        )}
      </div>
    </main>
  );
}
