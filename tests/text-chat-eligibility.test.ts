import { describe, expect, it } from "vitest";
import { shouldUseTextAIProvider } from "../lib/ai/runtime/text-chat-eligibility";

describe("text chat eligibility", () => {
  it("rejeita quando a flag está desligada", () => {
    expect(
      shouldUseTextAIProvider({
        featureEnabled: false,
        hasImage: false,
        hasAttachments: false,
        hasMultimodalContent: false,
      }),
    ).toMatchObject({ eligible: false, reason: "feature_disabled" });
  });

  it("aceita texto simples elegível", () => {
    expect(
      shouldUseTextAIProvider({
        featureEnabled: true,
        hasImage: false,
        hasAttachments: false,
        hasMultimodalContent: false,
        requiredCapabilities: ["chat"],
        supportedCapabilities: ["chat", "streaming"],
      }),
    ).toMatchObject({ eligible: true, reason: "eligible" });
  });

  it("rejeita imagem", () => {
    expect(
      shouldUseTextAIProvider({
        featureEnabled: true,
        hasImage: true,
        hasAttachments: false,
        hasMultimodalContent: false,
      }),
    ).toMatchObject({ eligible: false, reason: "has_image" });
  });

  it("rejeita anexo", () => {
    expect(
      shouldUseTextAIProvider({
        featureEnabled: true,
        hasImage: false,
        hasAttachments: true,
        hasMultimodalContent: false,
      }),
    ).toMatchObject({ eligible: false, reason: "has_attachments" });
  });

  it("rejeita conteúdo multimodal", () => {
    expect(
      shouldUseTextAIProvider({
        featureEnabled: true,
        hasImage: false,
        hasAttachments: false,
        hasMultimodalContent: true,
      }),
    ).toMatchObject({ eligible: false, reason: "has_multimodal_content" });
  });

  it("rejeita capability ausente", () => {
    expect(
      shouldUseTextAIProvider({
        featureEnabled: true,
        hasImage: false,
        hasAttachments: false,
        hasMultimodalContent: false,
        requiredCapabilities: ["chat", "tool-calls"],
        supportedCapabilities: ["chat"],
      }),
    ).toMatchObject({
      eligible: false,
      reason: "missing_capability",
      missingCapabilities: ["tool-calls"],
    });
  });
});
