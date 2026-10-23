alter table if exists public.chat_messages
  add column if not exists image_url text;

alter table if exists public.chat_messages
  alter column body drop not null;

alter table if exists public.chat_messages
  drop constraint if exists chat_messages_body_check;

alter table if exists public.chat_messages
  add constraint chat_messages_body_or_image_check
  check (length(trim(coalesce(body, ''))) > 0 or image_url is not null);

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

drop policy if exists "chat_media_own_select" on storage.objects;
create policy "chat_media_own_select"
on storage.objects for select
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "chat_media_own_insert" on storage.objects;
create policy "chat_media_own_insert"
on storage.objects for insert
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
