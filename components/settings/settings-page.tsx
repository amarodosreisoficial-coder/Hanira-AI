"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  LogOut,
  Moon,
  Save,
  Activity,
  Sparkles,
  Trash2,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { HaniraMark } from "@/components/brand/hanira-mark";
import { Button } from "@/components/ui/button";
import { HANIRA_CAPABILITIES } from "@/lib/capabilities";
import { DEFAULT_USER_SETTINGS } from "@/lib/settings/defaults";
import type { ResponseStyle, UserSettings } from "@/types/settings";

const styles: ResponseStyle[] = [
  "equilibrado",
  "conciso",
  "detalhado",
  "criativo",
  "técnico",
];

export function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_USER_SETTINGS);
  const [mode, setMode] = useState<"supabase" | "demo">("supabase");
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{
          settings: UserSettings;
          mode: "supabase" | "demo";
        }>;
      })
      .then((data) => {
        setMode(data.mode);
        const localSettings =
          data.mode === "demo"
            ? window.localStorage.getItem("hanira-settings-demo")
            : null;
        setSettings(
          localSettings
            ? {
                ...DEFAULT_USER_SETTINGS,
                ...(JSON.parse(localSettings) as Partial<UserSettings>),
              }
            : { ...DEFAULT_USER_SETTINGS, ...data.settings },
        );
        setStatus("idle");
      })
      .catch(() => {
        setStatus("error");
        setMessage("Não foi possível carregar suas preferências.");
      });
  }, []);

  async function save() {
    setStatus("saving");
    if (mode === "demo") {
      window.localStorage.setItem(
        "hanira-settings-demo",
        JSON.stringify(settings),
      );
    }
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      setStatus("error");
      setMessage("Não foi possível salvar agora.");
      return;
    }
    setStatus("saved");
    setMessage("Preferências salvas.");
  }

  async function deleteAllConversations() {
    if (!window.confirm("Excluir todas as conversas? Esta ação é permanente.")) {
      return;
    }
    const response = await fetch("/api/conversations");
    const data = (await response.json()) as {
      conversations?: Array<{ id: string }>;
    };
    await Promise.all(
      (data.conversations ?? []).map((conversation) =>
        fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" }),
      ),
    );
    setMessage("Conversas excluídas.");
    setStatus("saved");
  }

  return (
    <main className="min-h-screen bg-[#09080a] text-zinc-100">
      <header className="flex h-16 items-center justify-between border-b border-white/[0.06] px-5 md:px-8">
        <Link href="/">
          <HaniraMark />
        </Link>
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200"
        >
          <ArrowLeft className="size-4" />
          Voltar ao chat
        </Link>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-10 md:px-8 md:py-14">
        <p className="text-xs uppercase tracking-[0.15em] text-violet-300">
          Preferências
        </p>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">
          Sua experiência, do seu jeito.
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Personalize como a Hanira conversa e usa suas informações.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
            {mode === "demo" ? "Modo demonstração" : "Modo real"}
          </span>
          <Link
            href="/settings/system"
            className="inline-flex items-center gap-1.5 text-xs text-violet-300"
          >
            <Activity className="size-3.5" />
            Diagnóstico do sistema
          </Link>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-white/[0.075] bg-[#0e0c10]">
          <SettingRow title="Aparência" description="Tema escuro premium da Hanira.">
            <span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-zinc-400">
              <Moon className="size-3.5" />
              Escuro
            </span>
          </SettingRow>
          <SettingRow
            title="Nome preferido"
            description="Como a Hanira deve chamar você."
          >
            <input
              value={settings.preferredName ?? ""}
              disabled={status === "loading"}
              onChange={(event) =>
                setSettings((value) => ({
                  ...value,
                  preferredName: event.target.value,
                }))
              }
              className="h-10 w-48 rounded-xl border border-white/[0.09] bg-black/20 px-3 text-sm outline-none focus:border-violet-400/40"
            />
          </SettingRow>
          <SettingRow
            title="Estilo de resposta"
            description="A profundidade e o tom padrão das respostas."
          >
            <select
              value={settings.responseStyle}
              onChange={(event) =>
                setSettings((value) => ({
                  ...value,
                  responseStyle: event.target.value as ResponseStyle,
                }))
              }
              className="h-10 rounded-xl border border-white/[0.09] bg-[#151217] px-3 text-sm capitalize outline-none"
            >
              {styles.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            title="Memória"
            description="Usar lembranças relevantes para personalizar respostas."
          >
            <Toggle
              label="Ativar memória"
              checked={settings.memoryEnabled}
              onChange={(memoryEnabled) =>
                setSettings((value) => ({ ...value, memoryEnabled }))
              }
            />
          </SettingRow>
          <SettingRow
            title="Voz"
            description="Ativar gravação, transcrição e leitura das respostas."
          >
            <Toggle
              label="Ativar voz"
              checked={settings.voiceEnabled}
              onChange={(voiceEnabled) =>
                setSettings((value) => ({ ...value, voiceEnabled }))
              }
            />
          </SettingRow>
          <SettingRow
            title="Ler respostas automaticamente"
            description="Gerar a leitura após cada nova resposta. Desativado por padrão."
          >
            <Toggle
              label="Leitura automática"
              checked={settings.autoSpeak}
              onChange={(autoSpeak) =>
                setSettings((value) => ({ ...value, autoSpeak }))
              }
            />
          </SettingRow>
          <SettingRow
            title="Voz da Hanira"
            description="Voz usada na síntese server-side."
          >
            <select
              value={settings.ttsVoice}
              onChange={(event) =>
                setSettings((value) => ({
                  ...value,
                  ttsVoice: event.target.value,
                }))
              }
              className="h-10 rounded-xl border border-white/[0.09] bg-[#151217] px-3 text-sm outline-none"
            >
              {[
                "alloy",
                "ash",
                "ballad",
                "coral",
                "echo",
                "fable",
                "onyx",
                "nova",
                "sage",
                "shimmer",
                "verse",
                "marin",
                "cedar",
              ].map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            title="Reprodução automática"
            description="Iniciar a fala automaticamente quando a leitura automática estiver ativa."
          >
            <Toggle
              label="Reprodução automática"
              checked={settings.audioAutoplay}
              onChange={(audioAutoplay) =>
                setSettings((value) => ({ ...value, audioAutoplay }))
              }
            />
          </SettingRow>
          <SettingRow
            title="Velocidade da fala"
            description={`${settings.speechRate.toFixed(1)}×`}
          >
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={settings.speechRate}
              aria-label="Velocidade da fala"
              onChange={(event) =>
                setSettings((value) => ({
                  ...value,
                  speechRate: Number(event.target.value),
                }))
              }
              className="w-44 accent-violet-500"
            />
          </SettingRow>
          <SettingRow
            title="Transcrição"
            description="Converter gravações em texto editável antes do envio."
          >
            <Toggle
              label="Ativar transcrição"
              checked={settings.transcriptionEnabled}
              onChange={(transcriptionEnabled) =>
                setSettings((value) => ({ ...value, transcriptionEnabled }))
              }
            />
          </SettingRow>
          <SettingRow
            title="Conversa por voz"
            description="Habilitar o fluxo ouvir, transcrever, responder e falar."
          >
            <Toggle
              label="Ativar conversa por voz"
              checked={settings.voiceConversationEnabled}
              onChange={(voiceConversationEnabled) =>
                setSettings((value) => ({
                  ...value,
                  voiceConversationEnabled,
                }))
              }
            />
          </SettingRow>
        </section>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} disabled={status === "saving"}>
            <Save className="size-4" />
            {status === "saving" ? "Salvando..." : "Salvar preferências"}
          </Button>
          <Link
            href="/settings/memory"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/[0.09] px-4 text-sm text-zinc-300"
          >
            <BrainCircuit className="size-4 text-violet-300" />
            Gerenciar memórias
          </Link>
          {message && (
            <span
              className={`text-xs ${status === "error" ? "text-rose-300" : "text-emerald-300"}`}
            >
              {message}
            </span>
          )}
        </div>

        <section className="mt-12">
          <h2 className="text-sm font-medium">Dados e conta</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => void deleteAllConversations()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-300/10 px-4 text-xs text-rose-300/80"
            >
              <Trash2 className="size-3.5" />
              Excluir conversas
            </button>
            <form action={logoutAction}>
              <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] px-4 text-xs text-zinc-400">
                <LogOut className="size-3.5" />
                Sair da conta
              </button>
            </form>
          </div>
        </section>

        <section className="mt-12">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-violet-300" />
            Próximas capacidades
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {HANIRA_CAPABILITIES.map(({ id, name, description, icon: Icon }) => (
              <article
                key={id}
                className="flex items-center gap-3 rounded-xl border border-white/[0.065] bg-white/[0.025] p-3.5"
              >
                <Icon className="size-4 text-violet-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-300">{name}</p>
                  <p className="truncate text-[10px] text-zinc-700">
                    {description}
                  </p>
                </div>
                <Check className="size-3 text-violet-500" />
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b border-white/[0.06] p-5 last:border-0 sm:flex-row sm:items-center">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-zinc-600">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-violet-500/80" : "bg-white/[0.08]"}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white transition ${checked ? "left-5" : "left-0.5"}`}
      />
    </button>
  );
}
