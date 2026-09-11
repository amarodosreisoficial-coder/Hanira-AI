"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getInstallExperience,
  isIosDevice,
  isStandaloneDisplay,
} from "@/lib/pwa/install";

const DISMISSED_KEY = "hanira:pwa-install-dismissed:v1";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Navigator {
    standalone?: boolean;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function InstallExperience() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");

    const syncEnvironment = () => {
      setStandalone(
        isStandaloneDisplay({
          displayModeStandalone: displayMode.matches,
          navigatorStandalone: navigator.standalone,
        }),
      );
      setIos(isIosDevice(navigator.userAgent, navigator.maxTouchPoints));
      setDismissed(readDismissed());
    };

    const onBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const onInstalled = () => {
      setInstallPrompt(null);
      setStandalone(true);
    };

    syncEnvironment();
    displayMode.addEventListener("change", syncEnvironment);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      displayMode.removeEventListener("change", syncEnvironment);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const experience = getInstallExperience({
    standalone,
    dismissed,
    hasNativePrompt: Boolean(installPrompt),
    ios,
  });

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // A dica continua dispensável mesmo quando o storage está indisponível.
    }
    setDismissed(true);
  };

  const install = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } finally {
      setInstallPrompt(null);
    }
  };

  if (experience === "none") return null;

  return (
    <aside
      aria-label="Instalar Hanira"
      aria-live="polite"
      className="fixed right-3 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-violet-300/15 bg-[#100d15]/95 p-3 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur-xl sm:right-4"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-200">
          {experience === "native-prompt" ? (
            <Download className="size-5" aria-hidden="true" />
          ) : (
            <Share className="size-5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Instalar Hanira</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            {experience === "native-prompt"
              ? "Use a Hanira como aplicativo, com acesso direto pela sua tela inicial."
              : "No iPhone ou iPad, toque em Compartilhar e depois em Adicionar à Tela de Início."}
          </p>
          {experience === "native-prompt" ? (
            <button
              type="button"
              onClick={install}
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-xs font-semibold text-black transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            >
              Adicionar Hanira
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar instalação"
          className="grid size-11 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
