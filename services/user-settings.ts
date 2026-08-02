import "server-only";
import { DEFAULT_USER_SETTINGS } from "@/lib/settings/defaults";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getUserSettingsForUser(userId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("UNAUTHENTICATED");
  const { data, error } = await supabase
    .from("user_settings")
    .select(
      "voice_enabled,tts_voice,speech_rate,transcription_enabled,privacy_notice_dismissed",
    )
    .eq("user_id", userId)
    .maybeSingle();
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
  };
}
