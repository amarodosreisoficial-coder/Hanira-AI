alter table public.messages
  add column if not exists request_id uuid;

update public.messages
set request_id = gen_random_uuid()
where request_id is null;

alter table public.messages
  alter column request_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_conversation_request_role_key'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_conversation_request_role_key
      unique (conversation_id, request_id, role);
  end if;
end;
$$;

create index if not exists messages_request_id_idx
  on public.messages(request_id);

create table if not exists public.system_metadata (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.system_metadata enable row level security;

insert into public.system_metadata (key, value, updated_at)
values ('schema_version', '003', now())
on conflict (key)
do update set value = excluded.value, updated_at = excluded.updated_at;

drop trigger if exists system_metadata_set_updated_at on public.system_metadata;
create trigger system_metadata_set_updated_at
  before update on public.system_metadata
  for each row execute function public.set_updated_at();

