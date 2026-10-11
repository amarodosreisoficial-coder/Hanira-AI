import { describe, expect, it } from "vitest";
import {
  STT_ACCEPTED_AUDIO_MIME_TYPES,
  STT_RECORDER_MIME_CANDIDATES,
  audioContainerFamilyOfMime,
  audioExtensionForMimeType,
  detectAudioContainerFamily,
  isSupportedSttAudioMimeType,
  normalizeAudioMimeType,
  resolveRecordedAudioFormat,
  selectRecorderMimeType,
} from "@/lib/media/audio-format";
import { SttAudioValidationError, STT_MAX_AUDIO_BYTES, validateSttAudio } from "@/lib/validation/stt-audio";

// Bytes mágicos reais por container.
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);
const OGG = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]); // "OggS"
const MP4 = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); // "ftyp" no offset 4

// Simula o conjunto de MIME suportados por um navegador/dispositivo.
const supports = (...mimes: string[]) => (candidate: string) =>
  mimes.some((m) => candidate === m || candidate.startsWith(`${m};`));

describe("STT MIME negotiation (audio-format)", () => {
  it("Chrome/Android-like: escolhe WebM/Opus primeiro quando suportado", () => {
    const chosen = selectRecorderMimeType(
      supports("audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"),
    );
    expect(chosen).toBe("audio/webm;codecs=opus");
  });

  it("Safari/iOS-like: escolhe MP4 quando só MP4/M4A existem", () => {
    expect(selectRecorderMimeType(supports("audio/mp4"))).toBe("audio/mp4");
  });

  it("Safari/iOS-like: prefere MP4 com codec AAC se for o único anunciado", () => {
    expect(selectRecorderMimeType(supports("audio/mp4;codecs=mp4a.40.2"))).toBe("audio/mp4;codecs=mp4a.40.2");
  });

  it("OGG: escolhe OGG/Opus quando é o formato disponível", () => {
    expect(selectRecorderMimeType(supports("audio/ogg;codecs=opus"))).toBe("audio/ogg;codecs=opus");
  });

  it("nenhum formato suportado retorna vazio (fluxo falha de forma segura)", () => {
    expect(selectRecorderMimeType(() => false)).toBe("");
  });

  it("sonda isTypeSupported que lança é tratada como não suportada", () => {
    const throwing = ((mime: string) => {
      if (mime === "audio/webm;codecs=opus") throw new Error("not supported");
      return mime === "audio/mp4";
    }) as (mime: string) => boolean;
    expect(selectRecorderMimeType(throwing)).toBe("audio/mp4");
  });

  it("expõe a lista de candidatos na ordem de prioridade esperada", () => {
    expect(STT_RECORDER_MIME_CANDIDATES[0]).toBe("audio/webm;codecs=opus");
    expect(STT_RECORDER_MIME_CANDIDATES).toContain("audio/mp4");
    expect(STT_RECORDER_MIME_CANDIDATES).toContain("audio/x-m4a");
    expect(STT_RECORDER_MIME_CANDIDATES).toContain("audio/m4a");
  });
});

describe("STT MIME normalization e extensão", () => {
  it("normaliza MIME com codecs, espaços e maiúsculas", () => {
    expect(normalizeAudioMimeType("Audio/MP4;codecs=mp4a.40.2")).toBe("audio/mp4");
    expect(normalizeAudioMimeType("  audio/WEBM ; codecs=opus ")).toBe("audio/webm");
    expect(normalizeAudioMimeType("")).toBe("");
    expect(normalizeAudioMimeType(undefined)).toBe("");
  });

  it("mapeia extensão correta por MIME", () => {
    expect(audioExtensionForMimeType("audio/webm")).toBe("webm");
    expect(audioExtensionForMimeType("audio/webm;codecs=opus")).toBe("webm");
    expect(audioExtensionForMimeType("audio/ogg")).toBe("ogg");
    expect(audioExtensionForMimeType("audio/mp4")).toBe("mp4");
    expect(audioExtensionForMimeType("audio/x-m4a")).toBe("m4a");
    expect(audioExtensionForMimeType("audio/m4a")).toBe("m4a");
  });

  it("MIME vazio ou desconhecido não resulta em extensão (sem inventar webm)", () => {
    expect(audioExtensionForMimeType("")).toBe("");
    expect(audioExtensionForMimeType("audio/flac")).toBe("");
    expect(audioExtensionForMimeType("video/webm")).toBe("");
  });

  it("reconhece allow-list de MIME aceitos", () => {
    expect(STT_ACCEPTED_AUDIO_MIME_TYPES).toContain("audio/m4a");
    expect(isSupportedSttAudioMimeType("audio/mp4;codecs=mp4a.40.2")).toBe(true);
    expect(isSupportedSttAudioMimeType("audio/wav")).toBe(false);
  });
});

describe("STT resolução do formato efetivo do blob", () => {
  it("o tipo real reportado pelo MediaRecorder prevalece sobre o solicitado", () => {
    expect(resolveRecordedAudioFormat("audio/mp4", "audio/webm")).toEqual({ mimeType: "audio/mp4", extension: "mp4" });
  });

  it("recorre ao MIME solicitado quando o reportado é vazio", () => {
    expect(resolveRecordedAudioFormat("", "audio/ogg;codecs=opus")).toEqual({ mimeType: "audio/ogg", extension: "ogg" });
  });

  it("retorna null quando nenhum dos dois é determinado com segurança", () => {
    expect(resolveRecordedAudioFormat("", "")).toBeNull();
    expect(resolveRecordedAudioFormat("audio/foo", "")).toBeNull();
  });
});

describe("STT detecção de container por bytes mágicos", () => {
  it("classifica webm, ogg e mp4/m4a", () => {
    expect(detectAudioContainerFamily(WEBM)).toBe("webm");
    expect(detectAudioContainerFamily(OGG)).toBe("ogg");
    expect(detectAudioContainerFamily(MP4)).toBe("mp4");
  });

  it("familia de MIME coerente com a detecção", () => {
    expect(audioContainerFamilyOfMime("audio/webm;codecs=opus")).toBe("webm");
    expect(audioContainerFamilyOfMime("audio/ogg")).toBe("ogg");
    expect(audioContainerFamilyOfMime("audio/mp4")).toBe("mp4");
    expect(audioContainerFamilyOfMime("audio/x-m4a")).toBe("mp4");
    expect(audioContainerFamilyOfMime("audio/m4a")).toBe("mp4");
  });

  it("bytes desconhecidos ou curtos não são classificados", () => {
    expect(detectAudioContainerFamily(new Uint8Array([0x00, 0x01, 0x02]))).toBe("");
    expect(detectAudioContainerFamily(new Uint8Array())).toBe("");
  });
});

describe("STT validação server-side fail-closed", () => {
  it("aceita webm, ogg, mp4 e m4a com assinatura real", async () => {
    expect((await validateSttAudio(new File([WEBM], "a.webm", { type: "audio/webm" }))).byteLength).toBe(WEBM.length);
    expect((await validateSttAudio(new File([OGG], "a.ogg", { type: "audio/ogg" }))).byteLength).toBe(OGG.length);
    expect((await validateSttAudio(new File([MP4], "a.mp4", { type: "audio/mp4" }))).byteLength).toBe(MP4.length);
    expect((await validateSttAudio(new File([MP4], "a.m4a", { type: "audio/x-m4a" }))).byteLength).toBe(MP4.length);
  });

  it("aceita MIME declarado com codecs desde que a assinatura bata", async () => {
    const file = new File([MP4], "a.mp4", { type: "audio/mp4;codecs=mp4a.40.2" });
    expect((await validateSttAudio(file)).byteLength).toBe(MP4.length);
  });

  it("rejeita assinatura incompatível com o MIME declarado (anti-spoofing)", async () => {
    await expect(validateSttAudio(new File([OGG], "a.webm", { type: "audio/webm" }))).rejects.toMatchObject({ code: "unsupported_format" });
    await expect(validateSttAudio(new File([WEBM], "a.mp4", { type: "audio/mp4" }))).rejects.toMatchObject({ code: "unsupported_format" });
    await expect(validateSttAudio(new File([MP4], "a.ogg", { type: "audio/ogg" }))).rejects.toMatchObject({ code: "unsupported_format" });
  });

  it("rejeita MIME fora da allow-list mesmo com bytes plausíveis", async () => {
    await expect(validateSttAudio(new File([WEBM], "a.bin", { type: "application/octet-stream" }))).rejects.toBeInstanceOf(SttAudioValidationError);
    await expect(validateSttAudio(new File([new Uint8Array([1, 2, 3, 4])], "a.wav", { type: "audio/wav" }))).rejects.toMatchObject({ code: "unsupported_format" });
  });

  it("mantém o teto de 4 MiB protegido", async () => {
    const oversized = new Uint8Array(STT_MAX_AUDIO_BYTES + 1);
    await expect(validateSttAudio(new File([oversized], "a.webm", { type: "audio/webm" }))).rejects.toMatchObject({ code: "payload_too_large" });
  });

  it("rejeita arquivo vazio", async () => {
    await expect(validateSttAudio(new File([], "a.webm", { type: "audio/webm" }))).rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("STT garantias de fluxo (sem regressão desktop)", () => {
  it("desktop (todos os formatos) continua escolhendo WebM/Opus — sem regressão", () => {
    expect(selectRecorderMimeType(() => true)).toBe("audio/webm;codecs=opus");
  });

  it("nenhuma escolha de gravação depende de user-agent, só de capacidade", () => {
    const order = STT_RECORDER_MIME_CANDIDATES;
    expect(selectRecorderMimeType(supports("audio/mp4"), order)).toBe("audio/mp4");
    expect(selectRecorderMimeType(supports("audio/webm;codecs=opus"), order)).toBe("audio/webm;codecs=opus");
  });
});

