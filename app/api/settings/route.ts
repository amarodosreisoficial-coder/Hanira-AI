import { apiErrorResponse } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { settingsSchema } from "@/lib/validation/chat";

const demoSettings = {
  preferredName: "Visitante",
  responseStyle: "equilibrado",
  memoryEnabled: true,
  voiceEnabled: true,
  autoSpeak: false,
  audioAutoplay: false,
  ttsVoice: "alloy",
  speechRate: 1,
  transcriptionEnabled: true,
  voiceConversationEnabled: false,
  privacyNoticeDismissed: false,
};

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.demo) return Response.json({ settings: demoSettings, mode: "demo" });

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase!
      .from("user_settings")
      .select(
        "preferred_name,occupation,language,technical_level,response_length,response_tone,response_style,memory_enabled,voice_enabled,auto_speak,audio_autoplay,tts_voice,speech_rate,transcription_enabled,voice_conversation_enabled,privacy_notice_dismissed",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    return Response.json({
      mode: "supabase",
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

    const row = {
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
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase!
      .from("user_settings")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
