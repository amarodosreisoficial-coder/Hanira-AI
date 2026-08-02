"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Play,
} from "lucide-react";
import { HaniraMark } from "@/components/brand/hanira-mark";
import { Button } from "@/components/ui/button";
import type { SystemDiagnostics } from "@/types/diagnostics";

function statusLabel(status: SystemDiagnostics["text"]["status"]) {
  switch (status) {
    case "available":
      return "Disponivel";
    case "disabled":
      return "Desativado";
    case "misconfigured":
      return "Configuracao incompleta";
    case "unavailable":
      return "Indisponivel";
  }
}

export function SystemPage() {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runDiagnostics() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/system/diagnostics", {
        cache: "no-store",
      });
      const data = (await response.json()) as SystemDiagnostics & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error);
      setDiagnostics(data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Nao foi possivel executar o diagnostico.",
      );
    } finally {
      setLoading(false);
    }
  }

  const rows = diagnostics
    ? [
        ["Modo", diagnostics.mode === "demo" ? "Demonstracao" : "Real", true],
        ["Usuario autenticado", undefined, diagnostics.authenticated],
        ["Banco acessivel", undefined, diagnostics.databaseAccessible],
        [
          "Texto",
          `${statusLabel(diagnostics.text.status)}${diagnostics.text.model ? ` (${diagnostics.text.model})` : ""}`,
          diagnostics.text.status === "available",
        ],
        [
          "Visao",
          `${statusLabel(diagnostics.vision.status)}${diagnostics.vision.model ? ` (${diagnostics.vision.model})` : ""}`,
          diagnostics.vision.status === "available",
        ],
        [
          "Transcricao",
          `${statusLabel(diagnostics.transcription.status)}${diagnostics.transcription.model ? ` (${diagnostics.transcription.model})` : ""}`,
          diagnostics.transcription.status === "available",
        ],
        [
          "Voz",
          `${statusLabel(diagnostics.speech.status)}${diagnostics.speech.voice ? ` (${diagnostics.speech.voice})` : ""}`,
          diagnostics.speech.status === "available",
        ],
        [
          "Anexos",
          statusLabel(diagnostics.attachments.status),
          diagnostics.attachments.status === "available",
        ],
        ["Versao do schema", diagnostics.schemaVersion ?? "Nao verificada", true],
        ["URL da aplicacao", diagnostics.appUrl, true],
        ["Versao da aplicacao", diagnostics.appVersion, true],
      ]
    : [];

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
            <Activity className="size-5" />
          </span>
          <h1 className="mt-6 text-3xl font-medium tracking-[-0.04em]">
            Diagnostico do sistema
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
            Verifica a ativacao sem exibir chaves, tokens ou dados privados.
          </p>
          <Button
            className="mt-7"
            disabled={loading}
            onClick={() => void runDiagnostics()}
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {loading ? "Verificando..." : "Executar diagnostico"}
          </Button>
          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        </div>

        {diagnostics && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
            {rows.map(([label, text, healthy]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between gap-5 border-b border-white/[0.06] px-5 py-4 last:border-0"
              >
                <span className="text-sm text-zinc-400">{label}</span>
                <span className="flex items-center gap-2 text-right text-xs text-zinc-300">
                  {text ? (
                    String(text)
                  ) : healthy ? (
                    <>
                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                      Disponivel
                    </>
                  ) : (
                    <>
                      <CircleAlert className="size-3.5 text-amber-400" />
                      Indisponivel
                    </>
                  )}
                </span>
              </div>
            ))}
            <div className="bg-black/15 px-5 py-3 text-[10px] text-zinc-700">
              ID do diagnostico: {diagnostics.requestId}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
