import { describe, expect, it, vi } from "vitest";
import { buildNiraProductCapabilities } from "@/lib/ai/public-capabilities";
import {
  createSelfKnowledgeTextResponse,
  resolveSelfKnowledge,
} from "@/lib/ai/runtime/self-knowledge";
import { buildUsagePolicySummary, NIRA_USAGE_POLICY } from "@/lib/ai/runtime/usage-policy";

const capabilities = buildNiraProductCapabilities({
  textConfigured: true,
  imageConfigured: true,
  attachmentsEnabled: true,
});

describe("autoconhecimento determinístico da Nira", () => {
  it.each([
    ["Quem é você?", "identity", "Nira"],
    ["Quem te criou?", "creator", "Ronne Maicon Amaro dos Reis"],
    ["Quem criou você?", "creator", "Ronne Maicon Amaro dos Reis"],
    ["Quem é seu desenvolvedor?", "creator", "Ronne Maicon Amaro dos Reis"],
    ["O que você pode fazer?", "capabilities", "imagens"],
    ["Você gera imagens?", "image_generation", "Sim"],
    ["Pode editar imagem?", "image_generation", "referências"],
    ["Consigo mandar uma imagem como referência?", "image_generation", "referências"],
    ["Você tem memória?", "memory", "memória"],
    ["Você é ilimitada?", "usage_limits", "não é ilimitado"],
    ["Você tem créditos?", "credits", "não utiliza uma carteira"],
    ["Quantos créditos eu tenho?", "credits", "saldo"],
    ["Você é ChatGPT?", "chatgpt", "Não sou o ChatGPT"],
    ["Qual modelo você usa?", "model", "infraestrutura substituível"],
  ])("resolve %s com o intent %s", (message, intent, excerpt) => {
    const result = resolveSelfKnowledge({ message, capabilities });
    expect(result).toMatchObject({ intent });
    expect(result?.text).toContain(excerpt);
  });

  it("não intercepta uma pergunta normal ambígua", () => {
    expect(resolveSelfKnowledge({ message: "Explique como treinar um modelo", capabilities })).toBeNull();
    expect(resolveSelfKnowledge({ message: "Crie uma imagem de uma floresta", capabilities })).toBeNull();
  });

  it("não promete imagem quando a capacidade local está indisponível", () => {
    const result = resolveSelfKnowledge({
      message: "Você gera imagens?",
      capabilities: buildNiraProductCapabilities({ imageConfigured: false }),
    });
    expect(result?.text).toContain("não está disponível");
    expect(result?.text).not.toContain("Sim, posso");
  });

  it("usa streaming e persistence callback sem qualquer provider", async () => {
    const provider = vi.fn();
    const onComplete = vi.fn();
    const resolution = resolveSelfKnowledge({ message: "Quem é você?", capabilities });
    expect(resolution).not.toBeNull();
    const response = createSelfKnowledgeTextResponse({
      request: new Request("http://localhost/api/chat"),
      conversationId: "conversation-1",
      requestId: "request-1",
      resolution: resolution!,
      onComplete,
    });
    const body = await response.text();
    expect(body).toContain('"mode":"self_knowledge"');
    expect(body).toContain('"type":"done"');
    expect(onComplete).toHaveBeenCalledWith(expect.stringContaining("Nira"));
    expect(provider).not.toHaveBeenCalled();
  });
});

describe("política canônica de uso", () => {
  it("bloqueia ilimitado, carteira, cobrança e fallback pago", () => {
    expect(NIRA_USAGE_POLICY).toMatchObject({
      unlimited: false,
      creditWallet: false,
      automaticCharges: false,
      paidFallback: false,
    });
  });

  it("não inventa saldo nem sugere pagamento ou upgrade", () => {
    const text = buildUsagePolicySummary().toLocaleLowerCase("pt-BR");
    expect(text).toContain("não é ilimitado");
    expect(text).toContain("capacidade gratuita");
    expect(text).not.toContain("compre");
    expect(text).not.toContain("upgrade");
  });
});
