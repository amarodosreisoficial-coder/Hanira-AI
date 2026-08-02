alter table public.attachments
  drop constraint if exists attachments_type_check;

alter table public.attachments
  add constraint attachments_type_check
  check (type in ('image', 'audio', 'document'));

alter table public.attachments
  drop constraint if exists attachments_storage_bucket_check;

alter table public.attachments
  add constraint attachments_storage_bucket_check
  check (storage_bucket in ('chat-images', 'chat-audio', 'chat-documents'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-documents',
  'chat-documents',
  false,
  5242880,
  array['application/pdf', 'text/plain', 'text/markdown']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat_media_upload_own_folder" on storage.objects;
create policy "chat_media_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('chat-images', 'chat-audio', 'chat-documents')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat_media_read_own_folder" on storage.objects;
create policy "chat_media_read_own_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('chat-images', 'chat-audio', 'chat-documents')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat_media_delete_own_folder" on storage.objects;
create policy "chat_media_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('chat-images', 'chat-audio', 'chat-documents')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

insert into public.system_metadata (key, value, updated_at)
values ('schema_version', '006', now())
on conflict (key)
do update set value = excluded.value, updated_at = excluded.updated_at;
