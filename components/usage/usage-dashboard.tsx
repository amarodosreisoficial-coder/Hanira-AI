"use client";

import { useEffect, useState } from "react";

// Package 17.5 — Usage Dashboard (somente leitura).
// Mostra quota diaria distribuida de texto (default 200/dia) e imagem
// (default 10/dia) via GET /api/usage. Nunca expoe provider/model/segredo.

interface UsageEntry {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number | null;
}

interface UsageSnapshotResponse {
  readonly usageDay: string;
  readonly text: UsageEntry;
  readonly image: UsageEntry;
  readonly degraded: boolean;
  readonly source: "distributed" | "memory";
}

function formatRemaining(entry: UsageEntry): string {
  if (entry.remaining === null) return "ilimitado";
  return `${entry.remaining} restantes`;
}

function barWidth(entry: UsageEntry): number {
  if (entry.limit <= 0) return 0;
  return Math.min(100, Math.max(0, (entry.used / entry.limit) * 100));
}

export function UsageDashboard() {
  const [snapshot, setSnapshot] = useState<UsageSnapshotResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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
  }, []);

  if (status === "loading") {
    return (
      <section aria-label="Uso diario" className="mt-8 overflow-hidden rounded-2xl border border-white/[0.075] bg-[#0e0c10] p-5">
        <p className="text-sm text-zinc-400">Carregando seu uso diario...</p>
      </section>
    );
  }

  if (status === "error" || !snapshot) {
    return (
      <section aria-label="Uso diario" className="mt-8 overflow-hidden rounded-2xl border border-white/[0.075] bg-[#0e0c10] p-5">
        <p className="text-sm text-zinc-400">Nao foi possivel carregar seu uso agora.</p>
      </section>
    );
  }

  const entries: Array<{ label: string; hint: string; entry: UsageEntry }> = [
    { label: "Mensagens de texto", hint: "Quota diaria distribuida (dia UTC).", entry: snapshot.text },
    { label: "Imagens", hint: "Protecao de capacidade free (dia UTC).", entry: snapshot.image },
  ];

  return (
    <section aria-label="Uso diario" className="mt-8 overflow-hidden rounded-2xl border border-white/[0.075] bg-[#0e0c10] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Uso diario</h2>
          <p className="mt-1 text-xs text-zinc-500">Dia {snapshot.usageDay} (UTC). Limites protegem a capacidade gratuita para todos.</p>
        </div>
        {snapshot.degraded && (
          <span className="rounded-full border border-amber-300/20 px-3 py-1 text-[10px] uppercase tracking-wider text-amber-200/80">modo local</span>
        )}
      </div>
      <div className="mt-4 space-y-4">
        {entries.map(({ label, hint, entry }) => (
          <div key={label}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-zinc-200">{label}</p>
              <p className="text-xs text-zinc-500">{entry.used} / {entry.limit} · {formatRemaining(entry)}</p>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-600">{hint}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]" role="progressbar" aria-label={label} aria-valuenow={entry.used} aria-valuemin={0} aria-valuemax={entry.limit}>
              <div className="h-full rounded-full bg-violet-400/80" style={{ width: `${barWidth(entry)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
