export type AICapabilityStatus =
  | "available"
  | "disabled"
  | "misconfigured"
  | "unavailable";

export interface DiagnosticCapability {
  enabled: boolean;
  provider?: string;
  model?: string;
  voice?: string;
  status: AICapabilityStatus;
  reason?: string;
}

export interface SystemDiagnostics {
  mode: "demo" | "production";
  authenticated: boolean;
  databaseAccessible: boolean;
  schemaVersion: string | null;
  appUrl: string;
  appVersion: string;
  checkedAt: string;
  requestId: string;
  // Package 17.6: identificacao de release segura (commit do build e
  // ambiente logico). Exposta apenas neste diagnostico autenticado.
  release?: import("@/lib/version").ReleaseInfo;
  text: DiagnosticCapability;
  vision: DiagnosticCapability;
  transcription: DiagnosticCapability;
  speech: DiagnosticCapability;
  attachments: DiagnosticCapability;
  productCapabilities: readonly import("@/types/capabilities").NiraProductCapability[];
  tables: Record<string, boolean>;
  // Pacote 16.5: observabilidade basica de capacidade (Nira Capacity Engine).
  // Opcional e presente apenas no modo producao; contem apenas dados
  // escalares seguros (ids logicos, contadores, estados), nunca segredos.
  capacity?: import("@/lib/observability/capacity-metrics").CapacityMetricsSnapshot;
}
