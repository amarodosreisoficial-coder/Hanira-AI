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
  signal?: AbortSignal,
) {
  const formData = new FormData();
  formData.set("audio", audio);
  const response = await fetch("/api/audio/transcribe", {
    method: "POST",
    body: formData,
    signal,
  });
  const data = (await response.json()) as {
    transcript?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error ?? "Não foi possível transcrever o áudio.");
  }
  if (!data.transcript?.trim()) throw new Error("A transcrição retornou vazia.");
  return data.transcript;
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
