import type { Attachment } from "@/types/media";

export async function uploadMediaFiles(
  conversationId: string,
  files: File[],
  signal?: AbortSignal,
) {
  const formData = new FormData();
  formData.set("conversationId", conversationId);
  for (const file of files) formData.append("files", file);
  const response = await fetch("/api/attachments", {
    method: "POST",
    body: formData,
    signal,
  });
  const data = (await response.json()) as {
    attachments?: Attachment[];
    error?: string;
  };
  if (!response.ok) throw new Error(data.error ?? "Falha ao enviar o arquivo.");
  return data.attachments ?? [];
}

export async function transcribeAudio(
  audio: File,
  conversationId?: string,
  signal?: AbortSignal,
) {
  const formData = new FormData();
  formData.set("audio", audio);
  if (conversationId) formData.set("conversationId", conversationId);
  const response = await fetch("/api/audio/transcribe", {
    method: "POST",
    body: formData,
    signal,
  });
  const data = (await response.json()) as {
    transcript?: string;
    text?: string;
    simulated?: boolean;
    attachment?: Attachment | null;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error ?? "Não foi possível transcrever o áudio.");
  }
  return {
    text: data.transcript ?? data.text ?? "",
    simulated: Boolean(data.simulated),
    attachment: data.attachment ?? null,
  };
}

export async function requestSpeech(
  text: string,
  voice: string,
  speed: number,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed }),
    signal,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(data.error ?? "Não foi possível gerar o áudio.");
  }
  return response.blob();
}
