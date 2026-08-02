import { getSessionUser } from "@/lib/auth/session";
import { getServerAICapabilities } from "@/lib/ai/capabilities";
import { createTextChatRuntime } from "@/lib/ai/runtime";
import { getAIModelConfig } from "@/lib/ai/models";
import { getServerEnv, isDemoMode } from "@/lib/env";
import {
  createRequestId,
  logServerEvent,
} from "@/lib/logging/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOpenAIClient } from "@/services/openai";
import type { SystemDiagnostics } from "@/types/diagnostics";

const REQUIRED_TABLES = [
  "profiles",
  "projects",
  "personalities",
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
      { error: "Faca login para executar o diagnostico.", requestId },
      { status: 401, headers: { "X-Request-ID": requestId } },
    );
  }

  const demo = isDemoMode();
  if (demo) {
    const capabilities = getServerAICapabilities();
    const diagnostics: SystemDiagnostics = {
      mode: "demo",
      authenticated: false,
      databaseAccessible: false,
      text: capabilities.text,
      vision: capabilities.vision,
      transcription: capabilities.transcription,
      speech: capabilities.speech,
      attachments: capabilities.attachments,
      tables: Object.fromEntries(
        REQUIRED_TABLES.map((table) => [table, false]),
      ),
      schemaVersion: null,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "nao configurada",
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
  const capabilities = getServerAICapabilities();
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
    modelAvailable = (await createTextChatRuntime().provider.healthCheck()).ok;
  } catch {
    modelAvailable = false;
  }

  if (capabilities.text.status === "available" && !modelAvailable) {
    capabilities.text.status = "unavailable";
    capabilities.text.reason = "Runtime textual configurado, mas indisponivel.";
  }

  if (env.OPENAI_API_KEY && (env.NEXT_PUBLIC_VISION_ENABLED || env.NEXT_PUBLIC_VOICE_ENABLED)) {
    try {
      const modelConfig = getAIModelConfig();
      const modelIds = [
        env.NEXT_PUBLIC_VISION_ENABLED ? modelConfig.vision : null,
        env.NEXT_PUBLIC_VOICE_ENABLED ? modelConfig.transcription : null,
        env.NEXT_PUBLIC_VOICE_ENABLED ? modelConfig.speech : null,
      ].filter((value): value is string => Boolean(value));

      if (modelIds.length > 0) {
        await Promise.all(
          [...new Set(modelIds)].map((model) =>
            getOpenAIClient().models.retrieve(model),
          ),
        );
      }
    } catch {
      if (capabilities.vision.status === "available") {
        capabilities.vision.status = "unavailable";
        capabilities.vision.reason = "Provider de visao nao respondeu.";
      }
      if (capabilities.transcription.status === "available") {
        capabilities.transcription.status = "unavailable";
        capabilities.transcription.reason =
          "Provider de transcricao nao respondeu.";
      }
      if (capabilities.speech.status === "available") {
        capabilities.speech.status = "unavailable";
        capabilities.speech.reason = "Provider de voz nao respondeu.";
      }
    }
  }

  const diagnostics: SystemDiagnostics = {
    mode: "production",
    authenticated: true,
    databaseAccessible,
    text: capabilities.text,
    vision: capabilities.vision,
    transcription: capabilities.transcription,
    speech: capabilities.speech,
    attachments: capabilities.attachments,
    tables,
    schemaVersion,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    appVersion: env.NEXT_PUBLIC_APP_VERSION,
    checkedAt: new Date().toISOString(),
    requestId,
  };

  logServerEvent({
    level: databaseAccessible && modelAvailable ? "info" : "warn",
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
