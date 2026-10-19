-- Pacote 18.4 — Voice Internationalization (país/idiomas adicionais/detecção automática).
-- CRIADA LOCALMENTE — NÃO APLICADA REMOTAMENTE (requer autorização humana antes de executar).
-- Compatível e incremental: add column if not exists; não toca em nenhuma outra tabela;
-- não altera a migration 009 (permanece ativa/verificada no Supabase remoto).
-- Regra: país NÃO define idioma — country/region são geografia independente de language.

alter table public.user_settings
  add column if not exists country text
    check (country is null or country ~ '^[A-Z]{2}$'),
  add column if not exists region text
    check (region is null or char_length(region) <= 80),
  add column if not exists additional_languages text[] not null default '{}'
    check (additional_languages <@ array['pt-BR', 'en', 'es']),
  add column if not exists auto_detect_language boolean not null default false;

insert into public.system_metadata (key, value, updated_at)
values ('schema_version', '010', now())
on conflict (key)
do update set value = excluded.value, updated_at = excluded.updated_at;
