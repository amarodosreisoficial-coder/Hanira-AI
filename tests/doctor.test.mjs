import { describe, expect, it } from "vitest";
import { analyzeEnvironment, parseEnvFile } from "../scripts/doctor.mjs";

const base = {
  HANIRA_DEMO_MODE: "true",
  NEXT_PUBLIC_APP_URL: "http://localhost:3002",
  NEXT_PUBLIC_APP_VERSION: "0.4.0",
  NEXT_PUBLIC_MAX_IMAGE_SIZE_MB: "10",
  NEXT_PUBLIC_MAX_AUDIO_SIZE_MB: "25",
  NEXT_PUBLIC_VOICE_ENABLED: "true",
  NEXT_PUBLIC_VISION_ENABLED: "true",
};

describe("Hanira Doctor", () => {
  it("aceita modo demonstração sem credenciais externas", () => {
    const result = analyzeEnvironment(base);
    expect(result.mode).toBe("demo");
    expect(result.hasErrors).toBe(false);
  });

  it("bloqueia modo real sem credenciais", () => {
    const result = analyzeEnvironment({
      ...base,
      HANIRA_DEMO_MODE: "false",
    });
    expect(result.mode).toBe("production");
    expect(result.hasErrors).toBe(true);
  });

  it("aceita formatos plausíveis no modo real", () => {
    const result = analyzeEnvironment({
      ...base,
      HANIRA_DEMO_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
      OPENAI_API_KEY: "sk-example-key-with-safe-length",
      OPENAI_MODEL: "model-example",
      OPENAI_VISION_MODEL: "vision-example",
      OPENAI_TRANSCRIPTION_MODEL: "transcribe-example",
      OPENAI_TTS_MODEL: "tts-example",
      OPENAI_TTS_VOICE: "alloy",
    });
    expect(result.hasErrors).toBe(false);
  });

  it("detecta segredo com prefixo público sem revelar o valor", () => {
    const secret = "sk-super-secret-value";
    const result = analyzeEnvironment({
      ...base,
      NEXT_PUBLIC_OPENAI_API_KEY: secret,
    });
    expect(result.hasErrors).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("interpreta comentários, espaços e aspas em .env", () => {
    expect(
      parseEnvFile(
        '# comentário\nHANIRA_DEMO_MODE="true"\nNEXT_PUBLIC_APP_URL = http://localhost:3002\n',
      ),
    ).toEqual({
      HANIRA_DEMO_MODE: "true",
      NEXT_PUBLIC_APP_URL: "http://localhost:3002",
    });
  });
});
