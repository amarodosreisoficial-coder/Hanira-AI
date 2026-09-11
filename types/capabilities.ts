export const NIRA_PRODUCT_CAPABILITY_IDS = [
  "text_chat",
  "image_generation",
  "memory",
  "project_context",
  "attachments",
  "documents",
  "current_time",
  "current_weather",
  "vision",
  "transcription",
  "speech",
] as const;

export type NiraProductCapabilityId = (typeof NIRA_PRODUCT_CAPABILITY_IDS)[number];
export type NiraProductCapabilityStatus = "available" | "disabled" | "unavailable" | "limited";

/** Contrato público allow-listed. Nunca inclui provider, modelo ou configuração. */
export interface NiraProductCapability {
  readonly id: NiraProductCapabilityId;
  readonly label: string;
  readonly enabled: boolean;
  readonly status: NiraProductCapabilityStatus;
  readonly description: string;
}
