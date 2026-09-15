import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Pacote 17.6 — auditoria de ownership (multi-user safety).
// Todas as rotas autenticadas de dados escopam user_id server-side e RLS
// permanece defesa em profundidade. Request body nunca define identidade.
function src(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const conversationsRoute = src("../app/api/conversations/route.ts");
const conversationIdRoute = src("../app/api/conversations/[id]/route.ts");
const messagesScope = src("../tests/chat-route-scope.test.ts");
const memoriesRoute = src("../app/api/memories/route.ts");
const attachmentsContentRoute = src("../app/api/attachments/[id]/content/route.ts");
const attachmentsDeleteRoute = src("../app/api/attachments/[id]/route.ts");
const attachmentsService = src("../services/attachments.ts");
const projectsIdRoute = src("../app/api/projects/[id]/route.ts");
const projectService = src("../services/project-service.ts");
const memoryService = src("../services/memory.ts");
const chatRoute = src("../app/api/chat/route.ts");

describe("ownership boundaries (17.6)", () => {
  it("GET conversations lista somente do usuario autenticado", () => {
    expect(conversationsRoute).toContain('.eq("user_id", user.id)');
  });

  it("conversations [id] escopa leitura, mensagens e anexos por user_id", () => {
    const count = (conversationIdRoute.match(/\.eq\("user_id", user\.id\)/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(5);
    expect(conversationIdRoute).toContain('from("messages")');
    expect(conversationIdRoute).toContain('from("attachments")');
  });

  it("PATCH/DELETE de conversa verificam ownership via count exato", () => {
    expect(conversationIdRoute).toContain('count: "exact"');
    expect(conversationIdRoute).toContain("if (!count)");
  });

  it("memories escopa conversa e memorias pelo user_id", () => {
    expect(memoriesRoute).toContain('.eq("user_id", userId)');
    expect(memoriesRoute).toContain('.eq("user_id", user.id)');
    // PATCH de memoria so atualiza linha do proprio usuario.
    expect(memoriesRoute).toContain('.eq("user_id", user.id).select(');
  });

  it("attachments: content e delete exigem attachment do proprio usuario", () => {
    expect(attachmentsContentRoute).toContain('.eq("user_id", user.id)');
    expect(attachmentsDeleteRoute).toContain("deleteOwnedAttachment(user.id, id)");
    expect(attachmentsService).toContain("deleteOwnedAttachment");
    expect(attachmentsService).toContain('eq("user_id"');
  });

  it("projects [id] usa service layer com userId explicito", () => {
    expect(projectsIdRoute).toContain("findProjectByIdForUser(supabase!, user.id, id)");
    expect(projectsIdRoute).toContain("updateProjectForUser(supabase!, user.id, id, payload)");
    expect(projectsIdRoute).toContain("deleteProjectForUser(supabase!, user.id, id)");
    expect(projectService).toContain('eq("user_id"');
  });

  it("memory service escopa por userId", () => {
    expect(memoryService).toContain('eq("user_id"');
  });

  it("chat: contexto e anexos resolvidos com user.id do servidor, nunca do body", () => {
    expect(chatRoute).toContain("getOwnedAttachments");
    expect(chatRoute).toContain("user.id");
    expect(chatRoute).not.toMatch(/payload\.userId/);
  });

  it("escopo legacy do chat continua auditado por teste dedicado", () => {
    expect(messagesScope).toContain("chat");
  });
});
