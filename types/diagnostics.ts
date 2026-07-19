export interface SystemDiagnostics {
  mode: "demo" | "production";
  supabaseConfigured: boolean;
  openAIConfigured: boolean;
  authenticated: boolean;
  databaseAccessible: boolean;
  streamingAvailable: boolean;
  modelConfigured: boolean;
  modelAvailable: boolean | null;
  tables: Record<string, boolean>;
  migrationsExpected: boolean;
  schemaVersion: string | null;
  appUrl: string;
  appVersion: string;
  checkedAt: string;
  requestId: string;
}
