import { buildCapabilitySummary, getCapability } from "@/lib/ai/public-capabilities";
import type { NiraProductCapability } from "@/types/capabilities";
import { buildUsagePolicySummary } from "./usage-policy";
import { createDeterministicTextResponse } from "./deterministic-response";

export const SELF_KNOWLEDGE_INTENTS = [
  "identity", "creator", "capabilities", "image_generation", "documents",
  "memory", "vision", "voice", "usage_limits", "credits", "chatgpt", "model",
] as const;
export type SelfKnowledgeIntent = (typeof SELF_KNOWLEDGE_INTENTS)[number];

export interface SelfKnowledgeResolution {
  readonly intent: SelfKnowledgeIntent;
  readonly language: "pt-BR" | "en";
  readonly text: string;
}

function normalize(message: string) {
  return message.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9\s?]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function detectIntent(value: string): SelfKnowledgeIntent | null {
  if (/^(quem (?:e|eh) voce|qual (?:e|eh) (?:o )?seu nome|who are you|what is your name)\??$/.test(value)) return "identity";
  if (/^(quem (?:te|a) criou|quem criou voce|quem (?:e|eh) (?:o )?seu (?:criador|desenvolvedor)|who (?:created|developed) you)\??$/.test(value)) return "creator";
  if (/^(o que voce (?:pode fazer|faz)|quais (?:recursos|capacidades) voce tem|what can you do|what are your capabilities)\??$/.test(value)) return "capabilities";
  if (/^(voce (?:gera|consegue criar|pode criar|pode editar) image(?:m|ns)|pode editar image(?:m|ns)|(?:posso|consigo) (?:mandar|enviar) uma imagem como referencia|can you (?:generate|create|edit) images?)\??$/.test(value)) return "image_generation";
  if (/^(voce (?:trabalha|consegue trabalhar) com documentos|voce (?:le|entende) (?:pdfs?|documentos)|can you (?:read|work with) documents?)\??$/.test(value)) return "documents";
  if (/^(voce tem memoria|voce lembra das conversas|do you (?:have memory|remember conversations))\??$/.test(value)) return "memory";
  if (/^(voce (?:entende|analisa|enxerga) imagens?|do you (?:understand|analyze|see) images?)\??$/.test(value)) return "vision";
  if (/^(voce tem voz|voce fala|can you speak|do you have a voice)\??$/.test(value)) return "voice";
  if (/^(voce (?:e|eh) ilimitad[ao]|(?:existe|ha|tem) limite de uso|is (?:usage|it) unlimited|are you unlimited)\??$/.test(value)) return "usage_limits";
  if (/^(voce tem creditos|quantos creditos (?:eu tenho|tenho)|qual (?:e|eh) (?:o )?meu saldo|do i have credits|how many credits do i have)\??$/.test(value)) return "credits";
  if (/^(voce (?:e|eh|usa) (?:o )?chatgpt|are you chatgpt|do you use chatgpt)\??$/.test(value)) return "chatgpt";
  if (/^(qual (?:modelo|provider|provedor) voce usa|que (?:modelo|provider|provedor) voce usa|what (?:model|provider) do you use)\??$/.test(value)) return "model";
  return null;
}

function usable(capability: NiraProductCapability | undefined) {
  return capability?.status === "available" || capability?.status === "limited";
}

function answerCapability(capability: NiraProductCapability | undefined, yes: string, no: string) {
  if (!capability) return no;
  return `${usable(capability) ? yes : no} ${capability.description}`;
}

export function resolveSelfKnowledge(options: {
  message: string;
  capabilities: readonly NiraProductCapability[];
}): SelfKnowledgeResolution | null {
  const normalized = normalize(options.message);
  const intent = detectIntent(normalized);
  if (!intent) return null;
  const language: "pt-BR" | "en" = /\b(?:who|what|can|do|are|is|how)\b/.test(normalized) ? "en" : "pt-BR";
  const cap = (id: Parameters<typeof getCapability>[1]) => getCapability(options.capabilities, id);

  const portuguese: Record<SelfKnowledgeIntent, () => string> = {
    identity: () => "Eu sou a Nira, a inteligência da Hanira AI. Hanira é o produto e a plataforma; Nira é a inteligência que opera nela.",
    creator: () => "Fui criada e desenvolvida por Ronne Maicon Amaro dos Reis, criador da Hanira AI.",
    capabilities: () => `Estas são minhas capacidades atuais: ${buildCapabilitySummary(options.capabilities)}`,
    image_generation: () => answerCapability(cap("image_generation"), "Sim, posso gerar e editar imagens.", "A geração de imagens não está disponível agora."),
    documents: () => answerCapability(cap("documents"), "Posso trabalhar com documentos compatíveis.", "O trabalho com documentos não está disponível agora."),
    memory: () => answerCapability(cap("memory"), "Tenho memória contextual controlada pela Hanira.", "A memória não está disponível nesta experiência."),
    vision: () => answerCapability(cap("vision"), "Posso analisar imagens.", "A análise de imagens não está disponível agora."),
    voice: () => answerCapability(cap("speech"), "Posso responder por voz.", "A resposta por voz não está disponível agora."),
    usage_limits: () => buildUsagePolicySummary("pt-BR"),
    credits: () => `A Hanira ainda não utiliza uma carteira de créditos exibida como saldo. ${buildUsagePolicySummary("pt-BR")}`,
    chatgpt: () => "Não sou o ChatGPT. Sou a Nira, a inteligência da Hanira AI. Serviços e modelos de terceiros podem fazer parte da infraestrutura técnica substituível, sem mudar minha identidade.",
    model: () => "Sou a Nira, independentemente do motor técnico usado. A Hanira pode rotear solicitações por infraestrutura substituível; não afirmo um modelo específico sem diagnóstico técnico confiável da solicitação atual.",
  };
  const english: Record<SelfKnowledgeIntent, () => string> = {
    identity: () => "I am Nira, Hanira AI's intelligence. Hanira is the product and platform; Nira is the intelligence operating within it.",
    creator: () => "I was created and developed by Ronne Maicon Amaro dos Reis, creator of Hanira AI.",
    capabilities: () => `My current capabilities are described by Hanira's active product catalog: ${buildCapabilitySummary(options.capabilities)}`,
    image_generation: () => answerCapability(cap("image_generation"), "Yes, I can generate and edit images.", "Image generation is not available right now."),
    documents: () => answerCapability(cap("documents"), "I can work with supported documents.", "Document support is not available right now."),
    memory: () => answerCapability(cap("memory"), "I have contextual memory controlled by Hanira.", "Memory is not available in this experience."),
    vision: () => answerCapability(cap("vision"), "I can analyze images.", "Image analysis is not available right now."),
    voice: () => answerCapability(cap("speech"), "I can respond with voice.", "Voice responses are not available right now."),
    usage_limits: () => buildUsagePolicySummary("en"),
    credits: () => `Hanira does not currently use a displayed credit wallet or balance. ${buildUsagePolicySummary("en")}`,
    chatgpt: () => "I am not ChatGPT. I am Nira, Hanira AI's intelligence. Third-party services or models may be replaceable technical infrastructure without changing my identity.",
    model: () => "I am Nira regardless of the technical engine in use. Hanira may route requests through replaceable infrastructure; I do not claim a specific model without reliable diagnostics for the current request.",
  };

  return Object.freeze({ intent, language, text: (language === "en" ? english : portuguese)[intent]() });
}

export function createSelfKnowledgeTextResponse(options: {
  request: Request;
  conversationId: string;
  requestId: string;
  resolution: SelfKnowledgeResolution;
  onComplete: (text: string) => Promise<void> | void;
  onCancelled?: () => Promise<void> | void;
}) {
  return createDeterministicTextResponse({
    request: options.request,
    conversationId: options.conversationId,
    requestId: options.requestId,
    mode: "self_knowledge",
    text: options.resolution.text,
    onComplete: options.onComplete,
    onCancelled: options.onCancelled,
  });
}
