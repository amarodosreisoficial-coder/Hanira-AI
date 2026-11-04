-- D.11: persistent technical diagnostics for Ikigai failures (no personal data)
create table if not exists public.ikigai_diagnostics (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  created_at timestamptz not null default now(),
  route text not null,
  stage text not null,
  internal_code text not null,
  failure_category text not null,
  public_code text not null,
  provider text,
  model text,
  provider_status integer,
  duration_ms integer not null,
  section text
);

create index if not exists ikigai_diagnostics_created_at_idx
  on public.ikigai_diagnostics (created_at desc);
create index if not exists ikigai_diagnostics_request_id_idx
  on public.ikigai_diagnostics (request_id);

alter table public.ikigai_diagnostics enable row level security;

-- No public read/write policies: server-side service role only.
-- Retention: manual cleanup recommended every 30 days (no guaranteed free cron).
comment on table public.ikigai_diagnostics is 'Technical diagnostics only. No personal data. Retain <= 30 days.';
