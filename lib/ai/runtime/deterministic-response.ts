import { streamEvent, streamHeaders } from "./text-chat-runtime";

export function createDeterministicTextResponse(options: {
  request: Request;
  conversationId: string;
  requestId: string;
  mode: string;
  text: string;
  onComplete?: (text: string) => Promise<void> | void;
}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(streamEvent("start", {
        conversationId: options.conversationId,
        requestId: options.requestId,
        mode: options.mode,
      })));
      if (!options.request.signal.aborted) {
        controller.enqueue(encoder.encode(streamEvent("delta", { delta: options.text })));
        if (!options.request.signal.aborted) {
          await options.onComplete?.(options.text);
          if (!options.request.signal.aborted) {
            controller.enqueue(encoder.encode(streamEvent("done", { conversationId: options.conversationId })));
          }
        }
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: streamHeaders(options.conversationId, options.requestId) });
}
