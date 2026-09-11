import type { NiraProductCapability, NiraProductCapabilityId, NiraProductCapabilityStatus } from "@/types/capabilities";

export interface ProductCapabilityRuntimeState {
  readonly demoMode?: boolean;
  readonly textConfigured?: boolean;
  readonly imageConfigured?: boolean;
  readonly attachmentsEnabled?: boolean;
  readonly visionEnabled?: boolean;
  readonly voiceEnabled?: boolean;
}

function capability(id: NiraProductCapabilityId, label: string, status: NiraProductCapabilityStatus, description: string): NiraProductCapability {
  return Object.freeze({ id, label, enabled: status !== "disabled", status, description });
}

/** Fonte canônica pública. A allow-list não transporta provider, modelo, URL interna ou segredo. */
export function buildNiraProductCapabilities(state: ProductCapabilityRuntimeState = {}): readonly NiraProductCapability[] {
  const demo = state.demoMode === true;
  const attachments = state.attachmentsEnabled === true;
  // Os caminhos multimodais legados não foram auditados como R$0.
  const voiceStatus: NiraProductCapabilityStatus = !state.voiceEnabled ? "disabled" : "unavailable";
  const visionStatus: NiraProductCapabilityStatus = !state.visionEnabled ? "disabled" : "unavailable";

  return Object.freeze([
    capability("text_chat", "Conversa", demo || state.textConfigured ? "available" : "unavailable", "Conversa e ajuda com textos."),
    capability("image_generation", "Imagens", state.imageConfigured ? "available" : "unavailable", state.imageConfigured ? "Gera e edita imagens, inclusive com referências enviadas na conversa." : "Geração de imagens sem capacidade gratuita configurada no momento."),
    capability("memory", "Memória", demo ? "limited" : "available", demo ? "Memória disponível somente durante a experiência demonstrativa local." : "Usa memórias relevantes quando o recurso está ativado pelo usuário."),
    capability("project_context", "Contexto de projeto", demo ? "limited" : "available", "Mantém conversas e contexto separados por projeto."),
    capability("attachments", "Anexos", attachments ? "available" : "disabled", attachments ? "Recebe anexos compatíveis no chat." : "Envio de anexos desativado nesta instância."),
    capability("documents", "Documentos", attachments ? "limited" : "disabled", attachments ? "Lê texto de PDF, TXT e Markdown; não oferece OCR completo." : "Leitura de documentos depende do envio de anexos."),
    capability("current_time", "Hora atual", "available", "Consulta a hora atual de uma localidade específica."),
    capability("current_weather", "Clima atual", "available", "Consulta o clima atual de uma localidade específica."),
    capability("vision", "Visão", visionStatus, visionStatus === "disabled" ? "Análise de imagens desativada nesta instância." : "Análise de imagens indisponível na política gratuita atual."),
    capability("transcription", "Transcrição", voiceStatus, voiceStatus === "disabled" ? "Transcrição de áudio desativada nesta instância." : "Transcrição indisponível na política gratuita atual."),
    capability("speech", "Voz", voiceStatus, voiceStatus === "disabled" ? "Resposta por voz desativada nesta instância." : "Resposta por voz indisponível na política gratuita atual."),
  ]);
}

function nonEmpty(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

/** Resolve estado localmente, sem rede, e descarta os valores do ambiente. */
export function getPublicAICapabilities(): readonly NiraProductCapability[] {
  const demoMode = process.env.HANIRA_DEMO_MODE === "true";
  return buildNiraProductCapabilities({
    demoMode,
    textConfigured: demoMode || nonEmpty("GROQ_API_KEY") || (process.env.AI_ENGINE_OLLAMA_ENABLED === "true" && nonEmpty("OLLAMA_BASE_URL") && nonEmpty("OLLAMA_MODEL")),
    imageConfigured: nonEmpty("CLOUDFLARE_AI_ACCOUNT_ID") && nonEmpty("CLOUDFLARE_AI_API_TOKEN"),
    attachmentsEnabled: process.env.NEXT_PUBLIC_ATTACHMENTS_ENABLED === "true",
    visionEnabled: process.env.NEXT_PUBLIC_VISION_ENABLED === "true",
    voiceEnabled: process.env.NEXT_PUBLIC_VOICE_ENABLED === "true",
  });
}

export function getCapability(capabilities: readonly NiraProductCapability[], id: NiraProductCapabilityId) {
  return capabilities.find((item) => item.id === id);
}

export function buildCapabilitySummary(capabilities: readonly NiraProductCapability[]) {
  const grouped = (statuses: readonly NiraProductCapabilityStatus[]) => capabilities
    .filter((item) => statuses.includes(item.status))
    .map((item) => item.label.toLocaleLowerCase("pt-BR"))
    .join(", ");
  const usable = grouped(["available", "limited"]);
  const inactive = grouped(["disabled", "unavailable"]);
  return [
    usable ? `Disponíveis ou limitadas: ${usable}.` : null,
    inactive ? `Desativadas ou indisponíveis: ${inactive}.` : null,
    "Ferramentas de clima e hora são consultas específicas, não navegação geral na internet.",
  ].filter(Boolean).join(" ");
}
