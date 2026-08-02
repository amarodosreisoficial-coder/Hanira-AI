import type { AIProvider } from "@/lib/ai/provider";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { createTextChatRuntime } from "@/lib/ai/runtime/create-text-chat-runtime";
import { buildTextChatProviderRequest, type TextChatContextMessage } from "@/lib/ai/runtime/text-chat-runtime";
import type { AIChatRequest } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";
import { getOpenAIVisionModel } from "@/lib/ai/models";
import { getServerAICapabilities } from "@/lib/ai/capabilities";
import { attachmentImageDataUrl } from "@/services/attachments";
import { getOpenAIClient } from "@/services/openai";

interface OwnedAttachment {
  id: string;
  type: "image" | "audio";
  storage_bucket: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  metadata: Record<string, unknown> | null;
}

export interface RoutedChatProviderSelection {
  capability: "text" | "vision";
  provider: AIProvider;
  providerRequest: AIChatRequest;
  providerId: string;
  model: string;
  mode: string;
  baseUrl?: string;
  connectTimeoutMs?: number;
  firstTokenTimeoutMs?: number;
  idleTimeoutMs?: number;
  requestTimeoutMs?: number;
  attachmentCount: number;
  imageAttachmentCount: number;
}

export async function routeChatCapability(options: {
  systemPrompt: string;
  context: TextChatContextMessage[];
  userMessage: string;
  attachments: OwnedAttachment[];
}) : Promise<RoutedChatProviderSelection> {
  const capabilities = getServerAICapabilities();
  const imageAttachments = options.attachments.filter(
    (attachment) => attachment.type === "image",
  );

  if (options.attachments.length === 0) {
    const runtime = createTextChatRuntime();
    return {
      capability: "text",
      provider: runtime.provider,
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: options.systemPrompt,
        context: [
          ...options.context,
          { role: "user", content: options.userMessage },
        ],
        model: runtime.model,
      }),
      providerId: runtime.providerId,
      model: runtime.model,
      mode: runtime.providerId,
      baseUrl: runtime.baseUrl,
      connectTimeoutMs: runtime.connectTimeoutMs,
      firstTokenTimeoutMs: runtime.firstTokenTimeoutMs,
      idleTimeoutMs: runtime.idleTimeoutMs,
      requestTimeoutMs: runtime.requestTimeoutMs,
      attachmentCount: 0,
      imageAttachmentCount: 0,
    };
  }

  if (!capabilities.attachments.enabled || capabilities.attachments.status !== "available") {
    throw new AIProviderError({
      code: "unsupported_capability",
      message: "O envio de anexos esta desativado nesta instancia.",
      provider: "router",
      retryable: false,
    });
  }

  if (imageAttachments.length !== options.attachments.length) {
    throw new AIProviderError({
      code: "unsupported_capability",
      message: "Nesta etapa, apenas imagens sao suportadas no chat multimodal.",
      provider: "router",
      retryable: false,
    });
  }

  if (capabilities.vision.status !== "available") {
    throw new AIProviderError({
      code: "unsupported_capability",
      message:
        capabilities.vision.reason ??
        "A analise de imagens nao esta disponivel nesta instancia.",
      provider: "openai",
      model: capabilities.vision.model,
      retryable: false,
    });
  }

  const provider = new OpenAIProvider({
    clientFactory: getOpenAIClient,
    defaultModelResolver: getOpenAIVisionModel,
  });
  const model = getOpenAIVisionModel();
  const imageParts = await Promise.all(
    imageAttachments.map(async (attachment) => ({
      type: "image" as const,
      imageUrl: await attachmentImageDataUrl(attachment),
      mimeType: attachment.mime_type,
    })),
  );
  const text = options.userMessage.trim() || "Analise esta imagem com seguranca e objetividade.";

  return {
    capability: "vision",
    provider,
    providerRequest: {
      model,
      messages: [
        { role: "system", text: options.systemPrompt },
        ...options.context.map((message) => ({
          role: message.role,
          text: message.content,
        })),
        {
          role: "user",
          content: [{ type: "text", text }, ...imageParts],
        },
      ],
      metadata: { capability: "vision" },
    },
    providerId: provider.providerId,
    model,
    mode: "openai-vision",
    requestTimeoutMs: 45_000,
    attachmentCount: options.attachments.length,
    imageAttachmentCount: imageAttachments.length,
  };
}
