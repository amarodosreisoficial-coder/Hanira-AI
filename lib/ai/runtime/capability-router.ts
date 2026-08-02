import type { AIProvider } from "@/lib/ai/provider";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import { createTextChatRuntime } from "@/lib/ai/runtime/create-text-chat-runtime";
import {
  buildTextChatProviderRequest,
  type TextChatContextMessage,
} from "@/lib/ai/runtime/text-chat-runtime";
import type { AIChatRequest } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";
import { getOpenAIVisionModel } from "@/lib/ai/models";
import { getServerAICapabilities } from "@/lib/ai/capabilities";
import { attachmentImageDataUrl } from "@/services/attachments";
import {
  buildDocumentContextBlock,
  extractDocumentFromAttachment,
} from "@/services/document-extraction";
import { getOpenAIClient } from "@/services/openai";
import type { AttachmentDescriptor } from "@/types/media";

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

function buildDocumentAwareUserText(options: {
  userMessage: string;
  documentContext: string;
  hasDocuments: boolean;
}) {
  const prompt =
    options.userMessage.trim() ||
    (options.hasDocuments
      ? "Analise o documento enviado e resuma os pontos mais relevantes."
      : "");

  return [prompt, options.documentContext].filter(Boolean).join("\n\n");
}

export async function routeChatCapability(options: {
  systemPrompt: string;
  context: TextChatContextMessage[];
  userMessage: string;
  attachments: AttachmentDescriptor[];
}): Promise<RoutedChatProviderSelection> {
  const capabilities = getServerAICapabilities();
  const imageAttachments = options.attachments.filter(
    (attachment) => attachment.type === "image",
  );
  const documentAttachments = options.attachments.filter(
    (attachment) => attachment.type === "document",
  );
  const audioAttachments = options.attachments.filter(
    (attachment) => attachment.type === "audio",
  );

  if (options.attachments.length === 0) {
    const runtime = createTextChatRuntime();
    return {
      capability: "text",
      provider: runtime.provider,
      providerRequest: buildTextChatProviderRequest({
        systemPrompt: options.systemPrompt,
        context: [...options.context, { role: "user", content: options.userMessage }],
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

  if (imageAttachments.length > 0 && documentAttachments.length > 0) {
    throw new AIProviderError({
      code: "unsupported_capability",
      message: "Envie imagens e documentos em mensagens separadas nesta etapa.",
      provider: "router",
      retryable: false,
    });
  }

  if (imageAttachments.length > 0) {
    if (imageAttachments.length !== options.attachments.length) {
      throw new AIProviderError({
        code: "unsupported_capability",
        message: "Nesta etapa, imagens nao podem ser combinadas com outros anexos.",
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
        mimeType: attachment.mimeType,
      })),
    );
    const text =
      options.userMessage.trim() ||
      "Analise esta imagem e descreva os elementos relevantes de forma objetiva.";

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

  if (audioAttachments.length > 0 && !options.userMessage.trim()) {
    throw new AIProviderError({
      code: "unsupported_capability",
      message: "Transcreva o audio antes de enviar sem texto.",
      provider: "router",
      retryable: false,
    });
  }

  const runtime = createTextChatRuntime();
  const extractedDocuments = await Promise.all(
    documentAttachments.map(async (attachment) => ({
      attachment,
      extracted: await extractDocumentFromAttachment(attachment),
    })),
  );
  const documentContext = buildDocumentContextBlock(extractedDocuments);
  const userText = buildDocumentAwareUserText({
    userMessage: options.userMessage,
    documentContext,
    hasDocuments: documentAttachments.length > 0,
  });

  return {
    capability: "text",
    provider: runtime.provider,
    providerRequest: buildTextChatProviderRequest({
      systemPrompt: options.systemPrompt,
      context: [...options.context, { role: "user", content: userText }],
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
    attachmentCount: options.attachments.length,
    imageAttachmentCount: 0,
  };
}
