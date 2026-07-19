export type AttachmentType = "image" | "audio";
export type AttachmentStatus = "ready" | "uploading" | "processing" | "error";

export interface Attachment {
  id: string;
  type: AttachmentType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  metadata?: Record<string, unknown>;
  status?: AttachmentStatus;
}

export interface UploadedAttachmentResponse {
  attachment: Attachment;
  mode: "demo" | "supabase";
}

export type RecordingStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "processing"
  | "transcribing"
  | "complete"
  | "error";

export type VoiceConversationStatus =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";
