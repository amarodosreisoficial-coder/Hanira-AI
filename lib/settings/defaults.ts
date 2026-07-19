import type { UserSettings } from "@/types/settings";

export const DEFAULT_USER_SETTINGS: UserSettings = {
  preferredName: "",
  responseStyle: "equilibrado",
  memoryEnabled: true,
  voiceEnabled: false,
  autoSpeak: false,
  audioAutoplay: false,
  ttsVoice: "alloy",
  speechRate: 1,
  transcriptionEnabled: true,
  voiceConversationEnabled: false,
  privacyNoticeDismissed: false,
};
