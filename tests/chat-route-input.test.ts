import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSessionUser, logServerEvent } = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@/lib/auth/session", () => ({ requireSessionUser }));
vi.mock("@/lib/ai/runtime", () => ({
  streamEvent: (type: string, payload: Record<string, unknown>) =>
    `data: ${JSON.stringify({ type, ...payload })}\n\n`,
  streamHeaders: () => ({ "Content-Type": "text/event-stream" }),
  toPublicAIError: () => ({ status: 500, message: "erro de teste" }),
}));
vi.mock("@/lib/ai/runtime/capability-router", () => ({}));
vi.mock("@/lib/ai/ai-provider-error-logging", () => ({
  summarizeErrorStack: () => "test",
}));
vi.mock("@/lib/ai/runtime/system-prompt", () => ({}));
vi.mock("@/lib/logging/server", () => ({
  createRequestId: () => "request-test",
  logServerEvent,
}));
vi.mock("@/lib/logging/project-events", () => ({}));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, retryAfter: 0 }),
}));
vi.mock("@/lib/supabase/server", () => ({}));
vi.mock("@/services/attachments", () => ({}));
vi.mock("@/services/chat-context", () => ({
  ChatContextError: class ChatContextError extends Error {},
}));
vi.mock("@/services/memory", () => ({}));

import { POST } from "../app/api/chat/route";

describe("entrada JSON da rota de chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionUser.mockResolvedValue({ id: "demo-user", demo: true });
  });

  it.each([
    ["sem corpo", new Request("http://localhost/api/chat", { method: "POST" })],
    [
      "com JSON malformado",
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    ],
  ])("responde 400 para payload %s", async (_label, request) => {
    const response = await POST(request);

    await expect(response.json()).resolves.toEqual({
      error: "Payload de chat invalido.",
      requestId: "request-test",
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("X-Request-ID")).toBe("request-test");
    expect(logServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "invalid_json_payload", status: 400 }),
    );
  });

  it("mantem uma entrada valida no streaming demonstrativo", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Ola" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('"type":"start"');
  });
});
