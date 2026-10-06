import { describe, expect, it } from "vitest";
import {
  BROWSER_TTS_AUTO_PREFERENCE,
  browserTtsAvailability,
  clampSpeechRate,
  isBrowserTtsPreference,
  listPtBrBrowserVoices,
  normalizeVoiceLocale,
  selectPtBrVoice,
} from "@/lib/voice/browser-tts";

function voice(name: string, lang: string, voiceURI = name, isDefault = false) {
  return { name, lang, voiceURI, default: isDefault } as SpeechSynthesisVoice;
}

describe("Browser TTS V1", () => {
  it("normaliza locale e aceita exclusivamente pt-BR", () => {
    expect(normalizeVoiceLocale("pt_BR")).toBe("pt-br");
    expect(listPtBrBrowserVoices([voice("BR", "pt_BR"), voice("PT", "pt-PT"), voice("EN", "en-US")])).toHaveLength(1);
  });

  it("seleciona a preferida quando instalada e usa uma pt-BR como fallback seguro", () => {
    const voices = [voice("Outra", "pt-BR", "other"), voice("Preferida", "pt-BR", "wanted")];
    expect(selectPtBrVoice(voices, "wanted")?.voiceURI).toBe("wanted");
    expect(selectPtBrVoice(voices, "missing")?.lang).toBe("pt-BR");
  });

  it("não trata vozes legadas de provider como preferência do navegador", () => {
    expect(isBrowserTtsPreference("alloy")).toBe(false);
    expect(isBrowserTtsPreference(BROWSER_TTS_AUTO_PREFERENCE)).toBe(true);
    expect(isBrowserTtsPreference("native-voice-uri")).toBe(true);
  });

  it("informa suporte ausente e ausência de voz pt-BR sem rede", () => {
    expect(browserTtsAvailability(null)).toBe("unsupported");
    expect(browserTtsAvailability({ speechSynthesis: { getVoices: () => [voice("PT", "pt-PT")] } as SpeechSynthesis, SpeechSynthesisUtterance: class {} as typeof SpeechSynthesisUtterance })).toBe("no-pt-br-voice");
  });

  it("limita a velocidade a uma faixa segura", () => {
    expect(clampSpeechRate(0)).toBe(0.5);
    expect(clampSpeechRate(5)).toBe(2);
    expect(clampSpeechRate(Number.NaN)).toBe(1);
  });
});
