import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "app/api/chat/route.ts"), "utf8");

describe("integração de autoconhecimento na rota", () => {
  it("resolve e persiste antes das ferramentas e do provider", () => {
    const selfKnowledge = source.indexOf("resolveSelfKnowledge({");
    const tools = source.indexOf("routeTool({", selfKnowledge);
    const provider = source.indexOf("routeChatCapability({", selfKnowledge);
    expect(selfKnowledge).toBeGreaterThan(0);
    expect(tools).toBeGreaterThan(selfKnowledge);
    expect(provider).toBeGreaterThan(tools);
    expect(source.slice(selfKnowledge, tools)).toContain("persistAssistantResponse({");
    expect(source.slice(selfKnowledge, tools)).toContain("createSelfKnowledgeTextResponse({");
  });

  it("mantém perguntas normais ligadas ao runtime e registra métricas sem conteúdo", () => {
    expect(source).toContain("routeChatCapability({");
    expect(source).toContain('event: "context_budget_applied"');
    expect(source).toContain('event: "self_knowledge_resolved"');
    const metric = source.slice(source.indexOf('event: "self_knowledge_resolved"'), source.indexOf("return createSelfKnowledgeTextResponse"));
    expect(metric).toContain("intent: selfKnowledge.intent");
    expect(metric).not.toContain("payload.message");
  });
});
