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
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [iosPopoverOpen, setIosPopoverOpen] = useState(false);

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

  const install = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } finally {
      setInstallPrompt(null);
      setTooltipOpen(false);
    }
  };

  const handleInstallClick = () => {
    if (experience === "native-prompt") {
      void install();
    } else if (experience === "ios-guidance") {
      setIosPopoverOpen(true);
    }
  };

  if (experience === "none") return null;

  return (
    <div
      className="fixed bottom-3 right-3 z-50 sm:bottom-4 sm:right-4"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {iosPopoverOpen && (
        <div
          role="dialog"
          aria-label="Instalar Hanira no iOS"
          className="mb-2 w-72 rounded-2xl border border-border/60 bg-card/95 p-4 text-foreground shadow-xl shadow-black/30 backdrop-blur-xl"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Share className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Adicionar à Tela de Início</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                No Safari, toque em <strong>Compartilhar</strong> e depois em{" "}
                <strong>Adicionar à Tela de Início</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIosPopoverOpen(false)}
              aria-label="Fechar"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={handleInstallClick}
          onMouseEnter={() => setTooltipOpen(true)}
          onMouseLeave={() => setTooltipOpen(false)}
          onFocus={() => setTooltipOpen(true)}
          onBlur={() => setTooltipOpen(false)}
          aria-label="Instalar Hanira"
          title="Instalar Hanira"
          className="grid size-11 place-items-center rounded-full border border-border/60 bg-card/90 text-muted-foreground shadow-lg shadow-black/20 backdrop-blur-xl transition hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="size-[18px]" aria-hidden="true" />
        </button>
        {tooltipOpen && !iosPopoverOpen && (
          <div
            role="tooltip"
            className="absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg border border-border/60 bg-card/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg shadow-black/20 backdrop-blur-xl"
          >
            Instalar Hanira
          </div>
        )}
      </div>
    </div>
  );
}
