-- Consulta somente leitura para verificar a instalação da Hanira.
-- Execute no SQL Editor do Supabase após as migrations 001, 002, 003 e 004.

select
  expected.table_name,
  to_regclass('public.' || expected.table_name) is not null as exists,
  coalesce(classes.relrowsecurity, false) as rls_enabled
from (
  values
    ('profiles'),
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
    tablename = 'attachments'
    or policyname like 'chat_media_%'
  )
order by schemaname, tablename, policyname;
