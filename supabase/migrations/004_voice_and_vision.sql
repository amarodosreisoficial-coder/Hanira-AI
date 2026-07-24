create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  type text not null check (type in ('image', 'audio')),
  storage_bucket text not null check (storage_bucket in ('chat-images', 'chat-audio')),
  storage_path text not null,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  check (storage_path !~ '(^|/)\.\.(/|$)')
);

create index if not exists attachments_user_created_idx
  on public.attachments(user_id, created_at desc);

create index if not exists attachments_conversation_idx
  on public.attachments(conversation_id, created_at);

create index if not exists attachments_message_idx
  on public.attachments(message_id)
  where message_id is not null;

alter table public.attachments enable row level security;

drop policy if exists "attachments_own_data" on public.attachments;
create policy "attachments_own_data" on public.attachments
  for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations
      where conversations.id = attachments.conversation_id
        and conversations.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations
      where conversations.id = attachments.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-audio',
  'chat-audio',
  false,
  26214400,
  array['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat_media_upload_own_folder" on storage.objects;
create policy "chat_media_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('chat-images', 'chat-audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat_media_read_own_folder" on storage.objects;
create policy "chat_media_read_own_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('chat-images', 'chat-audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat_media_delete_own_folder" on storage.objects;
create policy "chat_media_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('chat-images', 'chat-audio')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

alter table public.user_settings
  add column if not exists auto_speak boolean not null default false,
  add column if not exists audio_autoplay boolean not null default false,
  add column if not exists tts_voice text not null default 'alloy',
  add column if not exists speech_rate numeric(3,2) not null default 1
    check (speech_rate between 0.5 and 2),
  add column if not exists transcription_enabled boolean not null default true,
  add column if not exists voice_conversation_enabled boolean not null default false,
  add column if not exists privacy_notice_dismissed boolean not null default false;

insert into public.system_metadata (key, value, updated_at)
values ('schema_version', '004', now())
on conflict (key)
do update set value = excluded.value, updated_at = excluded.updated_at;

