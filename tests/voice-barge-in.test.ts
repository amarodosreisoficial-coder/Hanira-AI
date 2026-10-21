import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { interruptSpeech, type BrowserTtsHost } from "@/lib/voice/browser-tts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const composer = source("components/chat/chat-composer.tsx");
const recorder = source("components/voice/voice-recorder.tsx");
const browserTts = source("lib/voice/browser-tts.ts");

describe("Pacote 18.4 — barge-in: microfone interrompe fala da Nira", () => {
  it("openRecorder e o início da gravação cancelam fala em andamento", () => {
    expect(composer).toContain("interruptSpeech");
    expect(composer).toContain("function openRecorder");
    expect(recorder).toContain("interruptSpeech");
    // O evento canônico de parada de fala continua proveniente de browser-tts.
    expect(browserTts).toContain("hanira:stop-speech");
  });

  it("interruptSpeech cancela a síntese e despacha hanira:stop-speech", () => {
    const cancel = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("CustomEvent", class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    });
    vi.stubGlobal("window", { dispatchEvent });
    try {
      interruptSpeech({ speechSynthesis: { cancel } } as unknown as BrowserTtsHost);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(dispatchEvent).toHaveBeenCalledTimes(1);
      expect((dispatchEvent.mock.calls[0][0] as Event).type).toBe(
        "hanira:stop-speech",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("nao dispara fetch, provider ou rede no helper de barge-in", () => {
    expect(browserTts).not.toContain("fetch(");
    expect(browserTts).not.toMatch(/openai|groq|cloudflare/i);
  });
});