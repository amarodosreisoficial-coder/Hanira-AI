import { describe, expect, it } from "vitest";
import { buildStoragePath } from "../lib/media/storage-path";
import {
  speechRequestSchema,
  validateMediaFile,
} from "../lib/validation/media";
import { mediaConfig } from "../lib/media/config";

function validPng() {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  return new File([bytes], "imagem.png", { type: "image/png" });
}

describe("validação segura de mídia", () => {
  it("aceita PNG coerente e rejeita MIME executável", async () => {
    await expect(validateMediaFile(validPng(), "image")).resolves.toMatchObject(
      { extension: "png", mimeType: "image/png" },
    );
    const executable = new File([new Uint8Array([0x4d, 0x5a])], "foto.png", {
      type: "application/x-msdownload",
    });
    await expect(validateMediaFile(executable, "image")).rejects.toThrow(
      "PNG, JPEG ou WEBP",
    );
  });

  it("rejeita arquivo vazio, extensão divergente e imagem corrompida", async () => {
    await expect(
      validateMediaFile(new File([], "vazia.png", { type: "image/png" }), "image"),
    ).rejects.toThrow("vazio");
    await expect(
      validateMediaFile(
        new File([await validPng().arrayBuffer()], "imagem.jpg", {
          type: "image/png",
        }),
        "image",
      ),
    ).rejects.toThrow("extensão");
    await expect(
      validateMediaFile(
        new File([new Uint8Array(40)], "corrompida.png", {
          type: "image/png",
        }),
        "image",
      ),
    ).rejects.toThrow("corrompida");
  });

  it("bloqueia áudio acima do limite antes de ler seu conteúdo", async () => {
    const oversized = {
      name: "grande.webm",
      type: "audio/webm",
      size: mediaConfig.maxAudioSizeBytes + 1,
      arrayBuffer: () => {
        throw new Error("não deveria ler");
      },
    } as unknown as File;
    await expect(validateMediaFile(oversized, "audio")).rejects.toThrow(
      "limite",
    );
  });

  it("valida texto, voz e velocidade de síntese", () => {
    expect(
      speechRequestSchema.safeParse({
        text: "Olá",
        voice: "alloy",
        speed: 1.2,
      }).success,
    ).toBe(true);
    expect(
      speechRequestSchema.safeParse({
        text: "",
        voice: "desconhecida",
        speed: 5,
      }).success,
    ).toBe(false);
  });

  it("gera caminho isolado e bloqueia traversal", () => {
    const path = buildStoragePath({
      userId: "00000000-0000-4000-8000-000000000001",
      conversationId: "00000000-0000-4000-8000-000000000002",
      fileId: "00000000-0000-4000-8000-000000000003",
      extension: "png",
    });
    expect(path).toBe(
      "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.png",
    );
    expect(() =>
      buildStoragePath({
        userId: "../outro",
        conversationId: "00000000-0000-4000-8000-000000000002",
        fileId: "00000000-0000-4000-8000-000000000003",
        extension: "exe",
      }),
    ).toThrow("INVALID_STORAGE_PATH");
  });
});
