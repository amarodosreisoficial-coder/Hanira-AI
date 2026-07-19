"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import {
  ArrowUp,
  Camera,
  FileAudio,
  ImagePlus,
  LoaderCircle,
  Mic,
  Square,
  X,
} from "lucide-react";
import { PrivacyDialog } from "@/components/media/privacy-dialog";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { useAutoResize } from "@/hooks/use-auto-resize";
import {
  MAX_IMAGES_PER_MESSAGE,
  mediaConfig,
} from "@/lib/media/config";
import { useChatStore } from "@/lib/stores/chat-store";
import { validateMediaFile } from "@/lib/validation/media";
import { streamChatMessage } from "@/services/chat-service";
import { uploadMediaFiles } from "@/services/media-service";
import type { ChatMessage } from "@/types/chat";
import type { Attachment } from "@/types/media";
import type { UserSettings } from "@/types/settings";

interface PendingMedia {
  id: string;
  file: File;
  type: "image" | "audio";
  previewUrl: string;
  attachment?: Attachment;
}

export function ChatComposer({ settings }: { settings: UserSettings }) {
  const [error, setError] = useState("");
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [privacyKind, setPrivacyKind] = useState<
    "camera" | "microphone" | null
  >(null);
  const abortRef = useRef<AbortController | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { ref, resize } = useAutoResize();
  const store = useChatStore();

  async function ensureConversation() {
    if (!store.activeConversation()) await store.newConversation();
    return useChatStore.getState().activeConversation();
  }

  async function addImages(files: File[]) {
    setError("");
    if (!mediaConfig.visionEnabled) {
      setError("A visão está desativada na configuração do produto.");
      return;
    }
    const currentImages = pendingMedia.filter(
      (item) => item.type === "image",
    ).length;
    const available = MAX_IMAGES_PER_MESSAGE - currentImages;
    if (files.length > available) {
      setError(`Você pode enviar até ${MAX_IMAGES_PER_MESSAGE} imagens.`);
      files = files.slice(0, Math.max(0, available));
    }
    const accepted: PendingMedia[] = [];
    for (const file of files) {
      try {
        await validateMediaFile(file, "image");
        if ("createImageBitmap" in window) {
          const bitmap = await createImageBitmap(file);
          bitmap.close();
        }
        accepted.push({
          id: crypto.randomUUID(),
          file,
          type: "image",
          previewUrl: URL.createObjectURL(file),
        });
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Imagem inválida.",
        );
      }
    }
    setPendingMedia((value) => [...value, ...accepted]);
  }

  async function submit(
    contentOverride?: string,
    retry = false,
    attachmentOverride?: Attachment[],
  ) {
    const content = (contentOverride ?? store.draft).trim();
    const hasMedia = pendingMedia.length > 0 || Boolean(attachmentOverride?.length);
    if ((!content && !hasMedia) || store.isThinking || uploading) return;
    const conversation = await ensureConversation();
    if (!conversation) return;

    setError("");
    setUploading(pendingMedia.length > 0);
    const abortController = new AbortController();
    abortRef.current = abortController;
    let attachments = attachmentOverride ?? [];
    let assistantId = "";
    let fullText = "";
    try {
      if (pendingMedia.length) {
        if (store.mode === "supabase") {
          const alreadyStored = pendingMedia
            .map((item) => item.attachment)
            .filter((item): item is Attachment => Boolean(item));
          const filesToUpload = pendingMedia
            .filter((item) => !item.attachment)
            .map((item) => item.file);
          const uploaded = filesToUpload.length
            ? await uploadMediaFiles(
                conversation.id,
                filesToUpload,
                abortController.signal,
              )
            : [];
          attachments = [...alreadyStored, ...uploaded];
        } else {
          attachments = pendingMedia.map((item) => ({
            id: item.attachment?.id ?? item.id,
            type: item.type,
            originalName: item.file.name,
            mimeType: item.file.type,
            sizeBytes: item.file.size,
            url: item.previewUrl,
            metadata: { simulated: true },
          }));
        }
      }

      const now = new Date().toISOString();
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        createdAt: now,
        attachments,
      };
      assistantId = crypto.randomUUID();
      if (!retry) store.addMessage(userMessage);
      store.addMessage({
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: now,
        pending: true,
      });
      setPendingMedia([]);
      store.setDraft("");
      if (ref.current) ref.current.style.height = "0px";
      store.setThinking(true);
      setUploading(false);
      await streamChatMessage(
        {
          conversationId: conversation.id,
          message: content,
          requestId: crypto.randomUUID(),
          retry,
          attachmentIds:
            store.mode === "supabase"
              ? attachments.map((attachment) => attachment.id)
              : undefined,
          demoAttachments:
            store.mode === "demo"
              ? attachments.map((attachment) => ({
                  id: attachment.id,
                  type: attachment.type,
                  originalName: attachment.originalName,
                  mimeType: attachment.mimeType,
                  sizeBytes: attachment.sizeBytes,
                }))
              : undefined,
        },
        {
          onStart: (serverConversationId) => {
            if (serverConversationId !== conversation.id) {
              store.replaceConversationId(
                conversation.id,
                serverConversationId,
              );
            }
          },
          onDelta: (delta) => {
            fullText += delta;
            store.updateMessage(assistantId, fullText, true);
          },
          onDone: () => {
            store.updateMessage(assistantId, fullText, false);
            window.dispatchEvent(
              new CustomEvent("hanira:response-complete", {
                detail: { text: fullText },
              }),
            );
          },
          onError: (message) => {
            setError(message);
            store.markMessageFailed(assistantId);
            window.dispatchEvent(new Event("hanira:response-error"));
          },
        },
        abortController.signal,
      );
      if (!fullText && !abortController.signal.aborted) {
        store.markMessageFailed(assistantId);
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        if (assistantId) {
          if (fullText) store.updateMessage(assistantId, fullText, false);
          else store.removeMessage(assistantId);
        }
        return;
      }
      const message =
        caught instanceof Error
          ? caught.message
          : "Não foi possível enviar sua mensagem.";
      setError(message);
      if (assistantId) store.markMessageFailed(assistantId);
      window.dispatchEvent(new Event("hanira:response-error"));
    } finally {
      abortRef.current = null;
      setUploading(false);
      store.setThinking(false);
    }
  }

  useEffect(() => {
    function retry(event: Event) {
      const detail = (
        event as CustomEvent<{
          content: string;
          assistantId: string;
          attachments?: Attachment[];
        }>
      ).detail;
      store.removeMessage(detail.assistantId);
      void submit(detail.content, true, detail.attachments);
    }
    function voiceSubmit(event: Event) {
      const detail = (event as CustomEvent<{ content: string }>).detail;
      store.setDraft(detail.content);
      void submit(detail.content);
    }
    function stopResponse() {
      abortRef.current?.abort();
    }
    window.addEventListener("hanira:retry", retry);
    window.addEventListener("hanira:voice-submit", voiceSubmit);
    window.addEventListener("hanira:stop-response", stopResponse);
    return () => {
      window.removeEventListener("hanira:retry", retry);
      window.removeEventListener("hanira:voice-submit", voiceSubmit);
      window.removeEventListener("hanira:stop-response", stopResponse);
    };
  });

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (images.length) {
      event.preventDefault();
      void addImages(images);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const images = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (images.length) void addImages(images);
  }

  async function dismissPrivacy(dismiss: boolean) {
    if (!dismiss) return;
    window.localStorage.setItem("hanira-media-privacy", "dismissed");
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privacyNoticeDismissed: true }),
    }).catch(() => undefined);
  }

  async function requestMediaAccess(kind: "camera" | "microphone") {
    await ensureConversation();
    const dismissed =
      settings.privacyNoticeDismissed ||
      window.localStorage.getItem("hanira-media-privacy") === "dismissed";
    if (!dismissed) {
      setPrivacyKind(kind);
      return;
    }
    if (kind === "camera") cameraInputRef.current?.click();
    else setRecorderOpen(true);
  }

  async function removePending(item: PendingMedia) {
    if (item.attachment && store.mode === "supabase") {
      await fetch(`/api/attachments/${item.attachment.id}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    URL.revokeObjectURL(item.previewUrl);
    setPendingMedia((value) => value.filter((entry) => entry.id !== item.id));
  }

  const canSend =
    Boolean(store.draft.trim() || pendingMedia.length) &&
    !uploading &&
    !store.isThinking;

  return (
    <>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="mx-auto w-full max-w-3xl px-4 pb-5 sm:px-6"
      >
        {error && (
          <p role="alert" className="mb-2 text-center text-xs text-rose-300">
            {error}
          </p>
        )}
        {recorderOpen && (
          <div className="mb-3">
            <VoiceRecorder
              compact
              conversationId={store.activeConversation()?.id}
              onCancel={() => setRecorderOpen(false)}
              onComplete={({ text, attachment, localFile, simulated }) => {
                const previewUrl = URL.createObjectURL(localFile);
                setPendingMedia((value) => [
                  ...value,
                  {
                    id: attachment?.id ?? crypto.randomUUID(),
                    file: localFile,
                    type: "audio",
                    previewUrl,
                    attachment: attachment ?? undefined,
                  },
                ]);
                store.setDraft(
                  `${store.draft}${store.draft ? " " : ""}${text}`.trim(),
                );
                if (simulated) {
                  setError(
                    "Transcrição simulada no modo demonstração. Revise antes de enviar.",
                  );
                }
                setRecorderOpen(false);
              }}
            />
          </div>
        )}
        <div className="rounded-[1.4rem] border border-white/[0.11] bg-[#121014] p-2 shadow-[0_20px_70px_rgba(0,0,0,.35)] transition focus-within:border-violet-400/30 focus-within:ring-4 focus-within:ring-violet-500/[0.04]">
          {pendingMedia.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-2 pb-2 pt-1">
              {pendingMedia.map((item) => (
                <div
                  key={item.id}
                  className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/25"
                >
                  {item.type === "image" ? (
                    <Image
                      src={item.previewUrl}
                      alt={item.file.name}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-violet-300">
                      <FileAudio className="size-5" />
                      <span className="absolute bottom-2 max-w-20 truncate text-[9px] text-zinc-500">
                        {item.file.name}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void removePending(item)}
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/75 text-white"
                    aria-label={`Remover ${item.file.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={ref}
            value={store.draft}
            rows={1}
            maxLength={8_000}
            aria-label="Mensagem para Hanira"
            placeholder={
              pendingMedia.length ? "Pergunte sobre o arquivo..." : "Converse com Hanira..."
            }
            onChange={(event) => {
              store.setDraft(event.target.value);
              resize();
            }}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            className="block min-h-12 w-full resize-none bg-transparent px-3 py-3 text-[15px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <input
            ref={imageInputRef}
            type="file"
            hidden
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              void addImages(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            onChange={(event) => {
              void addImages(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <div className="flex items-center justify-between px-1 pb-1">
            <div className="flex items-center">
              <button
                type="button"
                disabled={!mediaConfig.visionEnabled}
                onClick={() => imageInputRef.current?.click()}
                aria-label="Adicionar imagem"
                title="Adicionar imagem"
                className="rounded-xl p-2.5 text-zinc-500 transition hover:bg-white/[0.05] hover:text-violet-300 disabled:text-zinc-700"
              >
                <ImagePlus className="size-[18px]" />
              </button>
              <button
                type="button"
                disabled={!mediaConfig.visionEnabled}
                onClick={() => void requestMediaAccess("camera")}
                aria-label="Tirar foto"
                title="Tirar foto"
                className="rounded-xl p-2.5 text-zinc-500 transition hover:bg-white/[0.05] hover:text-violet-300 disabled:text-zinc-700"
              >
                <Camera className="size-[18px]" />
              </button>
              <button
                type="button"
                disabled={
                  !mediaConfig.voiceEnabled ||
                  !settings.voiceEnabled ||
                  !settings.transcriptionEnabled
                }
                onClick={() => void requestMediaAccess("microphone")}
                aria-label="Gravar voz"
                title={
                  settings.voiceEnabled
                    ? "Gravar voz"
                    : "Ative a voz nas configurações"
                }
                className="rounded-xl p-2.5 text-zinc-500 transition hover:bg-white/[0.05] hover:text-violet-300 disabled:text-zinc-700"
              >
                <Mic className="size-[18px]" />
              </button>
            </div>
            {store.isThinking ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Interromper resposta"
                className="grid size-9 place-items-center rounded-xl bg-white text-black transition hover:bg-rose-100"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSend}
                aria-label="Enviar mensagem"
                className="grid size-9 place-items-center rounded-xl bg-white text-black transition hover:bg-violet-100 disabled:bg-white/[0.07] disabled:text-zinc-700"
              >
                {uploading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </button>
            )}
          </div>
        </div>
        <p className="mt-2.5 text-center text-[10px] text-zinc-700">
          Hanira pode cometer erros. Considere verificar informações importantes.
        </p>
      </div>
      <PrivacyDialog
        open={privacyKind !== null}
        kind={privacyKind ?? "microphone"}
        onClose={() => setPrivacyKind(null)}
        onAccept={(dismiss) => {
          const kind = privacyKind;
          setPrivacyKind(null);
          void dismissPrivacy(dismiss);
          if (kind === "camera") cameraInputRef.current?.click();
          if (kind === "microphone") setRecorderOpen(true);
        }}
      />
    </>
  );
}
