import "server-only";
import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

function defaultedBooleanString(fallback: "true" | "false") {
  return z
    .enum(["true", "false"])
    .optional()
    .default(fallback)
    .transform((value) => value === "true");
}

function numberStringWithDefault(fallback: string) {
  return z.preprocess(
    (value) => (value === undefined ? fallback : value),
    z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .transform(Number)
      .pipe(z.number().positive().max(100)),
  );
}

function optionalTrimmedString(minLength = 1) {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z.string().min(minLength).optional(),
  );
}

const publicEnvSchema = z.object({
  HANIRA_DEMO_MODE: booleanString,
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_APP_VERSION: z.string().min(1),
  NEXT_PUBLIC_MAX_IMAGE_SIZE_MB: numberStringWithDefault("10"),
  NEXT_PUBLIC_MAX_AUDIO_SIZE_MB: numberStringWithDefault("25"),
  NEXT_PUBLIC_VOICE_ENABLED: defaultedBooleanString("false"),
  NEXT_PUBLIC_VISION_ENABLED: defaultedBooleanString("false"),
});

const serverEnvSchema = publicEnvSchema
  .extend({
    NEXT_PUBLIC_SUPABASE_URL: optionalTrimmedString(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalTrimmedString(20),
    SUPABASE_SERVICE_ROLE_KEY: optionalTrimmedString(20),
    AI_ENGINE_OLLAMA_ENABLED: defaultedBooleanString("false"),
    OLLAMA_BASE_URL: optionalTrimmedString(),
    OLLAMA_MODEL: optionalTrimmedString(),
    OPENAI_API_KEY: optionalTrimmedString(20),
    OPENAI_MODEL: optionalTrimmedString(),
    OPENAI_VISION_MODEL: optionalTrimmedString(),
    OPENAI_TRANSCRIPTION_MODEL: optionalTrimmedString(),
    OPENAI_TTS_MODEL: optionalTrimmedString(),
    OPENAI_TTS_VOICE: optionalTrimmedString(),
  })
  .superRefine((env, ctx) => {
    if (env.HANIRA_DEMO_MODE) return;

    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ] as const) {
      if (!env[name]) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `${name} e obrigatoria fora do modo demonstracao.`,
        });
      }
    }

    if (!env.AI_ENGINE_OLLAMA_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_ENGINE_OLLAMA_ENABLED"],
        message: "O runtime principal atual exige AI_ENGINE_OLLAMA_ENABLED=true.",
      });
    }

    for (const name of ["OLLAMA_BASE_URL", "OLLAMA_MODEL"] as const) {
      if (!env[name]) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `${name} e obrigatoria quando o runtime Ollama esta ativo.`,
        });
      }
    }

    const requireOpenAI = (
      fields: ReadonlyArray<
        | "OPENAI_API_KEY"
        | "OPENAI_VISION_MODEL"
        | "OPENAI_TRANSCRIPTION_MODEL"
        | "OPENAI_TTS_MODEL"
        | "OPENAI_TTS_VOICE"
      >,
    ) => {
      for (const name of fields) {
        if (!env[name]) {
          ctx.addIssue({
            code: "custom",
            path: [name],
            message: `${name} e obrigatoria para os recursos de OpenAI habilitados.`,
          });
        }
      }
    };

    if (env.NEXT_PUBLIC_VISION_ENABLED) {
      requireOpenAI(["OPENAI_API_KEY", "OPENAI_VISION_MODEL"]);
    }

    if (env.NEXT_PUBLIC_VOICE_ENABLED) {
      requireOpenAI([
        "OPENAI_API_KEY",
        "OPENAI_TRANSCRIPTION_MODEL",
        "OPENAI_TTS_MODEL",
        "OPENAI_TTS_VOICE",
      ]);
    }
  });

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export interface ServerEnv extends PublicEnv {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AI_ENGINE_OLLAMA_ENABLED: boolean;
  OLLAMA_BASE_URL: string;
  OLLAMA_MODEL: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_VISION_MODEL?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  OPENAI_TTS_MODEL?: string;
  OPENAI_TTS_VOICE?: string;
}

function readPublicEnvInput() {
  return {
    HANIRA_DEMO_MODE: process.env.HANIRA_DEMO_MODE,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    NEXT_PUBLIC_MAX_IMAGE_SIZE_MB: process.env.NEXT_PUBLIC_MAX_IMAGE_SIZE_MB,
    NEXT_PUBLIC_MAX_AUDIO_SIZE_MB: process.env.NEXT_PUBLIC_MAX_AUDIO_SIZE_MB,
    NEXT_PUBLIC_VOICE_ENABLED: process.env.NEXT_PUBLIC_VOICE_ENABLED,
    NEXT_PUBLIC_VISION_ENABLED: process.env.NEXT_PUBLIC_VISION_ENABLED,
  };
}

function formatEnvError(error: z.ZodError) {
  const names = error.issues.map((issue) => issue.path.join(".")).join(", ");
  return `Configuracao invalida da Hanira. Verifique: ${names}. Consulte .env.example.`;
}

export function getPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse(readPublicEnvInput());

  if (!parsed.success) throw new Error(formatEnvError(parsed.error));
  return parsed.data;
}

export function isDemoMode() {
  return getPublicEnv().HANIRA_DEMO_MODE;
}

export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    ...readPublicEnvInput(),
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AI_ENGINE_OLLAMA_ENABLED: process.env.AI_ENGINE_OLLAMA_ENABLED,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_VISION_MODEL: process.env.OPENAI_VISION_MODEL,
    OPENAI_TRANSCRIPTION_MODEL: process.env.OPENAI_TRANSCRIPTION_MODEL,
    OPENAI_TTS_MODEL: process.env.OPENAI_TTS_MODEL,
    OPENAI_TTS_VOICE: process.env.OPENAI_TTS_VOICE,
  });

  if (!parsed.success) throw new Error(formatEnvError(parsed.error));
  if (parsed.data.HANIRA_DEMO_MODE) {
    throw new Error("getServerEnv nao deve ser usado com HANIRA_DEMO_MODE=true.");
  }
  return parsed.data as ServerEnv;
}
