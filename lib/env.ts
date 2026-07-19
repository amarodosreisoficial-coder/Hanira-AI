import "server-only";
import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const positiveNumberString = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .transform(Number)
  .pipe(z.number().positive().max(100));

const baseSchema = z.object({
  HANIRA_DEMO_MODE: booleanString,
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_APP_VERSION: z.string().min(1),
  NEXT_PUBLIC_MAX_IMAGE_SIZE_MB: positiveNumberString,
  NEXT_PUBLIC_MAX_AUDIO_SIZE_MB: positiveNumberString,
  NEXT_PUBLIC_VOICE_ENABLED: booleanString,
  NEXT_PUBLIC_VISION_ENABLED: booleanString,
});

const productionSchema = baseSchema.extend({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  OPENAI_API_KEY: z.string().min(20),
  OPENAI_MODEL: z.string().min(1),
  OPENAI_VISION_MODEL: z.string().min(1),
  OPENAI_TRANSCRIPTION_MODEL: z.string().min(1),
  OPENAI_TTS_MODEL: z.string().min(1),
  OPENAI_TTS_VOICE: z.string().min(1),
});

export type ServerEnv = z.infer<typeof productionSchema>;

function formatEnvError(error: z.ZodError) {
  const names = error.issues.map((issue) => issue.path.join(".")).join(", ");
  return `Configuração inválida da Hanira. Verifique: ${names}. Consulte .env.example.`;
}

export function isDemoMode() {
  const parsed = baseSchema.safeParse({
    HANIRA_DEMO_MODE: process.env.HANIRA_DEMO_MODE,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    NEXT_PUBLIC_MAX_IMAGE_SIZE_MB:
      process.env.NEXT_PUBLIC_MAX_IMAGE_SIZE_MB,
    NEXT_PUBLIC_MAX_AUDIO_SIZE_MB:
      process.env.NEXT_PUBLIC_MAX_AUDIO_SIZE_MB,
    NEXT_PUBLIC_VOICE_ENABLED: process.env.NEXT_PUBLIC_VOICE_ENABLED,
    NEXT_PUBLIC_VISION_ENABLED: process.env.NEXT_PUBLIC_VISION_ENABLED,
  });

  if (!parsed.success) throw new Error(formatEnvError(parsed.error));
  return parsed.data.HANIRA_DEMO_MODE;
}

export function getServerEnv(): ServerEnv {
  const parsed = productionSchema.safeParse({
    HANIRA_DEMO_MODE: process.env.HANIRA_DEMO_MODE,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_VISION_MODEL: process.env.OPENAI_VISION_MODEL,
    OPENAI_TRANSCRIPTION_MODEL: process.env.OPENAI_TRANSCRIPTION_MODEL,
    OPENAI_TTS_MODEL: process.env.OPENAI_TTS_MODEL,
    OPENAI_TTS_VOICE: process.env.OPENAI_TTS_VOICE,
  });

  if (!parsed.success) throw new Error(formatEnvError(parsed.error));
  if (parsed.data.HANIRA_DEMO_MODE) {
    throw new Error(
      "getServerEnv não deve ser usado com HANIRA_DEMO_MODE=true.",
    );
  }
  return parsed.data;
}
