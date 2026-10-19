// Pacote 18.4 — Voice Internationalization.
// Módulo puro (cliente/servidor), sem "server-only" nem DOM. Concentra o
// vocabulário de idiomas da voz, o mapeamento para o Whisper e a resolução do
// idioma de transcrição. REGRA: país NUNCA deriva idioma — country/region são
// informações geográficas independentes (validadas em normalizeCountryCode e
// explicitamente fora da resolução de idioma).

/** Idiomas suportados pela voz (mesmo conjunto do CHECK de user_settings.language). */
export const SUPPORTED_VOICE_LANGUAGES = ["pt-BR", "en", "es"] as const;

export type VoiceLanguage = (typeof SUPPORTED_VOICE_LANGUAGES)[number];

export const DEFAULT_VOICE_LANGUAGE: VoiceLanguage = "pt-BR";

/** Código ISO-639-1 enviado ao Whisper (@cf/openai/whisper-large-v3-turbo). */
export const WHISPER_LANGUAGE_CODES: Record<VoiceLanguage, string> = {
  "pt-BR": "pt",
  en: "en",
  es: "es",
};

const LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  "pt-BR": "portugues brasileiro",
  en: "ingles",
  es: "espanhol",
};

/** Rótulos de exibição (UI) por idioma suportado — não usar em prompts. */
export const VOICE_LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  "pt-BR": "Português (Brasil)",
  en: "English",
  es: "Español",
};

export function isVoiceLanguage(value: unknown): value is VoiceLanguage {
  return typeof value === "string" && (SUPPORTED_VOICE_LANGUAGES as readonly string[]).includes(value);
}

/** Normaliza para um idioma suportado; valores desconhecidos caem no padrão. */
export function normalizeVoiceLanguage(
  value: unknown,
  fallback: VoiceLanguage = DEFAULT_VOICE_LANGUAGE,
): VoiceLanguage {
  return isVoiceLanguage(value) ? value : fallback;
}

/** Rótulo sem acento para prompts do system prompt. */
export function voiceLanguageLabel(value: unknown): string {
  return LANGUAGE_LABELS[normalizeVoiceLanguage(value)];
}

/** Código Whisper (ISO-639-1) para um idioma suportado. */
export function whisperLanguageCode(value: unknown): string {
  return WHISPER_LANGUAGE_CODES[normalizeVoiceLanguage(value)];
}

/**
 * País/region: aceita somente código ISO 3166-1 alpha-2 de 2 letras (qualquer
 * caixa) e devolve MAIÚSCULAS. Qualquer outra coisa (nome de país, 3 letras,
 * número, vazio) → null. O país não tem relação com o idioma por construção:
 * esta função não aceita nem devolve idioma.
 */
export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z]{2}$/.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

export interface SttLanguageResolution {
  /** Código Whisper a enviar, ou null = omitir o campo (auto-deteccao do modelo). */
  language: string | null;
  /** De onde veve a decisao (auditoria/testes; nunca loga conteudo do usuario). */
  source: "conversation" | "auto-detect" | "profile" | "default";
}

export interface SttLanguageInput {
  /** Override explicito da conversa atual (form field validado no servidor). */
  conversationLanguage?: unknown;
  /** Idioma primario do perfil (user_settings.language). */
  profileLanguage?: unknown;
  /** Preferencia de deteccao automatica do perfil (user_settings.auto_detect_language). */
  autoDetect?: boolean;
}

/**
 * Resolve o idioma da transcrição STT (fail-safe, sempre devolve um resultado):
 *  1. override explícito da conversa vence (escolha explícita do usuário);
 *  2. senão, preferência de auto-detecção → null (omite `language`, Whisper detecta);
 *  3. senão, idioma primário do perfil;
 *  4. senão, padrão pt-BR.
 * Documentação Cloudflare: `language` é parâmetro opcional de
 * whisper-large-v3-turbo; omitir o campo equivale à detecção automática.
 */
export function resolveSttLanguage(input: SttLanguageInput): SttLanguageResolution {
  if (isVoiceLanguage(input.conversationLanguage)) {
    return { language: WHISPER_LANGUAGE_CODES[input.conversationLanguage], source: "conversation" };
  }
  if (input.autoDetect === true) {
    return { language: null, source: "auto-detect" };
  }
  if (isVoiceLanguage(input.profileLanguage)) {
    return { language: WHISPER_LANGUAGE_CODES[input.profileLanguage], source: "profile" };
  }
  return { language: WHISPER_LANGUAGE_CODES[DEFAULT_VOICE_LANGUAGE], source: "default" };
}
