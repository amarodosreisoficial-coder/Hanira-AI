-- Consulta somente leitura para verificar a instalacao da Hanira.
-- Execute no SQL Editor do Supabase apos as migrations 001, 002, 003, 004 e 005.

select
  expected.table_name,
  to_regclass('public.' || expected.table_name) is not null as exists,
  coalesce(classes.relrowsecurity, false) as rls_enabled
from (
  values
    ('profiles'),
    ('projects'),
    ('personalities'),
    ('conversations'),
    ('messages'),
    ('memories'),
    ('user_settings'),
    ('system_metadata'),
    ('attachments')
) as expected(table_name)
left join pg_class classes
  on classes.oid = to_regclass('public.' || expected.table_name)
order by expected.table_name;

select key, value, updated_at
from public.system_metadata
where key = 'schema_version';

select
  conrelid::regclass as table_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.projects'::regclass,
  'public.personalities'::regclass,
  'public.conversations'::regclass,
  'public.memories'::regclass
)
order by conrelid::regclass::text, conname;

select
  event_object_table as table_name,
  trigger_name
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;

select
  id as bucket,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id in ('chat-images', 'chat-audio')
order by id;

select
  policyname,
  tablename,
  cmd
from pg_policies
where schemaname in ('public', 'storage')
  and (
    tablename in ('attachments', 'projects', 'personalities')
    or policyname like 'chat_media_%'
    or policyname = 'projects_own_data'
    or policyname = 'personalities_through_owned_project'
  )
order by schemaname, tablename, policyname;
