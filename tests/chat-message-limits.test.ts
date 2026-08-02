import { describe, expect, it } from "vitest";
import {
  CHAT_MESSAGE_LENGTH_ERROR,
  CHAT_MESSAGE_MAX_LENGTH,
  getChatMessageLength,
  getRemainingChatMessageCharacters,
  isChatMessageTooLong,
  willExceedChatMessageLimit,
} from "../lib/chat/message-limits";

describe("chat message limits", () => {
  it("expõe o limite centralizado", () => {
    expect(CHAT_MESSAGE_MAX_LENGTH).toBe(8_000);
    expect(CHAT_MESSAGE_LENGTH_ERROR).toBe(
      "A mensagem pode ter no máximo 8000 caracteres.",
    );
  });

  it("mede tamanho e saldo restante", () => {
    expect(getChatMessageLength("hanira")).toBe(6);
    expect(getRemainingChatMessageCharacters("hanira")).toBe(7_994);
  });

  it("detecta texto acima do limite", () => {
    expect(isChatMessageTooLong("a".repeat(CHAT_MESSAGE_MAX_LENGTH))).toBe(false);
    expect(isChatMessageTooLong("a".repeat(CHAT_MESSAGE_MAX_LENGTH + 1))).toBe(true);
  });

  it("detecta overflow considerando seleção e substituição", () => {
    const full = "a".repeat(CHAT_MESSAGE_MAX_LENGTH);

    expect(willExceedChatMessageLimit(full, "b", full.length, full.length)).toBe(
      true,
    );
    expect(
      willExceedChatMessageLimit(full, "b", full.length - 1, full.length),
    ).toBe(false);
  });
});
