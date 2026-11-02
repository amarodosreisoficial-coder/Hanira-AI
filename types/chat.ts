export type MessageRole = "user" | "assistant";
export type LoadStatus = "idle" | "loading" | "ready" | "error";

import type { ChatErrorCode } from "@/lib/chat/chat-errors";
import type { ImageAspectRatioPreset } from "@/lib/ai/image/aspect-ratios";
import type {
  GeneratedImageResult,
  ImageReferenceDraft,
} from "@/services/image-service";
import type { Attachment } from "@/types/media";

export interface ImageGenerationState {
  status: "generating" | "ready" | "error";
  prompt: string;
  aspectRatio: ImageAspectRatioPreset;
  references: ImageReferenceDraft[];
  result?: GeneratedImageResult;
  errorMessage?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
  errorCode?: ChatErrorCode;
  attachments?: Attachment[];
  /** Client-only image state. The chat store removes it before persistence. */
  imageGeneration?: ImageGenerationState;
  /** Pacote 19.2: fontes de pesquisa web associadas a esta resposta da Nira. */
  webSearchSources?: Array<{ title: string; url: string; domain: string }>;
}

export interface Conversation {
  id: string;
  title: string;
  projectId?: string;
  updatedAt: string;
  archivedAt?: string | null;
  messages: ChatMessage[];
}

export interface ConversationListResponse {
  conversations: Conversation[];
  mode: "supabase" | "demo";
}

export interface ChatRequest {
  conversationId?: string;
  projectId?: string;
  message: string;
  requestId?: string;
  retry?: boolean;
  /** Pacote 18.4: override temporário de idioma desta conversa (senão, idioma do perfil). */
  conversationLanguage?: "pt-BR" | "en" | "es";
  attachmentIds?: string[];
  demoAttachments?: Array<{
    id: string;
    type: "image" | "audio" | "document";
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}
