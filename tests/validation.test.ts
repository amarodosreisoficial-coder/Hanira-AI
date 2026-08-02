import { describe, expect, it } from "vitest";
import {
  CHAT_MESSAGE_LENGTH_ERROR,
  CHAT_MESSAGE_MAX_LENGTH,
} from "../lib/chat/message-limits";
import { chatRequestSchema } from "../lib/validation/chat";

describe("validação do chat", () => {
  it("rejeita mensagem vazia", () => {
    expect(
      chatRequestSchema.safeParse({ message: "   " }).success,
    ).toBe(false);
  });

  it("aceita mensagem exatamente no limite", () => {
    expect(
      chatRequestSchema.safeParse({
        message: "a".repeat(CHAT_MESSAGE_MAX_LENGTH),
      }).success,
    ).toBe(true);
  });

  it("rejeita mensagem acima do limite", () => {
    expect(
      chatRequestSchema.safeParse({
        message: "a".repeat(CHAT_MESSAGE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("retorna erro claro acima do limite", () => {
    const parsed = chatRequestSchema.safeParse({
      message: "a".repeat(CHAT_MESSAGE_MAX_LENGTH + 1),
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(CHAT_MESSAGE_LENGTH_ERROR);
  });

  it("aceita payload idempotente e retry", () => {
    expect(
      chatRequestSchema.safeParse({
        message: "Olá",
        conversationId: "00000000-0000-4000-8000-000000000001",
        requestId: "00000000-0000-4000-8000-000000000002",
        retry: true,
      }).success,
    ).toBe(true);
  });

  it("aceita imagem sem texto e limita quatro anexos", () => {
    const ids = [
      "00000000-0000-4000-8000-000000000010",
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000012",
      "00000000-0000-4000-8000-000000000013",
    ];
    expect(
      chatRequestSchema.safeParse({ message: "", attachmentIds: ids }).success,
    ).toBe(true);
    expect(
      chatRequestSchema.safeParse({
        message: "",
        attachmentIds: [...ids, "00000000-0000-4000-8000-000000000014"],
      }).success,
    ).toBe(false);
  });
});
