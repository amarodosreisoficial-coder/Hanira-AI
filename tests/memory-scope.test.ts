import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  deleteProjectMemory,
  getRelevantMemories,
  saveExplicitMemory,
} from "../services/memory";

function createSupabaseStub(options: {
  conversations?: Array<Record<string, unknown>>;
  memories?: Array<Record<string, unknown>>;
  insertedMemoryId?: string;
}) {
  const insertSpy = vi.fn();
  const deleteSpy = vi.fn();

  return {
    insertSpy,
    deleteSpy,
    client: {
      from(table: string) {
        if (table === "user_settings") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { memory_enabled: true },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }

        if (table === "conversations") {
          return {
            select() {
              return {
                eq(column: string, value: unknown) {
                  const byId =
                    column === "id"
                      ? (options.conversations ?? []).filter((item) => item.id === value)
                      : (options.conversations ?? []).filter(
                          (item) => item[column] === value,
                        );
                  return {
                    eq(innerColumn: string, innerValue: unknown) {
                      const byUser = byId.filter(
                        (item) => item[innerColumn] === innerValue,
                      );
                      return {
                        maybeSingle: async () => ({
                          data: byUser[0] ?? null,
                          error: null,
                        }),
                      };
                    },
                    order() {
                      return {
                        limit: async () => ({
                          data: byId,
                          error: null,
                        }),
                      };
                    },
                  };
                },
              };
            },
          };
        }

        if (table === "memories") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        in(column: string, values: string[]) {
                          return Promise.resolve({
                            data: (options.memories ?? []).filter((memory) =>
                              values.includes(String(memory[column] ?? "")),
                            ),
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
            insert(value: Record<string, unknown>) {
              insertSpy(value);
              return {
                select() {
                  return {
                    maybeSingle: async () => ({
                      data: options.insertedMemoryId
                        ? { id: options.insertedMemoryId }
                        : null,
                      error: null,
                    }),
                  };
                },
              };
            },
            delete() {
              return {
                eq() {
                  return {
                    in(_column: string, values: string[]) {
                      deleteSpy(values);
                      return Promise.resolve({ error: null });
                    },
                  };
                },
              };
            },
          };
        }

        throw new Error(`unexpected table ${table}`);
      },
    },
  };
}

describe("memory scope", () => {
  it("conversa A nao le memoria da conversa B", async () => {
    const supabase = createSupabaseStub({
      conversations: [
        { id: "conv-a", user_id: "user-1", metadata: null },
        { id: "conv-b", user_id: "user-1", metadata: null },
      ],
      memories: [
        {
          id: "memory-a",
          content: "prefere cafe",
          importance: 4,
          source_conversation_id: "conv-a",
        },
        {
          id: "memory-b",
          content: "prefere cha",
          importance: 4,
          source_conversation_id: "conv-b",
        },
      ],
    });

    await expect(
      getRelevantMemories({
        supabase: supabase.client as never,
        userId: "user-1",
        projectId: "legacy-conversation:conv-a",
        message: "cafe",
      }),
    ).resolves.toEqual(["prefere cafe"]);
  });

  it("conversa A nao remove memoria da conversa B", async () => {
    const supabase = createSupabaseStub({
      conversations: [
        { id: "conv-a", user_id: "user-1", metadata: null },
        { id: "conv-b", user_id: "user-1", metadata: null },
      ],
      memories: [
        {
          id: "memory-a",
          content: "prefere cafe",
          importance: 4,
          source_conversation_id: "conv-a",
        },
        {
          id: "memory-b",
          content: "prefere cha",
          importance: 4,
          source_conversation_id: "conv-b",
        },
      ],
    });

    await deleteProjectMemory({
      supabase: supabase.client as never,
      userId: "user-1",
      projectId: "legacy-conversation:conv-a",
    });

    expect(supabase.deleteSpy).toHaveBeenCalledWith(["memory-a"]);
  });

  it("nao salva memoria quando a conversa pertence a outro escopo", async () => {
    const supabase = createSupabaseStub({
      conversations: [
        { id: "conv-a", user_id: "user-1", metadata: null },
      ],
      insertedMemoryId: "memory-1",
    });

    await expect(
      saveExplicitMemory({
        supabase: supabase.client as never,
        userId: "user-1",
        projectId: "legacy-conversation:conv-b",
        conversationId: "conv-a",
        message: "lembre que gosto de cha",
      }),
    ).resolves.toMatchObject({
      status: "skipped",
      reason: "context_mismatch",
    });
    expect(supabase.insertSpy).not.toHaveBeenCalled();
  });

  it("salva o nome com acentuacao em portugues", async () => {
    const supabase = createSupabaseStub({
      conversations: [{ id: "conv-a", user_id: "user-1", project_id: "project-a" }],
      insertedMemoryId: "memory-name",
    });

    await expect(
      saveExplicitMemory({
        supabase: supabase.client as never,
        userId: "user-1",
        projectId: "project-a",
        conversationId: "conv-a",
        message: "meu nome é Ana",
      }),
    ).resolves.toMatchObject({ status: "saved", memoryId: "memory-name" });
    expect(supabase.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Ana", category: "identidade" }),
    );
  });

  it("salva preferencias com nao, cafe e demais acentos", async () => {
    const supabase = createSupabaseStub({
      conversations: [{ id: "conv-a", user_id: "user-1", project_id: "project-a" }],
      insertedMemoryId: "memory-preference",
    });

    await expect(
      saveExplicitMemory({
        supabase: supabase.client as never,
        userId: "user-1",
        projectId: "project-a",
        conversationId: "conv-a",
        message: "não gosto de café",
      }),
    ).resolves.toMatchObject({ status: "saved" });
    expect(supabase.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ content: "café", category: "preferência" }),
    );

    const accented = createSupabaseStub({
      conversations: [{ id: "conv-a", user_id: "user-1", project_id: "project-a" }],
      insertedMemoryId: "memory-accented",
    });
    await saveExplicitMemory({
      supabase: accented.client as never,
      userId: "user-1",
      projectId: "project-a",
      conversationId: "conv-a",
      message: "lembre que ação é útil: ímã, união, açúcar, coração e pão",
    });
    expect(accented.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "ação é útil: ímã, união, açúcar, coração e pão",
      }),
    );
  });

  it("ignora frases que nao correspondem a uma memoria", async () => {
    const supabase = createSupabaseStub({
      conversations: [{ id: "conv-a", user_id: "user-1", project_id: "project-a" }],
      insertedMemoryId: "memory-never",
    });

    await expect(
      saveExplicitMemory({
        supabase: supabase.client as never,
        userId: "user-1",
        projectId: "project-a",
        conversationId: "conv-a",
        message: "Hoje está ensolarado",
      }),
    ).resolves.toMatchObject({ status: "skipped", reason: "pattern_not_matched" });
    expect(supabase.insertSpy).not.toHaveBeenCalled();
  });

  it("continua bloqueando informacao sensivel acentuada", async () => {
    const supabase = createSupabaseStub({
      conversations: [{ id: "conv-a", user_id: "user-1", project_id: "project-a" }],
      insertedMemoryId: "memory-sensitive",
    });

    await expect(
      saveExplicitMemory({
        supabase: supabase.client as never,
        userId: "user-1",
        projectId: "project-a",
        conversationId: "conv-a",
        message: "lembre que meu cartão é 1234",
      }),
    ).resolves.toMatchObject({ status: "skipped", reason: "sensitive_content" });
    expect(supabase.insertSpy).not.toHaveBeenCalled();
  });
});
