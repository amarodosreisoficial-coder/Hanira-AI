"use client";

import { useEffect, useState } from "react";

// Package 17.5.1 — Usage Dashboard (somente leitura).
// Mostra o uso diario de texto e imagem via GET /api/usage.
// Nunca expoe provider/model/segredo ou termos tecnicos internos.

interface UsageEntry {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number | null;
}

interface UsageSnapshotResponse {
  readonly usageDay: string;
  readonly resetAt: string;
  readonly text: UsageEntry;
  readonly image: UsageEntry;
  readonly degraded: boolean;
  readonly source: "distributed" | "memory";
}

function formatRemaining(entry: UsageEntry): string {
  if (entry.remaining === null) return "Limite diário desativado";
  if (entry.remaining === 0) return "Limite de hoje atingido";
  if (entry.remaining === 1) return "1 restante";
  return `${entry.remaining} restantes`;
}

// Pacote 17.6: estado "perto do limite" (20% restantes ou menos, ainda > 0).
// Apenas reforco visual suave; sem alarme, sem copy tecnica.
function isNearLimit(entry: UsageEntry): boolean {
  if (entry.remaining === null || entry.remaining === 0 || entry.limit <= 0) {
    return false;
  }
  return entry.remaining / entry.limit <= 0.2;
}

function formatCount(entry: UsageEntry): string {
  return `${entry.used} de ${entry.limit}`;
}

function barWidth(entry: UsageEntry): number {
  if (entry.limit <= 0) return 0;
  return Math.min(100, Math.max(0, (entry.used / entry.limit) * 100));
}

function formatReset(resetAt: string): string | null {
  const time = Date.parse(resetAt);
  if (!Number.isFinite(time)) return null;
  try {
    const formatted = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(time));
    return `Renova às ${formatted}`;
  } catch {
    return null;
  }
}

export function UsageDashboard() {
  const [snapshot, setSnapshot] = useState<UsageSnapshotResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("usage_unavailable");
        return (await response.json()) as UsageSnapshotResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setSnapshot(data);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (status === "loading") {
    return (
      <section aria-label="Uso da Hanira" className="mt-8 overflow-hidden rounded-2xl border border-white/[0.075] bg-[#0e0c10] p-5">
        <p className="text-sm text-zinc-400">Carregando seu uso de hoje...</p>
      </section>
    );
  }

  if (status === "error" || !snapshot) {
    return (
      <section aria-label="Uso da Hanira" className="mt-8 overflow-hidden rounded-2xl border border-white/[0.075] bg-[#0e0c10] p-5">
        <h2 className="text-sm font-medium">Uso da Hanira</h2>
        <p className="mt-1 text-xs text-zinc-500">O acompanhamento diário está temporariamente indisponível.</p>
        <button
          type="button"
          onClick={() => {
            setStatus("loading");
            setAttempt((value) => value + 1);
          }}
          className="mt-3 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
        >
          Tentar novamente
        </button>
      </section>
    );
  }

  const resetLabel = formatReset(snapshot.resetAt);
  const entries: Array<{ label: string; entry: UsageEntry }> = [
    { label: "Mensagens hoje", entry: snapshot.text },
    { label: "Imagens hoje", entry: snapshot.image },
  ];

  return (
    <section aria-label="Uso da Hanira" className="mt-8 overflow-hidden rounded-2xl border border-white/[0.075] bg-[#0e0c10] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Uso da Hanira</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {resetLabel ?? "Os limites renovam todos os dias."}
          </p>
        </div>
      </div>
      {snapshot.degraded && (
        <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-[11px] leading-5 text-amber-100/80">
          O acompanhamento diário completo está temporariamente limitado.
        </p>
      )}
      <div className="mt-4 space-y-4">
        {entries.map(({ label, entry }) => (
          <div key={label}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-zinc-200">{label}</p>
              <p className={`text-xs ${entry.remaining === 0 ? "font-medium text-amber-100/90" : "text-zinc-500"}`}>{formatCount(entry)} · {formatRemaining(entry)}</p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]" role="progressbar" aria-label={label} aria-valuenow={entry.used} aria-valuemin={0} aria-valuemax={entry.limit}>
              <div className={`h-full rounded-full ${entry.remaining === 0 ? "bg-amber-300/80" : isNearLimit(entry) ? "bg-amber-200/60" : "bg-violet-400/80"}`} style={{ width: `${barWidth(entry)}%` }} />
            </div>
            {entry.remaining === 0 && (
              <p className="mt-2 text-[11px] leading-5 text-amber-100/70">
                Você usou o limite de hoje. Ele volta na renovação diária.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
