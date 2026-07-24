import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  logConversationProjectResolved,
  logLegacyConversationScopeUsed,
  logPersonalityLoaded,
  logPersonalityNotConfigured,
  logPersonalityScopeMismatch,
  logProjectAccessDenied,
  logProjectCreated,
  logProjectDefaultResolved,
} from "../lib/logging/project-events";

const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

function parseConsoleCall(spy: typeof infoSpy | typeof warnSpy) {
  return JSON.parse(String(spy.mock.calls.at(-1)?.[0] ?? "{}"));
}

describe("project observability", () => {
  afterEach(() => {
    infoSpy.mockClear();
    warnSpy.mockClear();
  });

  it("emite evento ao criar projeto", () => {
    logProjectCreated({
      requestId: "req-12345678",
      route: "/api/projects",
      userId: "user-1",
      projectId: "proj-1",
      status: 201,
    });

    expect(parseConsoleCall(infoSpy)).toMatchObject({
      event: "project_created",
      route: "/api/projects",
      projectId: "proj-1",
      userId: "user-1",
      status: 201,
    });
  });

  it("emite evento ao resolver projeto padrao", () => {
    logProjectDefaultResolved({
      requestId: "req-12345678",
      route: "/api/chat",
      userId: "user-1",
      projectId: "proj-1",
    });

    expect(parseConsoleCall(infoSpy)).toMatchObject({
      event: "project_default_resolved",
      projectId: "proj-1",
    });
  });

  it("emite evento ao resolver project_id relacional", () => {
    logConversationProjectResolved({
      requestId: "req-12345678",
      route: "/api/chat",
      userId: "user-1",
      projectId: "proj-1",
      conversationId: "conv-1",
    });

    expect(parseConsoleCall(infoSpy)).toMatchObject({
      event: "conversation_project_resolved",
      projectId: "proj-1",
      conversationId: "conv-1",
    });
  });

  it("emite evento ao usar escopo legado", () => {
    logLegacyConversationScopeUsed({
      requestId: "req-12345678",
      route: "/api/chat",
      userId: "user-1",
      projectId: "legacy-conversation:conv-1",
      conversationId: "conv-1",
      legacyScopeUsed: true,
    });

    expect(parseConsoleCall(infoSpy)).toMatchObject({
      event: "legacy_conversation_scope_used",
      projectId: "legacy-conversation:conv-1",
      legacyScopeUsed: true,
    });
  });

  it("emite evento ao carregar personalidade ativa", () => {
    logPersonalityLoaded({
      requestId: "req-12345678",
      route: "/api/chat",
      userId: "user-1",
      projectId: "proj-1",
      conversationId: "conv-1",
      personalityId: "pers-1",
    });

    expect(parseConsoleCall(infoSpy)).toMatchObject({
      event: "personality_loaded",
      personalityId: "pers-1",
    });
  });

  it("emite evento quando nao ha personalidade", () => {
    logPersonalityNotConfigured({
      requestId: "req-12345678",
      route: "/api/chat",
      userId: "user-1",
      projectId: "proj-1",
      conversationId: "conv-1",
    });

    expect(parseConsoleCall(infoSpy)).toMatchObject({
      event: "personality_not_configured",
      projectId: "proj-1",
    });
  });

  it("emite evento de acesso negado", () => {
    logProjectAccessDenied({
      requestId: "req-12345678",
      route: "/api/chat",
      userId: "user-1",
      projectId: "proj-forbidden",
      errorCode: "project_not_found",
    });

    expect(parseConsoleCall(warnSpy)).toMatchObject({
      event: "project_access_denied",
      projectId: "proj-forbidden",
      errorCode: "project_not_found",
    });
  });

  it("emite evento de mismatch sem vazar instructions, prompt ou memory", () => {
    logPersonalityScopeMismatch({
      requestId: "req-12345678",
      route: "/api/chat",
      userId: "user-1",
      projectId: "proj-1",
      conversationId: "conv-1",
      personalityId: "pers-1",
      errorCode: "personality_scope_mismatch",
    });

    const payload = JSON.stringify(parseConsoleCall(warnSpy));
    expect(payload).toContain("personality_scope_mismatch");
    expect(payload).not.toContain("instructions");
    expect(payload).not.toContain("prompt");
    expect(payload).not.toContain("memory");
  });
});
