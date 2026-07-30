import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

vi.mock("server-only", () => ({}));

function applyEnv(values: Record<string, string | undefined>) {
  process.env = {
    ...originalEnv,
    ...values,
  };
}

async function loadEnvModule() {
  return import("../lib/env");
}

describe("environment validation", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("aceita modo real com Ollama sem OpenAI quando voz e visao estao desligadas", async () => {
    applyEnv({
      HANIRA_DEMO_MODE: "false",
      NEXT_PUBLIC_APP_URL: "http://localhost:3002",
      NEXT_PUBLIC_APP_VERSION: "0.4.0",
      NEXT_PUBLIC_MAX_IMAGE_SIZE_MB: "10",
      NEXT_PUBLIC_MAX_AUDIO_SIZE_MB: "25",
      NEXT_PUBLIC_VOICE_ENABLED: "false",
      NEXT_PUBLIC_VISION_ENABLED: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example_key_12345",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example_key_123456789",
      AI_ENGINE_OLLAMA_ENABLED: "true",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      OLLAMA_MODEL: "qwen2.5:7b",
      OPENAI_API_KEY: undefined,
      OPENAI_VISION_MODEL: undefined,
      OPENAI_TRANSCRIPTION_MODEL: undefined,
      OPENAI_TTS_MODEL: undefined,
      OPENAI_TTS_VOICE: undefined,
    });

    const { getServerEnv } = await loadEnvModule();
    expect(getServerEnv()).toMatchObject({
      HANIRA_DEMO_MODE: false,
      AI_ENGINE_OLLAMA_ENABLED: true,
      OLLAMA_MODEL: "qwen2.5:7b",
      NEXT_PUBLIC_VOICE_ENABLED: false,
      NEXT_PUBLIC_VISION_ENABLED: false,
    });
  });

  it("usa defaults seguros para flags publicas ausentes", async () => {
    applyEnv({
      HANIRA_DEMO_MODE: "true",
      NEXT_PUBLIC_APP_URL: "http://localhost:3002",
      NEXT_PUBLIC_APP_VERSION: "0.4.0",
      NEXT_PUBLIC_MAX_IMAGE_SIZE_MB: undefined,
      NEXT_PUBLIC_MAX_AUDIO_SIZE_MB: undefined,
      NEXT_PUBLIC_VOICE_ENABLED: undefined,
      NEXT_PUBLIC_VISION_ENABLED: undefined,
    });

    const { getPublicEnv, isDemoMode } = await loadEnvModule();
    expect(isDemoMode()).toBe(true);
    expect(getPublicEnv()).toMatchObject({
      NEXT_PUBLIC_MAX_IMAGE_SIZE_MB: 10,
      NEXT_PUBLIC_MAX_AUDIO_SIZE_MB: 25,
      NEXT_PUBLIC_VOICE_ENABLED: false,
      NEXT_PUBLIC_VISION_ENABLED: false,
    });
  });

  it("exige configuracao OpenAI apenas para recursos habilitados", async () => {
    applyEnv({
      HANIRA_DEMO_MODE: "false",
      NEXT_PUBLIC_APP_URL: "http://localhost:3002",
      NEXT_PUBLIC_APP_VERSION: "0.4.0",
      NEXT_PUBLIC_MAX_IMAGE_SIZE_MB: "10",
      NEXT_PUBLIC_MAX_AUDIO_SIZE_MB: "25",
      NEXT_PUBLIC_VOICE_ENABLED: "true",
      NEXT_PUBLIC_VISION_ENABLED: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example_key_12345",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example_key_123456789",
      AI_ENGINE_OLLAMA_ENABLED: "true",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      OLLAMA_MODEL: "qwen2.5:7b",
    });

    const { getServerEnv } = await loadEnvModule();
    expect(() => getServerEnv()).toThrow(/OPENAI_API_KEY|OPENAI_TRANSCRIPTION_MODEL/);
  });
});
