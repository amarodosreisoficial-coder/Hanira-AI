import "server-only";
import { DEFAULT_USER_SETTINGS } from "@/lib/settings/defaults";
import { isMissingColumnError } from "@/lib/supabase/schema-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isVoiceLanguage, type VoiceLanguage } from "@/lib/i18n/voice-languages";

// Pacote 18.4: colunas base (migrações 001–008) sempre presentes; colunas de
// i18n vêm da migration 010 (LOCAL, ainda não aplicada remotamente). Se a
// migration 010 não existir no banco, o select estendido falha e caímos para o
// select base com defaults — fail-safe compatível com usuários existentes.
// Literais completos (sem concatenação) para preservar o tipo string literal
// exigido pelo parser de select do supabase-js.
const BASE_COLUMNS =
  "voice_enabled,tts_voice,speech_rate,transcription_enabled,privacy_notice_dismissed,language";
const I18N_SELECT =
  "voice_enabled,tts_voice,speech_rate,transcription_enabled,privacy_notice_dismissed,language,country,region,additional_languages,auto_detect_language";

export async function getUserSettingsForUser(userId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("UNAUTHENTICATED");

  let { data, error } = await supabase
    .from("user_settings")
    .select(I18N_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  let i18nReady = true;
  if (error && isMissingColumnError(error)) {
    // Migration 010 ausente: cai para o schema base com defaults (fail-safe).
    i18nReady = false;
    ({ data, error } = await supabase
      .from("user_settings")
      .select(BASE_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle());
  }
  if (error) throw error;

  return {
    ...DEFAULT_USER_SETTINGS,
    voiceEnabled: data?.voice_enabled ?? DEFAULT_USER_SETTINGS.voiceEnabled,
    ttsVoice: data?.tts_voice ?? DEFAULT_USER_SETTINGS.ttsVoice,
    speechRate: data?.speech_rate
      ? Number(data.speech_rate)
      : DEFAULT_USER_SETTINGS.speechRate,
    transcriptionEnabled:
      data?.transcription_enabled ?? DEFAULT_USER_SETTINGS.transcriptionEnabled,
    privacyNoticeDismissed:
      data?.privacy_notice_dismissed ??
      DEFAULT_USER_SETTINGS.privacyNoticeDismissed,
    language:
      typeof data?.language === "string" && data.language
        ? data.language
        : DEFAULT_USER_SETTINGS.language,
    country:
      i18nReady && typeof data?.country === "string" && data.country
        ? data.country
        : null,
    region:
      i18nReady && typeof data?.region === "string" && data.region
        ? data.region
        : null,
    additionalLanguages:
      i18nReady && Array.isArray(data?.additional_languages)
        ? (data.additional_languages.filter(isVoiceLanguage) as VoiceLanguage[])
        : [],
    autoDetectLanguage:
      i18nReady && typeof data?.auto_detect_language === "boolean"
        ? data.auto_detect_language
        : false,
  };
}
