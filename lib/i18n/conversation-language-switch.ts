// Pacote 18.4 — Voice Internationalization.
// Detecção DETERMINÍSTICA de troca temporária de idioma da conversa.
// Ex.: "Nira, agora fale comigo em inglês." → en.
// Padrão do códigobase (ver lib/chat/composer-intent): função pura, sem
// provider, sem chamada externa. A troca é um override POR CONVERSA e NUNCA
// altera a preferência permanente do perfil (user_settings.language).
// Entrada é normalizada (sem acentos, minúsculas) para aceitar "inglês"/"ingles".

import type { VoiceLanguage } from "./voice-languages";

const LANGUAGE_ALIASES: Record<VoiceLanguage, readonly string[]> = {
  "pt-BR": ["portugues", "portuguese"],
  en: ["ingles", "english"],
  es: ["espanol", "espanhol", "spanish"],
};

/**
 * Constrói os padrões de comando de troca para um idioma-alvo.
 * Todos os gatilhos são frases CONTÍGUAS de comando (falar/responder/mudar)
 * para evitar falso positivo em tradução ("traduza para inglês"), pedidos de
 * explicação ("explique em inglês") ou declarações ("quero aprender inglês").
 */
function buildPatterns(aliases: readonly string[]): RegExp[] {
  const lang = aliases.join("|");
  const flags = "i";
  return [
    // PT: "fale (comigo) em X", "responda em X", "converse em X", "escreva em X"
    new RegExp(`\\b(?:fale|responda|converse|escreva)(?:\\s+\\w+){0,3}\\s+em\\s+(?:${lang})\\b`, flags),
    // PT: "(você) pode/quero falar em X"
    new RegExp(`\\b(?:pode|poderia|quero|vamos)\\s+(?:\\w+\\s+){0,2}falar\\s+em\\s+(?:${lang})\\b`, flags),
    // PT: "agora em X"
    new RegExp(`\\bagora\\s+em\\s+(?:${lang})\\b`, flags),
    // PT: "mude/mudar/troque/passe para X"
    new RegExp(`\\b(?:mude|mudar|troque|trocar|passe|passar)\\s+para\\s+(?:${lang})\\b`, flags),
    // PT: "volte/voltar ao/para (o) X"
    new RegExp(`\\b(?:volte|voltar|retorne|retornar)\\s+(?:ao|a|para o|para)\\s+(?:${lang})\\b`, flags),
    // EN: "speak/talk/respond/reply/answer (to me) in X"
    new RegExp(`\\b(?:speak|talk|respond|reply|answer|tell)(?:\\s+\\w+){0,3}\\s+in\\s+(?:${lang})\\b`, flags),
    // EN: "switch to X", "change to X", "back to X"
    new RegExp(`\\b(?:switch|change|go back|back)\\s+to\\s+(?:${lang})\\b`, flags),
    // ES: "habla/responde en X", "cambia a X"
    new RegExp(`\\b(?:habla|hablar|responde|responder)\\s+en\\s+(?:${lang})\\b`, flags),
    new RegExp(`\\b(?:cambia|cambiar)\\s+a\\s+(?:${lang})\\b`, flags),
  ];
}

const SWITCH_PATTERNS: Array<{ language: VoiceLanguage; patterns: RegExp[] }> = (
  Object.keys(LANGUAGE_ALIASES) as VoiceLanguage[]
).map((language) => ({ language, patterns: buildPatterns(LANGUAGE_ALIASES[language]) }));

/** Normaliza para comparação sem acentos/caixa. */
function normalize(message: string) {
  return message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Detecta um pedido explícito de troca de idioma da conversa.
 * Retorna o idioma-alvo ou null (sem troca). Função pura e fail-safe:
 * sem intenção clara → null (a conversa segue o idioma atual/perfil).
 */
export function detectConversationLanguageSwitch(
  message: string,
): VoiceLanguage | null {
  if (typeof message !== "string" || !message.trim()) return null;
  const normalized = normalize(message);
  // Ordem do objeto: "pt-BR" primeiro — "voltar ao português" tem precedência
  // sobre menções acidentais a outros idiomas na mesma frase.
  for (const { language, patterns } of SWITCH_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(normalized))) return language;
  }
  return null;
}
