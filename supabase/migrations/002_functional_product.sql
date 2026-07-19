alter table public.conversations
  add column if not exists archived_at timestamptz;

alter table public.messages
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.messages
set user_id = conversations.user_id
from public.conversations
where messages.conversation_id = conversations.id
  and messages.user_id is null;

alter table public.messages alter column user_id set not null;

alter table public.memories
  add column if not exists importance smallint not null default 1
    check (importance between 1 and 5),
  add column if not exists source_conversation_id uuid
    references public.conversations(id) on delete set null;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_name text,
  response_style text not null default 'equilibrado'
    check (response_style in ('equilibrado', 'conciso', 'detalhado', 'criativo', 'técnico')),
  memory_enabled boolean not null default true,
  voice_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

drop trigger if exists memories_set_updated_at on public.memories;
create trigger memories_set_updated_at
  before update on public.memories
  for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Pessoa'))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id, preferred_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_own_data" on public.user_settings;
create policy "user_settings_own_data" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "messages_through_own_conversation" on public.messages;
create policy "messages_own_data" on public.messages
  for all using (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  ) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

create index if not exists conversations_active_user_updated_idx
  on public.conversations(user_id, updated_at desc)
  where archived_at is null;

create index if not exists messages_user_created_idx
  on public.messages(user_id, created_at desc);

create index if not exists memories_search_idx
  on public.memories(user_id, category, importance desc, created_at desc)
  where is_active = true;
