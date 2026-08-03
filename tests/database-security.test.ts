import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration002 = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/002_functional_product.sql"),
  "utf8",
);
const migration003 = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/003_activation_hardening.sql"),
  "utf8",
);
const migration004 = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/004_voice_and_vision.sql"),
  "utf8",
);
const migration006 = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/006_document_attachments.sql"),
  "utf8",
);

describe("seguranca e evolucao do banco", () => {
  it("mantem ownership de mensagens e configuracoes via RLS", () => {
    expect(migration002).toContain("auth.uid() = user_id");
    expect(migration002).toContain("user_settings_own_data");
    expect(migration002).toContain("messages_own_data");
  });

  it("isola anexos e buckets privados por usuario", () => {
    expect(migration004).toContain("create table if not exists public.attachments");
    expect(migration004).toContain("attachments_own_data");
    expect(migration004).toContain("storage.foldername(name))[1] = auth.uid()::text");
    expect(migration004).toContain("'chat-images'");
    expect(migration004).toContain("'chat-audio'");
    expect(migration004).toMatch(
      /'chat-images',\s*'chat-images',\s*false,\s*10485760/,
    );
    expect(migration004).toMatch(
      /'chat-audio',\s*'chat-audio',\s*false,\s*26214400/,
    );
    expect(migration004).toContain("'schema_version', '004'");
    expect(migration004.toLowerCase()).not.toContain("drop table");
  });

  it("expande anexos para documentos sem abrir buckets publicos", () => {
    expect(migration006).toContain("'chat-documents'");
    expect(migration006).toContain("type in ('image', 'audio', 'document')");
    expect(migration006).toContain("storage.foldername(name))[1] = auth.uid()::text");
    expect(migration006).toMatch(
      /'chat-documents',\s*'chat-documents',\s*false,\s*5242880/,
    );
    expect(migration006).toContain("'schema_version', '006'");
    expect(migration006.toLowerCase()).not.toContain("drop table");
  });

  it("adiciona idempotencia sem apagar tabelas", () => {
    expect(migration003).toContain("unique (conversation_id, request_id, role)");
    expect(migration003).toContain("'schema_version', '003'");
    expect(migration003.toLowerCase()).not.toContain("drop table");
  });
});
