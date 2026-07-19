import { headers } from "next/headers";
import { ZodError, z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { createRequestId, logServerEvent } from "@/lib/logging/server";
import { MAX_IMAGES_PER_MESSAGE } from "@/lib/media/config";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { storeAttachment } from "@/services/attachments";
import { deleteOwnedAttachment } from "@/services/attachments";
import { mediaConfig } from "@/lib/media/config";
import { validateMediaFile } from "@/lib/validation/media";

const conversationSchema = z.uuid();

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = createRequestId(request);
  try {
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
    const maxTotal = mediaConfig.maxImageSizeBytes * MAX_IMAGES_PER_MESSAGE;
    if (contentLength > maxTotal + 1_000_000) {
      return Response.json(
        { error: "O conjunto de arquivos excede o limite permitido.", requestId },
        { status: 413, headers: { "X-Request-ID": requestId } },
      );
    }

    const formData = await request.formData();
    const conversationId = conversationSchema.parse(
      formData.get("conversationId"),
    );
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    if (!files.length || files.length > MAX_IMAGES_PER_MESSAGE) {
      return Response.json(
        { error: `Envie de 1 a ${MAX_IMAGES_PER_MESSAGE} arquivos.`, requestId },
        { status: 400, headers: { "X-Request-ID": requestId } },
      );
    }
    if (files.reduce((total, file) => total + file.size, 0) > maxTotal) {
      return Response.json(
        { error: "O conjunto de arquivos excede o limite permitido.", requestId },
        { status: 413, headers: { "X-Request-ID": requestId } },
      );
    }

    if (user.demo) {
      for (const file of files) {
        await validateMediaFile(
          file,
          file.type.startsWith("image/") ? "image" : "audio",
        );
      }
      return Response.json(
        {
          mode: "demo",
          attachments: files.map((file) => ({
            id: crypto.randomUUID(),
            type: file.type.startsWith("image/") ? "image" : "audio",
            originalName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            url: "",
          })),
        },
        { headers: { "X-Request-ID": requestId } },
      );
    }

    const attachments = [];
    try {
      for (const file of files) {
        const type = file.type.startsWith("image/") ? "image" : "audio";
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
        attachments.map((attachment) =>
          deleteOwnedAttachment(user.id, attachment.id),
        ),
      );
      throw error;
    }
    logServerEvent({
      level: "info",
      requestId,
      route: "/api/attachments",
      event: "attachments_uploaded",
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
        ? "A conversa informada é inválida."
        : error instanceof Error &&
            [
              "CONVERSATION_NOT_FOUND",
              "ATTACHMENT_NOT_SAVED",
            ].includes(error.message)
          ? "Não foi possível associar o arquivo à conversa."
          : error instanceof Error &&
              (error.message.includes("arquivo") ||
                error.message.includes("imagem") ||
                error.message.includes("áudio") ||
                error.message.includes("extensão") ||
                error.message.includes("limite"))
            ? error.message
            : "Não foi possível enviar o arquivo.";
    const status =
      error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 400;
    logServerEvent({
      level: "warn",
      requestId,
      route: "/api/attachments",
      event: "upload_failed",
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
