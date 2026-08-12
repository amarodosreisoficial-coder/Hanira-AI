-- Adds an explicit global/project scope without replacing existing project memories.
alter table public.memories
  alter column project_id drop not null;

alter table public.memories
  add column if not exists scope text not null default 'project';

update public.memories
set scope = case when project_id is null then 'global' else 'project' end
where scope is null or scope not in ('global', 'project');

alter table public.memories
  drop constraint if exists memories_scope_project_consistency;
alter table public.memories
  add constraint memories_scope_project_consistency
  check ((scope = 'global' and project_id is null) or (scope = 'project' and project_id is not null));

create index if not exists memories_user_global_active_idx
  on public.memories(user_id, created_at desc)
  where is_active = true and scope = 'global';

create index if not exists memories_user_scope_project_active_idx
  on public.memories(user_id, scope, project_id, created_at desc)
  where is_active = true;
