export const BROWSER_TTS_AUTO_PREFERENCE = "browser:auto";

export interface BrowserTtsHost {
  readonly speechSynthesis?: SpeechSynthesis;
  readonly SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
}

export type BrowserTtsAvailability = "available" | "unsupported" | "no-pt-br-voice";

export function normalizeVoiceLocale(locale: string | null | undefined) {
  return (locale ?? "").trim().replace(/_/g, "-").toLocaleLowerCase("pt-BR");
}

export function isPtBrVoice(voice: Pick<SpeechSynthesisVoice, "lang">) {
  return normalizeVoiceLocale(voice.lang) === "pt-br";
}

export function listPtBrBrowserVoices(voices: readonly SpeechSynthesisVoice[]) {
  return voices.filter(isPtBrVoice).slice().sort((left, right) => {
    if (left.default !== right.default) return left.default ? -1 : 1;
    return left.name.localeCompare(right.name, "pt-BR");
  });
}

export function isBrowserTtsPreference(value: string | null | undefined) {
  return value === BROWSER_TTS_AUTO_PREFERENCE || (typeof value === "string" && Boolean(value.trim()) && !isLegacyProviderVoice(value));
}

function isLegacyProviderVoice(value: string) {
  return ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"].includes(value);
}

export function browserTtsAvailability(host: BrowserTtsHost | null | undefined): BrowserTtsAvailability {
  if (!host?.speechSynthesis || !host.SpeechSynthesisUtterance) return "unsupported";
  return listPtBrBrowserVoices(host.speechSynthesis.getVoices()).length > 0 ? "available" : "no-pt-br-voice";
}

export function selectPtBrVoice(voices: readonly SpeechSynthesisVoice[], preference: string | null | undefined) {
  const available = listPtBrBrowserVoices(voices);
  if (!available.length) return undefined;
  return available.find((voice) => voice.voiceURI === preference) ?? available[0];
}

export function clampSpeechRate(rate: number) {
  return Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1;
}

export function getBrowserTtsHost(): BrowserTtsHost | null {
  if (typeof window === "undefined") return null;
  return { speechSynthesis: window.speechSynthesis, SpeechSynthesisUtterance: window.SpeechSynthesisUtterance };
}
