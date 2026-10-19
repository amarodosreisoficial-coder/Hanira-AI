// Pacote 18.4 — Voice Internationalization.
// Helper compartilhado de compatibilidade de schema: a migration 010 (campos
// de i18n em user_settings) é LOCAL e ainda não aplicada remotamente. Quando o
// PostgREST não encontra a coluna, o supabase-js responde PGRST204 (ou mensagem
// de schema cache) e os consumidores caem para o select/upsert base — fail-safe
// para usuários existentes, sem erro em produção.
// NUNCA reaplicar a migration 009; a 010 também não deve ser aplicada sem
// autorização humana explícita (HARD STOP de migration remota).

/** Erro estrutural do PostgREST para coluna ausente no schema cache. */
export function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined,
) {
  if (!error) return false;
  return error.code === "PGRST204" || /column|schema cache/i.test(error.message ?? "");
}
