export type AttachmentType = "image" | "audio" | "document";
export type AttachmentKind = AttachmentType;
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

export interface AttachmentDescriptor {
  id: string;
  type: AttachmentType;
  storageBucket: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  userId: string;
  conversationId: string;
  messageId: string | null;
  metadata: Record<string, unknown>;
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
