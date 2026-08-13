export type ResponseStyle =
  | "equilibrado"
  | "conciso"
  | "detalhado"
  | "criativo"
  | "técnico";

export interface UserSettings {
  preferredName: string | null;
  occupation: string | null;
  language: string;
  technicalLevel: "beginner" | "intermediate" | "advanced";
  responseLength: "short" | "balanced" | "detailed";
  responseTone: "professional" | "neutral" | "casual";
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
  updatedAt?: string;
  origin?: string;
}
