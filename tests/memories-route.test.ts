import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireSessionUser = vi.fn();
const createSupabaseServerClient = vi.fn();
const listProjectMemories = vi.fn();
const deleteProjectMemory = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireSessionUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

vi.mock("@/services/memory", () => ({
  listProjectMemories,
  deleteProjectMemory,
}));

describe("memories route scope", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireSessionUser.mockResolvedValue({
      id: "user-1",
      demo: false,
    });
    createSupabaseServerClient.mockResolvedValue({
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: { id: "conv-a", metadata: null },
            error: null,
          }),
        };
      },
    });
    listProjectMemories.mockResolvedValue([]);
    deleteProjectMemory.mockResolvedValue(undefined);
  });

  it("a rota de memorias nao usa projeto padrao global", async () => {
    const route = await import("../app/api/memories/route");
    const response = await route.GET(
      new Request("http://localhost/api/memories?conversationId=conv-a"),
    );

    expect(response.status).toBe(200);
    expect(listProjectMemories).toHaveBeenCalledWith({
      userId: "user-1",
      projectId: "legacy-conversation:conv-a",
    });
  });

  it("a rota remove memorias apenas do escopo derivado da conversa", async () => {
    const route = await import("../app/api/memories/route");
    const response = await route.DELETE(
      new Request("http://localhost/api/memories?conversationId=conv-a&id=memory-a", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteProjectMemory).toHaveBeenCalledWith({
      userId: "user-1",
      projectId: "legacy-conversation:conv-a",
      id: "memory-a",
    });
  });
});
