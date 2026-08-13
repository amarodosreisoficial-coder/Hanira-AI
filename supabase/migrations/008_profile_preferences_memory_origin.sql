alter table public.user_settings
  add column if not exists occupation text,
  add column if not exists language text not null default 'pt-BR' check (language in ('pt-BR', 'en', 'es')),
  add column if not exists technical_level text not null default 'intermediate' check (technical_level in ('beginner', 'intermediate', 'advanced')),
  add column if not exists response_length text not null default 'balanced' check (response_length in ('short', 'balanced', 'detailed')),
  add column if not exists response_tone text not null default 'neutral' check (response_tone in ('professional', 'neutral', 'casual'));
alter table public.memories add column if not exists origin text not null default 'legacy'
  check (origin in ('explicit_user_request', 'inferred_from_message', 'manually_created', 'migrated', 'legacy', 'unknown'));
