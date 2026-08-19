import { headers } from "next/headers";
import { ZodError, z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { createRequestId, logServerEvent } from "@/lib/logging/server";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  mediaConfig,
} from "@/lib/media/config";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  inferAttachmentTypeFromMimeType,
  validateMediaFile,
} from "@/lib/validation/media";
import { deleteOwnedAttachment, storeAttachment } from "@/services/attachments";

const conversationSchema = z.uuid();

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = createRequestId(request);
  try {
    if (!mediaConfig.attachmentsEnabled) {
      return Response.json(
        {
          error: "O envio de anexos nao esta habilitado nesta instancia.",
          requestId,
        },
        { status: 409, headers: { "X-Request-ID": requestId } },
      );
    }

    const user = await requireSessionUser();
    const headerStore = await headers();
    const ip =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      "unknown";
    const rate = checkRateLimit(`attachment:${user.id}:${ip}`);
    if (!rate.allowed) {
      return Response.json(
        { error: "Muitos uploads em pouco tempo.", requestId },
        {
          status: 429,
          headers: {
            "Retry-After": String(rate.retryAfter),
            "X-Request-ID": requestId,
          },
        },
      );
    }

    const contentLength = Number(headerStore.get("content-length") ?? 0);
    const maxSingle = Math.max(
      mediaConfig.maxImageSizeBytes,
      mediaConfig.maxAudioSizeBytes,
      mediaConfig.maxDocumentSizeBytes,
    );
    if (contentLength > maxSingle * MAX_ATTACHMENTS_PER_MESSAGE + 1_000_000) {
      return Response.json(
        { error: "O conjunto de arquivos excede o limite permitido.", requestId },
        { status: 413, headers: { "X-Request-ID": requestId } },
      );
    }

    const formData = await request.formData();
    const conversationId = conversationSchema.parse(formData.get("conversationId"));
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    if (!files.length || files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      return Response.json(
        {
          error: `Envie de 1 a ${MAX_ATTACHMENTS_PER_MESSAGE} arquivos por mensagem.`,
          requestId,
        },
        { status: 400, headers: { "X-Request-ID": requestId } },
      );
    }

    if (user.demo) {
      const attachments = [];
      for (const file of files) {
        const type = inferAttachmentTypeFromMimeType(file.type);
        if (!type) {
          throw new Error("Use imagem, audio ou documento suportado.");
        }
        await validateMediaFile(file, type);
        attachments.push({
          id: crypto.randomUUID(),
          type,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          url: "",
        });
      }
      return Response.json(
        { mode: "demo", attachments },
        { headers: { "X-Request-ID": requestId } },
      );
    }

    logServerEvent({
      level: "info",
      requestId,
      route: "/api/attachments",
      event: "attachment_upload_started",
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    const attachments = [];
    try {
      for (const file of files) {
        const type = inferAttachmentTypeFromMimeType(file.type);
        if (!type) {
          throw new Error("Use imagem, audio ou documento suportado.");
        }
        attachments.push(
          await storeAttachment({
            userId: user.id,
            conversationId,
            file,
            type,
          }),
        );
      }
    } catch (error) {
      await Promise.allSettled(
        attachments.map((attachment) => deleteOwnedAttachment(user.id, attachment.id)),
      );
      throw error;
    }

    logServerEvent({
      level: "info",
      requestId,
      route: "/api/attachments",
      event: "attachment_upload_completed",
      status: 201,
      durationMs: Date.now() - startedAt,
    });
    return Response.json(
      { attachments, mode: "supabase" },
      { status: 201, headers: { "X-Request-ID": requestId } },
    );
  } catch (error) {
    const message =
      error instanceof ZodError
        ? "A conversa informada e invalida."
        : error instanceof Error &&
            ["CONVERSATION_NOT_FOUND", "ATTACHMENT_NOT_SAVED"].includes(error.message)
          ? "Nao foi possivel associar o arquivo a conversa."
          : "Nao foi possivel enviar o arquivo.";
    const status =
      error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 400;
    logServerEvent({
      level: "warn",
      requestId,
      route: "/api/attachments",
      event: "attachment_upload_failed",
      status,
      durationMs: Date.now() - startedAt,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: message, requestId },
      { status, headers: { "X-Request-ID": requestId } },
    );
  }
}
