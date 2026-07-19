import { z } from "zod";
import { TTS_VOICES } from "@/lib/media/config";

export const MAX_MESSAGE_LENGTH = 8_000;

export const chatRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  requestId: z.uuid().optional(),
  retry: z.boolean().optional(),
  attachmentIds: z.array(z.uuid()).max(4).optional(),
  demoAttachments: z
    .array(
      z.object({
        id: z.uuid(),
        type: z.enum(["image", "audio"]),
        originalName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(120),
        sizeBytes: z.number().int().positive(),
      }),
    )
    .max(4)
    .optional(),
  message: z.string().trim().max(
    MAX_MESSAGE_LENGTH,
    `A mensagem pode ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`,
  ),
}).refine(
  (data) =>
    Boolean(data.message) ||
    Boolean(data.attachmentIds?.length) ||
    Boolean(data.demoAttachments?.length),
  { message: "Adicione uma mensagem ou um anexo.", path: ["message"] },
);

export const conversationCreateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export const conversationUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((data) => data.title !== undefined || data.archived !== undefined);

export const settingsSchema = z.object({
  preferredName: z.string().trim().max(80).nullable().optional(),
  responseStyle: z
    .enum(["equilibrado", "conciso", "detalhado", "criativo", "técnico"])
    .optional(),
  memoryEnabled: z.boolean().optional(),
  voiceEnabled: z.boolean().optional(),
  autoSpeak: z.boolean().optional(),
  audioAutoplay: z.boolean().optional(),
  ttsVoice: z.enum(TTS_VOICES).optional(),
  speechRate: z.number().min(0.5).max(2).optional(),
  transcriptionEnabled: z.boolean().optional(),
  voiceConversationEnabled: z.boolean().optional(),
  privacyNoticeDismissed: z.boolean().optional(),
});
