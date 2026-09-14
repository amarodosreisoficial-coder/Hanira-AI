export function sanitizeForPersistence(
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    imageGeneration?: unknown;
  }>,
) {
  return messages
    .map((message) => {
      const { imageGeneration: _ignored, ...rest } = message;
      void _ignored;
      return rest;
    })
    .filter(
      (message) =>
        !(message.role === "assistant" && message.content.trim() === ""),
    );
}

export function createMessageStore() {
  const messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    pending?: boolean;
    imageGeneration?: {
      status: "generating" | "ready" | "error";
      prompt: string;
      errorMessage?: string;
    };
  }> = [];
  return {
    addMessage(msg: (typeof messages)[number]) {
      messages.push(msg);
    },
    updateImageGeneration(
      id: string,
      ig: NonNullable<(typeof messages)[number]["imageGeneration"]>,
    ) {
      const msg = messages.find((m) => m.id === id);
      if (msg) {
        msg.imageGeneration = ig;
        msg.pending = ig.status === "generating";
      }
    },
    getMessages() {
      return [...messages];
    },
    getMessageIds() {
      return messages.map((m) => m.id);
    },
  };
}
