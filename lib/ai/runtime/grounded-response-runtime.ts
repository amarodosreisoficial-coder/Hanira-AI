import type { AIProvider } from "@/lib/ai/provider";
import type { AIChatRequest } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";
import { streamEvent, streamHeaders } from "./text-chat-runtime";
import {
  validateGroundedSynthesis,
  type GroundedToolContext,
} from "./grounded-tool-context";

export interface GroundedSynthesisOutcome {
  kind: "synthesized" | "deterministic_fallback" | "cancelled";
  reason?: "provider_failed" | "grounding_rejected";
}

export function createGroundedToolResponse(options: {
  request: Request;
  provider: AIProvider;
  providerRequest: AIChatRequest;
  groundedContext: GroundedToolContext;
  deterministicText: string;
  conversationId: string;
  requestId: string;
  mode: string;
  onComplete?: (text: string) => Promise<void> | void;
  onOutcome?: (outcome: GroundedSynthesisOutcome) => Promise<void> | void;
}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(streamEvent("start", {
        conversationId: options.conversationId,
        requestId: options.requestId,
        mode: options.mode,
      })));

      let text = options.deterministicText;
      let outcome: GroundedSynthesisOutcome = {
        kind: "deterministic_fallback",
        reason: "provider_failed",
      };
      try {
        let synthesis = "";
        let finished = false;
        for await (const event of options.provider.stream(options.providerRequest)) {
          if (event.type === "text-delta") synthesis += event.textDelta;
          else if (event.type === "error") throw event.error;
          else if (event.type === "finish") finished = true;
        }
        synthesis = synthesis.trim();
        if (!finished) throw new Error("unfinished_grounded_synthesis");
        if (!synthesis) throw new Error("empty_grounded_synthesis");
        const grounding = validateGroundedSynthesis(synthesis, options.groundedContext);
        if (!grounding.valid) {
          outcome = { kind: "deterministic_fallback", reason: "grounding_rejected" };
        } else {
          text = synthesis;
          outcome = { kind: "synthesized" };
        }
      } catch (error) {
        if (
          options.request.signal.aborted &&
          error instanceof AIProviderError &&
          error.code === "cancelled"
        ) {
          await options.onOutcome?.({ kind: "cancelled" });
          controller.close();
          return;
        }
      }

      if (options.request.signal.aborted) {
        await options.onOutcome?.({ kind: "cancelled" });
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(streamEvent("delta", { delta: text })));
      await options.onComplete?.(text);
      if (!options.request.signal.aborted) {
        controller.enqueue(encoder.encode(streamEvent("done", { conversationId: options.conversationId })));
        await options.onOutcome?.(outcome);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: streamHeaders(options.conversationId, options.requestId),
  });
}
