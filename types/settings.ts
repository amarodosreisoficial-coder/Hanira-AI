export type ResponseStyle =
  | "equilibrado"
  | "conciso"
  | "detalhado"
  | "criativo"
  | "técnico";

export interface UserSettings {
  preferredName: string | null;
  responseStyle: ResponseStyle;
  memoryEnabled: boolean;
  voiceEnabled: boolean;
  autoSpeak: boolean;
  audioAutoplay: boolean;
  ttsVoice: string;
  speechRate: number;
  transcriptionEnabled: boolean;
  voiceConversationEnabled: boolean;
  privacyNoticeDismissed: boolean;
}

export interface Memory {
  id: string;
  content: string;
  category: string | null;
  importance: number;
  createdAt: string;
  scope?: "global" | "project";
  projectId?: string | null;
}
