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
  Sparkles,
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
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_DOCUMENTS_PER_MESSAGE,
  MAX_IMAGES_PER_MESSAGE,
  mediaConfig,
} from "@/lib/media/config";
import { useChatStore } from "@/lib/stores/chat-store";
import { resolveNiraRuntimeState } from "@/lib/chat/runtime-state";
import { toChatIssue, type ChatIssue } from "@/lib/chat/chat-errors";
import {
  inferAttachmentTypeFromMimeType,
  validateMediaFile,
} from "@/lib/validation/media";
import { streamChatMessage } from "@/services/chat-service";
import { uploadMediaFiles } from "@/services/media-service";
import { generateImage, imageGenerationErrorMessage, type ImageReferenceDraft } from "@/services/image-service";
import { ImageComposerOptions } from "@/components/chat/image-composer-options";
import { resolveComposerIntent, type ComposerMode } from "@/lib/chat/composer-intent";
import { IMAGE_ASPECT_RATIO_PRESETS, type ImageAspectRatioPreset } from "@/lib/ai/image/aspect-ratios";
import { IMAGE_REFERENCE_MAX_COUNT } from "@/lib/validation/image-request";
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
  const [composerMode, setComposerMode] = useState<ComposerMode>("text");
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatioPreset>("1:1");
  const [imageReferences, setImageReferences] = useState<ImageReferenceDraft[]>([]);
  const [imageReferenceInputKey, setImageReferenceInputKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const imageGenerationAbortRef = useRef<AbortController | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const imageReferenceInputRef = useRef<HTMLInputElement>(null);
  const { ref, resize } = useAutoResize();
  const store = useChatStore();
  const messageLength = getChatMessageLength(store.draft);
  const remainingCharacters = getRemainingChatMessageCharacters(store.draft);
  const showOperationalIssue = Boolean(
    issue && !store.activeConversation()?.messages.some((message) => message.failed),
  );

  const effectiveIntent = resolveComposerIntent({ mode: composerMode, draft: store.draft });
  const isImageMode = composerMode === "image";
  const isGeneratingImage = effectiveIntent === "image" && store.isThinking;

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

  useEffect(() => {
    const handleRegenerate = (event: Event) => {
      const detail = (event as CustomEvent<{
        assistantId: string;
        prompt: string;
        aspectRatio: ImageAspectRatioPreset;
        references: ImageReferenceDraft[];
      }>).detail;
      setComposerMode("image");
      setImageAspectRatio(detail.aspectRatio);
      void handleImageGeneration({
        prompt: detail.prompt,
        aspectRatio: detail.aspectRatio,
        references: detail.references,
        assistantId: detail.assistantId,
      });
    };
    window.addEventListener("hanira:regenerate-image", handleRegenerate);
    return () => window.removeEventListener("hanira:regenerate-image", handleRegenerate);
  }, []);

  async function handleImageGeneration(options: {
    prompt: string;
    aspectRatio: ImageAspectRatioPreset;
    references: ImageReferenceDraft[];
    assistantId?: string;
  }) {
    const { prompt, aspectRatio, references, assistantId } = options;
    setError("");
    setIssue(null);
    const conversation = await ensureConversation();
    if (!conversation) {
      setError("Não foi possível iniciar uma conversa.");
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      createdAt: new Date().toISOString(),
    };
    store.addMessage(userMessage);

    const assistantIdToUse =
      assistantId ??
      crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantIdToUse,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      pending: true,
      imageGeneration: {
        status: "generating",
        prompt,
        aspectRatio,
        references,
      },
    };
    store.addMessage(assistantMessage);
    store.setThinking(true);

    const abortController = new AbortController();
    imageGenerationAbortRef.current = abortController;

    try {
      const result = await generateImage(
        { prompt, aspectRatio, references },
        abortController.signal,
      );
      store.updateImageGeneration(assistantIdToUse, {
        status: "ready",
        prompt,
        aspectRatio,
        references,
        result,
      });
    } catch (error) {
      if (abortController.signal.aborted) return;
      const errorCode =
        error instanceof Error && error.message === "capacity_unavailable"
          ? "capacity_unavailable"
          : "generation_unavailable";
      store.updateImageGeneration(assistantIdToUse, {
        status: "error",
        prompt,
        aspectRatio,
        references,
        errorMessage: imageGenerationErrorMessage(errorCode),
      });
    } finally {
      store.setThinking(false);
      imageGenerationAbortRef.current = null;
    }
  }

  function exitImageMode() {
    setComposerMode("text");
    setImageReferences([]);
    setImageReferenceInputKey((value) => value + 1);
  }

  function handlePickImageReferences() {
    imageReferenceInputRef.current?.click();
  }

  function handleImageReferenceFiles(files: File[]) {
    const accepted: ImageReferenceDraft[] = [];
    for (const file of files) {
      if (
        !ACCEPTED_IMAGE_MIME_TYPES.includes(
          file.type as (typeof ACCEPTED_IMAGE_MIME_TYPES)[number],
        ) ||
        !file.size ||
        file.size > mediaConfig.maxImageSizeBytes
      ) {
        setMessage("Use PNG, JPEG ou WebP dentro do limite permitido.");
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (imageReferences.length + accepted.length > IMAGE_REFERENCE_MAX_COUNT) {
      accepted.forEach((ref) => URL.revokeObjectURL(ref.previewUrl));
      setMessage("Você pode usar até 4 imagens de referência.");
      return;
    }
    setImageReferences((current) => [...current, ...accepted]);
  }

  function handleRemoveImageReference(reference: ImageReferenceDraft) {
    URL.revokeObjectURL(reference.previewUrl);
    setImageReferences((current) => current.filter((ref) => ref.id !== reference.id));
  }

  function setMessage(message: string) {
    setError(message);
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

    // Pacote 17.4: roteamento determinístico de intent de imagem.
    // Se o modo imagem estiver ativo ou o texto for um pedido claro de imagem,
    // roteamos para o gerador de imagens em vez do chat de texto.
    const intent = resolveComposerIntent({ mode: composerMode, draft: content });
    if (intent === "image" && !retry) {
      void handleImageGeneration({
        prompt: content,
        aspectRatio: imageAspectRatio,
        references: imageReferences,
      });
      setPendingMedia([]);
      store.setDraft("");
      if (ref.current) ref.current.style.height = "0px";
      exitImageMode();
      return;
    }

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
          onStart: (serverConversationId, meta) => {
            if (serverConversationId !== conversation.id) {
              store.replaceConversationId(conversation.id, serverConversationId);
            }
            // Pacote 16.4: badge de runtime deriva de evidencia real do
            // stream (mode/profile), nunca de texto estatico na UI.
            store.setRuntimeState(
              resolveNiraRuntimeState({
                mode: meta?.mode,
                niraProfileId: meta?.profile,
              }),
            );
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

  const canSendImage = isImageMode && Boolean(store.draft.trim()) && !store.isThinking;

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
        <div className="compose-surface nira-composer rounded-[1.15rem] bg-composer px-3 py-2.5 focus-within:outline-none">
          {pendingMedia.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-1 pb-2 pt-1">
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
                        className="block h-10 w-full resize-none bg-transparent px-2 py-2.5 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/65"
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
          <input
            key={imageReferenceInputKey}
            ref={imageReferenceInputRef}
            type="file"
            hidden
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              void handleImageReferenceFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          {isImageMode && (
            <ImageComposerOptions
              aspectRatio={imageAspectRatio}
              references={imageReferences}
              busy={store.isThinking}
              onExit={exitImageMode}
              onRatioChange={setImageAspectRatio}
              onPickReferences={handlePickImageReferences}
              onRemoveReference={handleRemoveImageReference}
            />
          )}
          <div className="flex items-center justify-between px-1 pb-1">
            <div className="flex items-center">
              {!isImageMode && (
                <button
                  type="button"
                  onClick={() => setComposerMode("image")}
                  aria-label="Criar imagem"
                  title="Criar imagem"
                  className="rounded-xl p-2.5 text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <ImagePlus className="size-[18px]" />
                    Criar imagem
                  </span>
                </button>
              )}
              {!isImageMode && (
                <button
                  type="button"
                  disabled={!mediaConfig.attachmentsEnabled}
                  onClick={() => documentInputRef.current?.click()}
                  aria-label="Adicionar documento"
                  title="Adicionar documento"
                  className="rounded-xl p-2.5 text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground disabled:text-zinc-700"
                >
                  <Paperclip className="size-[18px]" />
                </button>
              )}
              {!isImageMode && (
                <button
                  type="button"
                  disabled={!mediaConfig.visionEnabled || !mediaConfig.attachmentsEnabled}
                  onClick={() => imageInputRef.current?.click()}
                  aria-label="Adicionar imagem"
                  title="Adicionar imagem"
                  className="rounded-xl p-2.5 text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground disabled:text-zinc-700"
                >
                  <ImagePlus className="size-[18px]" />
                </button>
              )}
              {!isImageMode && (
                <button
                  type="button"
                  disabled={!mediaConfig.visionEnabled || !mediaConfig.attachmentsEnabled}
                  onClick={() => void requestMediaAccess("camera")}
                  aria-label="Tirar foto"
                  title="Tirar foto"
                  className="rounded-xl p-2.5 text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground disabled:text-zinc-700"
                >
                  <Camera className="size-[18px]" />
                </button>
              )}
              {!isImageMode && (
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
                  className="rounded-xl p-2.5 text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground disabled:text-zinc-700"
                >
                  <Mic className="size-[18px]" />
                </button>
              )}
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
                  onClick={() => {
                    abortRef.current?.abort();
                    imageGenerationAbortRef.current?.abort();
                  }}
                  aria-label="Interromper resposta"
                  className="grid size-9 place-items-center rounded-xl bg-foreground text-background transition hover:bg-destructive hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Square className="size-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={isImageMode ? !canSendImage : !canSend}
                  aria-label={isImageMode ? "Gerar imagem" : "Enviar mensagem"}
                  className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_var(--primary-glow)/25] transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
                >
                  {uploading ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : isImageMode ? (
                    <Sparkles className="size-4" />
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
