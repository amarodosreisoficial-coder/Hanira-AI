export const BROWSER_TTS_AUTO_PREFERENCE = "browser:auto";

export interface BrowserTtsHost {
  readonly speechSynthesis?: SpeechSynthesis;
  readonly SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
}

// Pacote 18.4 — Voice Internationalization: base genérica por idioma. Os
// helpers pt-BR legados abaixo são wrappers finos de compatibilidade
// (testes e chamadas existentes continuam funcionando).
export type BrowserTtsAvailability = "available" | "unsupported" | "no-voice" | "no-pt-br-voice";

export function normalizeVoiceLocale(locale: string | null | undefined) {
  return (locale ?? "").trim().replace(/_/g, "-").toLocaleLowerCase("pt-BR");
}

export function isVoiceLocaleMatch(
  voice: Pick<SpeechSynthesisVoice, "lang">,
  language: string | null | undefined,
) {
  return normalizeVoiceLocale(voice.lang) === normalizeVoiceLocale(language);
}

/** Alias legado (compatibilidade): mesma comparação genérica por idioma. */
export function isVoiceLocale(voice: Pick<SpeechSynthesisVoice, "lang">, locale: string) {
  return isVoiceLocaleMatch(voice, locale);
}

export function isPtBrVoice(voice: Pick<SpeechSynthesisVoice, "lang">) {
  return isVoiceLocaleMatch(voice, "pt-BR");
}

function sortBrowserVoices(voices: SpeechSynthesisVoice[], locale: string) {
  return voices.slice().sort((left, right) => {
    if (left.default !== right.default) return left.default ? -1 : 1;
    return left.name.localeCompare(right.name, locale);
  });
}

/** Lista as vozes instaladas no navegador para um idioma (pt-BR, en, es). */
export function listBrowserVoicesForLanguage(
  voices: readonly SpeechSynthesisVoice[],
  language: string | null | undefined,
) {
  const target = normalizeVoiceLocale(language) || "pt-br";
  return sortBrowserVoices(
    voices.filter((voice) => normalizeVoiceLocale(voice.lang) === target),
    target,
  );
}

/** Alias legado: mesma implementação genérica por idioma. */
export function listBrowserVoicesForLocale(voices: readonly SpeechSynthesisVoice[], locale: string) {
  return listBrowserVoicesForLanguage(voices, locale);
}

/** Wrapper legado pt-BR (testes/chamadas existentes). */
export function listPtBrBrowserVoices(voices: readonly SpeechSynthesisVoice[]) {
  return listBrowserVoicesForLanguage(voices, "pt-BR");
}

/** Seleciona a voz preferida do usuário no idioma, com fallback seguro. */
export function selectBrowserVoiceForLanguage(
  voices: readonly SpeechSynthesisVoice[],
  language: string | null | undefined,
  preference: string | null | undefined,
) {
  const available = listBrowserVoicesForLanguage(voices, language);
  if (!available.length) return undefined;
  return available.find((voice) => voice.voiceURI === preference) ?? available[0];
}

/** Disponibilidade do TTS do navegador para um idioma. */
export function browserTtsAvailabilityFor(
  host: BrowserTtsHost | null | undefined,
  language: string | null | undefined,
): BrowserTtsAvailability {
  if (!host?.speechSynthesis || !host.SpeechSynthesisUtterance) return "unsupported";
  return listBrowserVoicesForLanguage(host.speechSynthesis.getVoices(), language).length > 0
    ? "available"
    : "no-voice";
}

export function isBrowserTtsPreference(value: string | null | undefined) {
  return value === BROWSER_TTS_AUTO_PREFERENCE || (typeof value === "string" && Boolean(value.trim()) && !isLegacyProviderVoice(value));
}

function isLegacyProviderVoice(value: string) {
  return ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"].includes(value);
}

export function browserTtsAvailability(host: BrowserTtsHost | null | undefined, locale = "pt-BR"): BrowserTtsAvailability {
  if (!host?.speechSynthesis || !host.SpeechSynthesisUtterance) return "unsupported";
  // Pacote 18.4: mantém o literal legado "no-pt-br-voice" para pt-BR
  // (testes/contratos existentes); outros idiomas usam "no-voice".
  const missing = normalizeVoiceLocale(locale) === "pt-br" ? "no-pt-br-voice" : "no-voice";
  return listBrowserVoicesForLocale(host.speechSynthesis.getVoices(), locale).length > 0 ? "available" : missing;
}

export function selectBrowserVoice(voices: readonly SpeechSynthesisVoice[], preference: string | null | undefined, locale = "pt-BR") {
  const available = listBrowserVoicesForLocale(voices, locale);
  if (!available.length) return undefined;
  return available.find((voice) => voice.voiceURI === preference) ?? available[0];
}

export function selectPtBrVoice(voices: readonly SpeechSynthesisVoice[], preference: string | null | undefined) {
  return selectBrowserVoice(voices, preference, "pt-BR");
}

export function clampSpeechRate(rate: number) {
  return Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1;
}

export function getBrowserTtsHost(): BrowserTtsHost | null {
  if (typeof window === "undefined") return null;
  return { speechSynthesis: window.speechSynthesis, SpeechSynthesisUtterance: window.SpeechSynthesisUtterance };
}
