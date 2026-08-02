export const CHAT_MESSAGE_MAX_LENGTH = 8_000;

export const CHAT_MESSAGE_LENGTH_ERROR = `A mensagem pode ter no máximo ${CHAT_MESSAGE_MAX_LENGTH} caracteres.`;

export function getChatMessageLength(value: string) {
  return value.length;
}

export function getRemainingChatMessageCharacters(value: string) {
  return CHAT_MESSAGE_MAX_LENGTH - getChatMessageLength(value);
}

export function isChatMessageTooLong(value: string) {
  return getChatMessageLength(value) > CHAT_MESSAGE_MAX_LENGTH;
}

export function willExceedChatMessageLimit(
  currentValue: string,
  insertedText: string,
  selectionStart: number | null,
  selectionEnd: number | null,
) {
  const start = selectionStart ?? currentValue.length;
  const end = selectionEnd ?? start;
  const nextValue =
    currentValue.slice(0, start) + insertedText + currentValue.slice(end);

  return isChatMessageTooLong(nextValue);
}
