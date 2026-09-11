import { describe, expect, it } from "vitest";
import {
  buildCapabilitySummary,
  buildNiraProductCapabilities,
  getPublicAICapabilities,
} from "@/lib/ai/public-capabilities";

describe("catálogo público de capacidades da Nira", () => {
  it("mantém ordem canônica e inclui texto e geração de imagem", () => {
    const catalog = buildNiraProductCapabilities({ textConfigured: true, imageConfigured: true });
    expect(catalog.map((item) => item.id)).toEqual([
      "text_chat", "image_generation", "memory", "project_context", "attachments",
      "documents", "current_time", "current_weather", "vision", "transcription", "speech",
    ]);
    expect(catalog.find((item) => item.id === "text_chat")?.status).toBe("available");
    expect(catalog.find((item) => item.id === "image_generation")?.status).toBe("available");
  });

  it("não anuncia flags desativadas nem multimodal legado como disponível", () => {
    const disabled = buildNiraProductCapabilities({ visionEnabled: false, voiceEnabled: false });
    expect(disabled.find((item) => item.id === "vision")?.status).toBe("disabled");
    expect(disabled.find((item) => item.id === "speech")?.status).toBe("disabled");

    const blocked = buildNiraProductCapabilities({ visionEnabled: true, voiceEnabled: true });
    expect(blocked.find((item) => item.id === "vision")?.status).toBe("unavailable");
    expect(blocked.find((item) => item.id === "transcription")?.status).toBe("unavailable");
    expect(blocked.find((item) => item.id === "speech")?.status).toBe("unavailable");
  });

  it("marca documentos como limitados e não promete OCR", () => {
    const documents = buildNiraProductCapabilities({ attachmentsEnabled: true })
      .find((item) => item.id === "documents");
    expect(documents).toMatchObject({ enabled: true, status: "limited" });
    expect(documents?.description).toContain("não oferece OCR completo");
  });

  it("não permite vazamento de provider, modelo ou segredo", () => {
    const output = JSON.stringify(buildNiraProductCapabilities({
      textConfigured: true,
      imageConfigured: true,
      visionEnabled: true,
    }));
    for (const forbidden of ["provider", "model", "api_key", "account_id", "cloudflare", "groq", "openai"]) {
      expect(output.toLocaleLowerCase("pt-BR")).not.toContain(forbidden);
    }
  });

  it("descarta valores secretos ao resolver o ambiente", () => {
    const previousAccount = process.env.CLOUDFLARE_AI_ACCOUNT_ID;
    const previousToken = process.env.CLOUDFLARE_AI_API_TOKEN;
    process.env.CLOUDFLARE_AI_ACCOUNT_ID = "account-super-secret";
    process.env.CLOUDFLARE_AI_API_TOKEN = "token-super-secret";
    try {
      const output = JSON.stringify(getPublicAICapabilities());
      expect(output).not.toContain("account-super-secret");
      expect(output).not.toContain("token-super-secret");
    } finally {
      if (previousAccount === undefined) delete process.env.CLOUDFLARE_AI_ACCOUNT_ID;
      else process.env.CLOUDFLARE_AI_ACCOUNT_ID = previousAccount;
      if (previousToken === undefined) delete process.env.CLOUDFLARE_AI_API_TOKEN;
      else process.env.CLOUDFLARE_AI_API_TOKEN = previousToken;
    }
  });

  it("gera resumo determinístico a partir do catálogo", () => {
    const catalog = buildNiraProductCapabilities({ textConfigured: true, imageConfigured: true });
    expect(buildCapabilitySummary(catalog)).toBe(buildCapabilitySummary(catalog));
    expect(buildCapabilitySummary(catalog)).toContain("imagens");
    expect(buildCapabilitySummary(catalog)).toContain("visão");
  });
});
