import { describe, expect, it } from "vitest";
import { analyzeEnvironment, parseEnvFile } from "../scripts/doctor.mjs";

const base = {
  HANIRA_DEMO_MODE: "true",
  NEXT_PUBLIC_APP_URL: "http://localhost:3002",
  NEXT_PUBLIC_APP_VERSION: "0.4.0",
  NEXT_PUBLIC_MAX_IMAGE_SIZE_MB: "10",
  NEXT_PUBLIC_MAX_AUDIO_SIZE_MB: "25",
  NEXT_PUBLIC_VOICE_ENABLED: "false",
  NEXT_PUBLIC_VISION_ENABLED: "false",
};

describe("Hanira Doctor", () => {
  it("aceita modo demonstracao sem credenciais externas", () => {
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

  it("aceita formato plausivel no modo real com Ollama", () => {
    const result = analyzeEnvironment({
      ...base,
      HANIRA_DEMO_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
      AI_ENGINE_OLLAMA_ENABLED: "true",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      OLLAMA_MODEL: "qwen2.5:7b",
    });
    expect(result.hasErrors).toBe(false);
  });

  it("exige OpenAI apenas quando voz ou visao estao habilitadas", () => {
    const result = analyzeEnvironment({
      ...base,
      HANIRA_DEMO_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
      AI_ENGINE_OLLAMA_ENABLED: "true",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      OLLAMA_MODEL: "qwen2.5:7b",
      NEXT_PUBLIC_VOICE_ENABLED: "true",
    });
    expect(result.hasErrors).toBe(true);
  });

  it("detecta segredo com prefixo publico sem revelar o valor", () => {
    const secret = "sk-super-secret-value";
    const result = analyzeEnvironment({
      ...base,
      NEXT_PUBLIC_OPENAI_API_KEY: secret,
    });
    expect(result.hasErrors).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("interpreta comentarios, espacos e aspas em .env", () => {
    expect(
      parseEnvFile(
        '# comentario\nHANIRA_DEMO_MODE="true"\nNEXT_PUBLIC_APP_URL = http://localhost:3002\n',
      ),
    ).toEqual({
      HANIRA_DEMO_MODE: "true",
      NEXT_PUBLIC_APP_URL: "http://localhost:3002",
    });
  });
});
