import type { TextChatContextMessage } from "./text-chat-runtime";

export const CHAT_CONTEXT_LIMITS = {
  maxHistoryMessages: 20,
  maxHistoryChars: 24_000,
  maxMemories: 8,
  maxMemoryChars: 4_000,
} as const;

export function buildChatContextBudget(messages: TextChatContextMessage[], maxChars: number = CHAT_CONTEXT_LIMITS.maxHistoryChars) {
  const result: TextChatContextMessage[] = [];
  let chars = 0;
  for (let index = messages.length - 1; index >= 0 && result.length < CHAT_CONTEXT_LIMITS.maxHistoryMessages; index -= 1) {
    const message = messages[index];
    if (chars + message.content.length > maxChars && result.length > 0) break;
    result.unshift(message);
    chars += message.content.length;
  }
  return result;
}

export function limitMemoryContext(memories: string[]) {
  const result: string[] = [];
  let chars = 0;
  for (const memory of memories) {
    if (result.length >= CHAT_CONTEXT_LIMITS.maxMemories || chars + memory.length > CHAT_CONTEXT_LIMITS.maxMemoryChars) break;
    if (!result.includes(memory)) {
      result.push(memory);
      chars += memory.length;
    }
  }
  return result;
}
