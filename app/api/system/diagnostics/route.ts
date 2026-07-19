import { getSessionUser } from "@/lib/auth/session";
import { getServerEnv, isDemoMode } from "@/lib/env";
import {
  createRequestId,
  logServerEvent,
} from "@/lib/logging/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOpenAIClient } from "@/services/openai";
import type { SystemDiagnostics } from "@/types/diagnostics";
import { getAIModelConfig } from "@/lib/ai/models";

const REQUIRED_TABLES = [
  "profiles",
  "conversations",
  "messages",
  "memories",
  "user_settings",
  "system_metadata",
  "attachments",
] as const;

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = createRequestId(request);
  const user = await getSessionUser();
  if (!user) {
    logServerEvent({
      level: "warn",
      requestId,
      route: "/api/system/diagnostics",
      event: "unauthenticated",
      status: 401,
      durationMs: Date.now() - startedAt,
    });
    return Response.json(
      { error: "Faça login para executar o diagnóstico.", requestId },
      { status: 401, headers: { "X-Request-ID": requestId } },
    );
  }

  const demo = isDemoMode();
  if (demo) {
    const diagnostics: SystemDiagnostics = {
      mode: "demo",
      supabaseConfigured: false,
      openAIConfigured: false,
      authenticated: false,
      databaseAccessible: false,
      streamingAvailable: true,
      modelConfigured: false,
      modelAvailable: null,
      tables: Object.fromEntries(
        REQUIRED_TABLES.map((table) => [table, false]),
      ),
      migrationsExpected: false,
      schemaVersion: null,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "não configurada",
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
      checkedAt: new Date().toISOString(),
      requestId,
    };
    logServerEvent({
      level: "info",
      requestId,
      route: "/api/system/diagnostics",
      event: "demo_diagnostics_completed",
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return Response.json(diagnostics, {
      headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" },
    });
  }

  const env = getServerEnv();
  const admin = createSupabaseAdminClient();
  const tableEntries = await Promise.all(
    REQUIRED_TABLES.map(async (table) => {
      const { error } = await admin
        .from(table)
        .select("*", { head: true, count: "exact" })
        .limit(1);
      return [table, !error] as const;
    }),
  );
  const tables = Object.fromEntries(tableEntries);
  const databaseAccessible = Object.values(tables).some(Boolean);

  const schemaResult = await admin
    .from("system_metadata")
    .select("value")
    .eq("key", "schema_version")
    .maybeSingle();
  const schemaMetadata = schemaResult.data as unknown as {
    value: string;
  } | null;
  const schemaVersion = schemaMetadata?.value ?? null;

  let modelAvailable = false;
  try {
    const modelConfig = getAIModelConfig();
    const modelIds = [
      modelConfig.chat,
      modelConfig.vision,
      modelConfig.transcription,
      modelConfig.speech,
    ];
    const models = await Promise.all(
      [...new Set(modelIds)].map((model) =>
        getOpenAIClient().models.retrieve(model),
      ),
    );
    modelAvailable = models.length === new Set(modelIds).size;
  } catch {
    modelAvailable = false;
  }

  const diagnostics: SystemDiagnostics = {
    mode: "production",
    supabaseConfigured: true,
    openAIConfigured: true,
    authenticated: true,
    databaseAccessible,
    streamingAvailable: true,
    modelConfigured: Boolean(env.OPENAI_MODEL),
    modelAvailable,
    tables,
    migrationsExpected:
      schemaVersion === "004" && REQUIRED_TABLES.every((table) => tables[table]),
    schemaVersion,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    appVersion: env.NEXT_PUBLIC_APP_VERSION,
    checkedAt: new Date().toISOString(),
    requestId,
  };

  logServerEvent({
    level:
      diagnostics.migrationsExpected && diagnostics.modelAvailable
        ? "info"
        : "warn",
    requestId,
    route: "/api/system/diagnostics",
    event: "diagnostics_completed",
    status: 200,
    durationMs: Date.now() - startedAt,
  });
  return Response.json(diagnostics, {
    headers: { "X-Request-ID": requestId, "Cache-Control": "no-store" },
  });
}
