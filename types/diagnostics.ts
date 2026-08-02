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
  text: DiagnosticCapability;
  vision: DiagnosticCapability;
  transcription: DiagnosticCapability;
  speech: DiagnosticCapability;
  attachments: DiagnosticCapability;
  tables: Record<string, boolean>;
}
