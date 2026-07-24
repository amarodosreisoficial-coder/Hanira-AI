create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  slug text not null check (btrim(slug) <> ''),
  description text,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists projects_user_slug_idx
  on public.projects(user_id, slug);

create unique index if not exists projects_one_default_per_user_idx
  on public.projects(user_id)
  where is_default = true and archived_at is null;

create index if not exists projects_user_created_idx
  on public.projects(user_id, created_at desc);

alter table public.projects enable row level security;

drop policy if exists "projects_own_data" on public.projects;
create policy "projects_own_data" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.personalities (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  instructions text not null default '',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists personalities_one_active_per_project_idx
  on public.personalities(project_id)
  where is_active = true;

create index if not exists personalities_project_created_idx
  on public.personalities(project_id, created_at desc);

alter table public.personalities enable row level security;

drop policy if exists "personalities_through_owned_project" on public.personalities;
create policy "personalities_through_owned_project" on public.personalities
  for all using (
    exists (
      select 1
      from public.projects
      where projects.id = personalities.project_id
        and projects.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1
      from public.projects
      where projects.id = personalities.project_id
        and projects.user_id = auth.uid()
    )
  );

alter table public.conversations
  add column if not exists project_id uuid references public.projects(id) on delete restrict;

create index if not exists conversations_project_idx
  on public.conversations(project_id, updated_at desc);

create index if not exists conversations_user_project_updated_idx
  on public.conversations(user_id, project_id, updated_at desc);

insert into public.projects (user_id, name, slug, is_default)
select distinct
  owners.user_id,
  'Meu projeto',
  'meu-projeto',
  true
from (
  select user_id from public.conversations
  union
  select user_id from public.user_settings
  union
  select user_id from public.memories
) as owners
where owners.user_id is not null
on conflict (user_id, slug) do nothing;

update public.projects projects
set is_default = true
where not exists (
  select 1
  from public.projects defaults
  where defaults.user_id = projects.user_id
    and defaults.is_default = true
    and defaults.archived_at is null
)
and projects.slug = 'meu-projeto'
and projects.archived_at is null;

update public.conversations conversations
set project_id = projects.id
from public.projects
where conversations.project_id is null
  and projects.user_id = conversations.user_id
  and projects.is_default = true
  and projects.archived_at is null;

alter table public.conversations
  alter column project_id set not null;

alter table public.memories
  add column if not exists project_id uuid references public.projects(id) on delete restrict;

update public.memories memories
set project_id = conversations.project_id
from public.conversations
where memories.project_id is null
  and memories.source_conversation_id = conversations.id
  and conversations.project_id is not null;

create index if not exists memories_user_project_active_idx
  on public.memories(user_id, project_id, created_at desc)
  where is_active = true and project_id is not null;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists personalities_set_updated_at on public.personalities;
create trigger personalities_set_updated_at
  before update on public.personalities
  for each row execute function public.set_updated_at();
