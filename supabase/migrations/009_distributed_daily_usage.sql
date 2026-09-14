-- Package 17.5 — Distributed Usage Guard + Free Capacity Protection.
-- MIGRATION 009: LOCAL ONLY / NOT APPLIED REMOTELY.
-- NAO executar supabase db push, supabase migration up remoto, nem SQL no
-- Dashboard remoto. Esta migration existe apenas no repositorio local ate
-- decisao explicita de rollout.
--
-- Proposito:
-- - quota diaria DISTRIBUIDA por usuario (dia UTC), contador atomico no
--   Postgres, compartilhado entre instancias (serverless/Vercel Hobby);
-- - texto default 200/dia, imagem default 10/dia (defaults resolvidos em
--   codigo via env; o SQL recebe o limite como parametro, sem hardcode de
--   plano/billing);
-- - zero billing, zero paid provider, zero novo recurso pago.
--
-- Rollout seguro:
-- - tabela + funcao sao idempotentes (IF NOT EXISTS / OR REPLACE);
-- - o codigo TS faz fallback para guarda em memoria quando a funcao/tabela
--   ainda nao existe no remoto (migracao nao aplicada) — nunca fail-open
--   silencioso para alem do limite local;
-- - env invalida falha em codigo (fail-closed), nunca no SQL.

create table if not exists public.daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  text_count integer not null default 0 check (text_count >= 0),
  image_count integer not null default 0 check (image_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.daily_usage enable row level security;

drop policy if exists "daily_usage_own_data" on public.daily_usage;
create policy "daily_usage_own_data" on public.daily_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists daily_usage_set_updated_at on public.daily_usage;
create trigger daily_usage_set_updated_at
  before update on public.daily_usage
  for each row execute function public.set_updated_at();

-- Contador atomico diario por usuario/kind.
-- Chamado via service_role (bypassa RLS); valida tudo de forma defensiva.
-- Uma chamada = no maximo +1 no kind solicitado, e somente quando abaixo do
-- limite. Concorrencia entre instancias e serializada pelo lock de linha
-- (SELECT ... FOR UPDATE) dentro da mesma transacao.
create or replace function public.consume_daily_usage(
  p_user_id uuid,
  p_kind text,
  p_limit integer
)
returns table (
  allowed boolean,
  used integer,
  remaining integer,
  retry_after_seconds integer,
  usage_day date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_text_count integer := 0;
  v_image_count integer := 0;
  v_used integer := 0;
  v_next_day_start timestamptz := (v_day + 1)::timestamptz;
  v_retry integer := greatest(1, ceil(extract(epoch from (v_next_day_start - now()))::numeric)::integer);
begin
  if p_user_id is null then
    raise exception 'consume_daily_usage exige p_user_id nao nulo.';
  end if;

  if p_kind not in ('text', 'image') then
    raise exception 'consume_daily_usage: p_kind deve ser text ou image.';
  end if;

  if p_limit is null or p_limit < 0 then
    raise exception 'consume_daily_usage: p_limit deve ser inteiro >= 0.';
  end if;

  -- Limite 0 = quota desativada (comportamento pre-17.5): nunca consome.
  if p_limit = 0 then
    allowed := true;
    used := 0;
    remaining := 0;
    retry_after_seconds := 0;
    usage_day := v_day;
    return next;
    return;
  end if;

  insert into public.daily_usage (user_id, usage_date)
  values (p_user_id, v_day)
  on conflict (user_id, usage_date) do nothing;

  select d.text_count, d.image_count
    into v_text_count, v_image_count
    from public.daily_usage as d
   where d.user_id = p_user_id
     and d.usage_date = v_day
   for update;

  if p_kind = 'text' then
    v_used := v_text_count;
  else
    v_used := v_image_count;
  end if;

  if v_used >= p_limit then
    allowed := false;
    used := v_used;
    remaining := 0;
    retry_after_seconds := v_retry;
    usage_day := v_day;
    return next;
    return;
  end if;

  if p_kind = 'text' then
    update public.daily_usage
       set text_count = text_count + 1
     where user_id = p_user_id
       and usage_date = v_day;
    v_used := v_used + 1;
  else
    update public.daily_usage
       set image_count = image_count + 1
     where user_id = p_user_id
       and usage_date = v_day;
    v_used := v_used + 1;
  end if;

  allowed := true;
  used := v_used;
  remaining := p_limit - v_used;
  retry_after_seconds := 0;
  usage_day := v_day;
  return next;
  return;
end;
$$;

revoke all on function public.consume_daily_usage(uuid, text, integer) from public;
grant execute on function public.consume_daily_usage(uuid, text, integer) to service_role;

insert into public.system_metadata (key, value, updated_at)
values ('schema_version', '009', now())
on conflict (key)
do update set value = excluded.value, updated_at = excluded.updated_at;
