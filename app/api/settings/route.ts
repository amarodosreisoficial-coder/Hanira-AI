import { apiErrorResponse } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { isMissingColumnError } from "@/lib/supabase/schema-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { settingsSchema } from "@/lib/validation/chat";

const demoSettings = {
  preferredName: "Visitante",
  responseStyle: "equilibrado",
  memoryEnabled: true,
  voiceEnabled: false,
  autoSpeak: false,
  audioAutoplay: false,
  ttsVoice: "browser:auto",
  speechRate: 1,
  transcriptionEnabled: false,
  voiceConversationEnabled: false,
  privacyNoticeDismissed: false,
};

// Pacote 18.4: colunas de i18n vêm da migration 010 (LOCAL, ainda não aplicada
// remotamente). GET tenta o select estendido e, se o schema não tiver as
// colunas, cai para o select base avisando i18nAvailable=false — usuários
// existentes continuam funcionando sem a migration.
// IMPORTANTE: literais completos (sem concatenação) para preservar o tipo de
// string literal — o parser de select do supabase-js só infere Row com literais.
const BASE_SETTINGS_COLUMNS =
  "preferred_name,occupation,language,technical_level,response_length,response_tone,response_style,memory_enabled,voice_enabled,auto_speak,audio_autoplay,tts_voice,speech_rate,transcription_enabled,voice_conversation_enabled,privacy_notice_dismissed";
const I18N_SETTINGS_SELECT =
  "preferred_name,occupation,language,technical_level,response_length,response_tone,response_style,memory_enabled,voice_enabled,auto_speak,audio_autoplay,tts_voice,speech_rate,transcription_enabled,voice_conversation_enabled,privacy_notice_dismissed,country,region,additional_languages,auto_detect_language";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.demo) return Response.json({ settings: demoSettings, mode: "demo", i18nAvailable: false });

    const supabase = await createSupabaseServerClient();
    let { data, error } = await supabase!
      .from("user_settings")
      .select(I18N_SETTINGS_SELECT)
      .eq("user_id", user.id)
      .maybeSingle();
    let i18nAvailable = true;
    if (error && isMissingColumnError(error)) {
      i18nAvailable = false;
      ({ data, error } = await supabase!
        .from("user_settings")
        .select(BASE_SETTINGS_COLUMNS)
        .eq("user_id", user.id)
        .maybeSingle());
    }
    if (error) throw error;

    return Response.json({
      mode: "supabase",
      i18nAvailable,
      settings: data
        ? {
            preferredName: data.preferred_name,
            occupation: data.occupation,
            language: data.language,
            technicalLevel: data.technical_level,
            responseLength: data.response_length,
            responseTone: data.response_tone,
            responseStyle: data.response_style,
            memoryEnabled: data.memory_enabled,
            voiceEnabled: data.voice_enabled,
            autoSpeak: data.auto_speak,
            audioAutoplay: data.audio_autoplay,
            ttsVoice: data.tts_voice,
            speechRate: Number(data.speech_rate),
            transcriptionEnabled: data.transcription_enabled,
            voiceConversationEnabled: data.voice_conversation_enabled,
            privacyNoticeDismissed: data.privacy_notice_dismissed,
            country: i18nAvailable && typeof data.country === "string" ? data.country : null,
            region: i18nAvailable && typeof data.region === "string" ? data.region : null,
            additionalLanguages: i18nAvailable && Array.isArray(data.additional_languages)
              ? data.additional_languages
              : [],
            autoDetectLanguage: i18nAvailable && typeof data.auto_detect_language === "boolean"
              ? data.auto_detect_language
              : false,
          }
        : { ...demoSettings, preferredName: user.displayName ?? null },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    const payload = settingsSchema.parse(await request.json());
    if (user.demo) return Response.json({ settings: payload, mode: "demo" });

    const i18nRow: Record<string, unknown> = {
      ...(payload.country !== undefined && { country: payload.country }),
      ...(payload.region !== undefined && { region: payload.region }),
      ...(payload.additionalLanguages !== undefined && {
        additional_languages: payload.additionalLanguages,
      }),
      ...(payload.autoDetectLanguage !== undefined && {
        auto_detect_language: payload.autoDetectLanguage,
      }),
    };
    const baseRow: Record<string, unknown> = {
      user_id: user.id,
      ...(payload.preferredName !== undefined && {
        preferred_name: payload.preferredName,
      }),
      ...(payload.occupation !== undefined && { occupation: payload.occupation }),
      ...(payload.language !== undefined && { language: payload.language }),
      ...(payload.technicalLevel !== undefined && { technical_level: payload.technicalLevel }),
      ...(payload.responseLength !== undefined && { response_length: payload.responseLength }),
      ...(payload.responseTone !== undefined && { response_tone: payload.responseTone }),
      ...(payload.responseStyle !== undefined && {
        response_style: payload.responseStyle,
      }),
      ...(payload.memoryEnabled !== undefined && {
        memory_enabled: payload.memoryEnabled,
      }),
      ...(payload.voiceEnabled !== undefined && {
        voice_enabled: payload.voiceEnabled,
      }),
      ...(payload.autoSpeak !== undefined && {
        auto_speak: payload.autoSpeak,
      }),
      ...(payload.audioAutoplay !== undefined && {
        audio_autoplay: payload.audioAutoplay,
      }),
      ...(payload.ttsVoice !== undefined && {
        tts_voice: payload.ttsVoice,
      }),
      ...(payload.speechRate !== undefined && {
        speech_rate: payload.speechRate,
      }),
      ...(payload.transcriptionEnabled !== undefined && {
        transcription_enabled: payload.transcriptionEnabled,
      }),
      ...(payload.voiceConversationEnabled !== undefined && {
        voice_conversation_enabled: payload.voiceConversationEnabled,
      }),
      ...(payload.privacyNoticeDismissed !== undefined && {
        privacy_notice_dismissed: payload.privacyNoticeDismissed,
      }),
    };
    const row = { ...baseRow, ...i18nRow };
    const supabase = await createSupabaseServerClient();
    let { error } = await supabase!
      .from("user_settings")
      .upsert(row, { onConflict: "user_id" });
    let i18nSaved = true;
    if (error && isMissingColumnError(error) && Object.keys(i18nRow).length > 0) {
      // Migration 010 ausente: persiste as preferências base e sinaliza que os
      // campos de i18n não foram salvos (sem quebrar o restante do PATCH).
      i18nSaved = false;
      ({ error } = await supabase!
        .from("user_settings")
        .upsert(baseRow, { onConflict: "user_id" }));
    }
    if (error) throw error;
    return Response.json({ ok: true, i18nSaved });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
