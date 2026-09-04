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
  FileText,
  ImagePlus,
  LoaderCircle,
  Mic,
  Paperclip,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import { PrivacyDialog } from "@/components/media/privacy-dialog";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { useAutoResize } from "@/hooks/use-auto-resize";
import {
  CHAT_MESSAGE_LENGTH_ERROR,
  CHAT_MESSAGE_MAX_LENGTH,
  getChatMessageLength,
  getRemainingChatMessageCharacters,
  isChatMessageTooLong,
  willExceedChatMessageLimit,
} from "@/lib/chat/message-limits";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_DOCUMENTS_PER_MESSAGE,
  MAX_IMAGES_PER_MESSAGE,
  mediaConfig,
} from "@/lib/media/config";
import { useChatStore } from "@/lib/stores/chat-store";
import { toChatIssue, type ChatIssue } from "@/lib/chat/chat-errors";
import {
  inferAttachmentTypeFromMimeType,
  validateMediaFile,
} from "@/lib/validation/media";
import { streamChatMessage } from "@/services/chat-service";
import { uploadMediaFiles } from "@/services/media-service";
import type { ChatMessage } from "@/types/chat";
import type { Attachment, AttachmentType } from "@/types/media";
import type { UserSettings } from "@/types/settings";

interface PendingMedia {
  id: string;
  file: File;
  type: AttachmentType;
  previewUrl: string;
  attachment?: Attachment;
}

function previewUrlForFile(file: File, type: AttachmentType) {
  return type === "image" || type === "audio" ? URL.createObjectURL(file) : "";
}

export function ChatComposer({ settings }: { settings: UserSettings }) {
  const [error, setError] = useState("");
  const [issue, setIssue] = useState<ChatIssue | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [privacyKind, setPrivacyKind] = useState<"camera" | "microphone" | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const { ref, resize } = useAutoResize();
  const store = useChatStore();
  const messageLength = getChatMessageLength(store.draft);
  const remainingCharacters = getRemainingChatMessageCharacters(store.draft);
  const showOperationalIssue = Boolean(
    issue && !store.activeConversation()?.messages.some((message) => message.failed),
  );

  function showMessageLengthError() {
    setError(CHAT_MESSAGE_LENGTH_ERROR);
  }

  function clearMessageLengthError() {
    setError((current) => (current === CHAT_MESSAGE_LENGTH_ERROR ? "" : current));
  }

  async function ensureConversation() {
    if (!store.activeConversation()) await store.newConversation();
    return useChatStore.getState().activeConversation();
  }

  async function addFiles(files: File[]) {
    setError("");
    setIssue(null);
    if (!mediaConfig.attachmentsEnabled) {
      setError("Os anexos estao desativados nesta instancia.");
      return;
    }

    const nextImages =
      pendingMedia.filter((item) => item.type === "image").length +
      files.filter((file) => file.type.startsWith("image/")).length;
    const nextDocuments =
      pendingMedia.filter((item) => item.type === "document").length +
      files.filter((file) =>
        ["application/pdf", "text/plain", "text/markdown"].includes(
          file.type.split(";")[0].toLowerCase(),
        ),
      ).length;
    if (nextImages > MAX_IMAGES_PER_MESSAGE) {
      setError(`Voce pode enviar ate ${MAX_IMAGES_PER_MESSAGE} imagens.`);
      return;
    }
    if (nextDocuments > MAX_DOCUMENTS_PER_MESSAGE) {
      setError(`Voce pode enviar ate ${MAX_DOCUMENTS_PER_MESSAGE} documentos.`);
      return;
    }
    if (pendingMedia.length + files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      setError(`Voce pode enviar ate ${MAX_ATTACHMENTS_PER_MESSAGE} anexos.`);
      return;
    }

    const accepted: PendingMedia[] = [];
    for (const file of files) {
      try {
        const type = inferAttachmentTypeFromMimeType(file.type);
        if (!type) {
          throw new Error("Use imagem, audio ou documento suportado.");
        }
        if (type === "image" && !mediaConfig.visionEnabled) {
          throw new Error("A visao esta desativada na configuracao do produto.");
        }
        await validateMediaFile(file, type);
        if (type === "image" && "createImageBitmap" in window) {
          const bitmap = await createImageBitmap(file);
          bitmap.close();
        }
        accepted.push({
          id: crypto.randomUUID(),
          file,
          type,
          previewUrl: previewUrlForFile(file, type),
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Arquivo invalido.");
      }
    }
    setPendingMedia((value) => [...value, ...accepted]);
  }

  async function submit(
    contentOverride?: string,
    retry = false,
    attachmentOverride?: Attachment[],
  ) {
    const rawContent = contentOverride ?? store.draft;
    if (isChatMessageTooLong(rawContent)) {
      showMessageLengthError();
      return;
    }
    const content = rawContent.trim();
    const hasMedia = pendingMedia.length > 0 || Boolean(attachmentOverride?.length);
    if ((!content && !hasMedia) || store.isThinking || uploading) return;
    const conversation = await ensureConversation();
    if (!conversation) return;

    setError("");
    setIssue(null);
    setUploading(pendingMedia.length > 0);
    const abortController = new AbortController();
    abortRef.current = abortController;
    let attachments = attachmentOverride ?? [];
    let assistantId = "";
    let fullText = "";
    let terminalError = false;
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
            ? await uploadMediaFiles(conversation.id, filesToUpload, abortController.signal)
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
              store.replaceConversationId(conversation.id, serverConversationId);
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
          onError: (streamError) => {
            const nextIssue = toChatIssue(streamError, {
              online: navigator.onLine,
            });
            terminalError = true;
            setIssue(nextIssue);
            setError("");
            store.setDraft(content);
            store.markMessageFailed(assistantId, nextIssue.code);
            window.dispatchEvent(new Event("hanira:response-error"));
          },
        },
        abortController.signal,
      );
      if (!fullText && !abortController.signal.aborted && !terminalError) {
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
      const nextIssue = toChatIssue(caught, {
        online: navigator.onLine,
      });
      setIssue(nextIssue);
      setError("");
      store.setDraft(content);
      if (assistantId) store.markMessageFailed(assistantId, nextIssue.code);
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
      setIssue(null);
      store.removeMessage(detail.assistantId);
      void submit(detail.content, true, detail.attachments);
    }
    function voiceSubmit(event: Event) {
      const detail = (event as CustomEvent<{ content: string }>).detail;
      if (isChatMessageTooLong(detail.content)) {
        showMessageLengthError();
        return;
      }
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
    const target = event.currentTarget;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
      return;
    }

    if (
      event.key === "Enter" &&
      event.shiftKey &&
      willExceedChatMessageLimit(
        target.value,
        "\n",
        target.selectionStart,
        target.selectionEnd,
      )
    ) {
      event.preventDefault();
      showMessageLengthError();
      return;
    }

    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      willExceedChatMessageLimit(
        target.value,
        event.key,
        target.selectionStart,
        target.selectionEnd,
      )
    ) {
      event.preventDefault();
      showMessageLengthError();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (images.length) {
      event.preventDefault();
      void addFiles(images);
      return;
    }

    const pastedText = event.clipboardData.getData("text");
    if (
      pastedText &&
      willExceedChatMessageLimit(
        event.currentTarget.value,
        pastedText,
        event.currentTarget.selectionStart,
        event.currentTarget.selectionEnd,
      )
    ) {
      event.preventDefault();
      showMessageLengthError();
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (files.length) void addFiles(files);
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
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
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
        className="chat-composer-shell relative z-20 mx-auto w-full max-w-[50rem] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-7 sm:pb-5"
      >
        {showOperationalIssue && issue && (
          <div
            id="chat-operational-error"
            role="alert"
            className="mb-2 flex items-start gap-2.5 rounded-xl border border-warning/20 bg-card/95 px-3 py-2.5 shadow-lg shadow-black/10"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">{issue.title}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{issue.message}</p>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mb-2 text-center text-xs text-destructive">
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
                const nextDraft = `${store.draft}${store.draft ? " " : ""}${text}`.trim();
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
                if (isChatMessageTooLong(nextDraft)) {
                  showMessageLengthError();
                } else {
                  clearMessageLengthError();
                  store.setDraft(nextDraft);
                }
                if (simulated) {
                  setError("Transcricao simulada no modo demonstracao. Revise antes de enviar.");
                }
                setRecorderOpen(false);
              }}
            />
          </div>
        )}
        <div className="rounded-[1.4rem] border border-border bg-composer p-2 shadow-[0_18px_60px_rgba(0,0,0,.3)] transition focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/5">
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
                  ) : item.type === "audio" ? (
                    <div className="grid h-full place-items-center text-violet-300">
                      <FileAudio className="size-5" />
                      <span className="absolute bottom-2 max-w-20 truncate text-[9px] text-zinc-500">
                        {item.file.name}
                      </span>
                    </div>
                  ) : (
                    <div className="grid h-full place-items-center text-amber-300">
                      <FileText className="size-5" />
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
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            aria-label="Mensagem para a Nira"
            aria-describedby={
              showOperationalIssue
                ? "chat-message-length chat-operational-error"
                : "chat-message-length"
            }
            placeholder={
              pendingMedia.length ? "Pergunte sobre o arquivo..." : "Converse com a Nira..."
            }
            onChange={(event) => {
              const nextValue = event.target.value;
              store.setDraft(nextValue);
              if (isChatMessageTooLong(nextValue)) showMessageLengthError();
              else clearMessageLengthError();
              resize();
            }}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            className="block min-h-12 w-full resize-none bg-transparent px-3 py-3 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/65"
          />
          <input
            ref={imageInputRef}
            type="file"
            hidden
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <input
            ref={documentInputRef}
            type="file"
            hidden
            multiple
            accept="application/pdf,text/plain,text/markdown,.txt,.md,.markdown,.pdf"
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []));
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
              void addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <div className="flex items-center justify-between px-1 pb-1">
            <div className="flex items-center">
              <button
                type="button"
                disabled={!mediaConfig.attachmentsEnabled}
                onClick={() => documentInputRef.current?.click()}
                aria-label="Adicionar documento"
                title="Adicionar documento"
                className="rounded-xl p-2.5 text-zinc-500 transition hover:bg-white/[0.05] hover:text-amber-300 disabled:text-zinc-700"
              >
                <Paperclip className="size-[18px]" />
              </button>
              <button
                type="button"
                disabled={!mediaConfig.visionEnabled || !mediaConfig.attachmentsEnabled}
                onClick={() => imageInputRef.current?.click()}
                aria-label="Adicionar imagem"
                title="Adicionar imagem"
                className="rounded-xl p-2.5 text-zinc-500 transition hover:bg-white/[0.05] hover:text-violet-300 disabled:text-zinc-700"
              >
                <ImagePlus className="size-[18px]" />
              </button>
              <button
                type="button"
                disabled={!mediaConfig.visionEnabled || !mediaConfig.attachmentsEnabled}
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
                title={settings.voiceEnabled ? "Gravar voz" : "Ative a voz nas configuracoes"}
                className="rounded-xl p-2.5 text-zinc-500 transition hover:bg-white/[0.05] hover:text-violet-300 disabled:text-zinc-700"
              >
                <Mic className="size-[18px]" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span
                id="chat-message-length"
                className={`text-[10px] ${remainingCharacters <= 200 ? "text-warning" : "text-muted-foreground"}`}
              >
                {messageLength}/{CHAT_MESSAGE_MAX_LENGTH}
              </span>
              {store.isThinking ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Interromper resposta"
                  className="grid size-9 place-items-center rounded-xl bg-foreground text-background transition hover:bg-destructive hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Square className="size-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!canSend}
                  aria-label="Enviar mensagem"
                  className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_var(--primary-glow)] transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
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
        </div>
        <p className="mt-2.5 text-center text-[10px] text-muted-foreground/75">
          A Nira pode cometer erros. Verifique informações importantes.
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
