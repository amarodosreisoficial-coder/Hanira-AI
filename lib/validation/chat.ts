import { z } from "zod";
import { TTS_VOICES } from "@/lib/media/config";

export const MAX_MESSAGE_LENGTH = 8_000;

export const chatRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  projectId: z.uuid().optional(),
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
  projectId: z.uuid().optional(),
});

export const conversationUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
    projectId: z.uuid().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.archived !== undefined ||
      data.projectId !== undefined,
  );

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export const projectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    archived: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.archived !== undefined ||
      data.isDefault !== undefined,
  );

export const personalityCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  instructions: z.string().max(6_000).default(""),
  isActive: z.boolean().optional(),
});

export const personalityUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    instructions: z.string().max(6_000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.instructions !== undefined ||
      data.isActive !== undefined,
  );

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
