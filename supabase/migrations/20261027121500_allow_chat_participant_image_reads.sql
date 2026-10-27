drop policy if exists "chat_media_own_select" on storage.objects;
drop policy if exists "chat_media_participants_select" on storage.objects;

create policy "chat_media_participants_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-media'
  and exists (
    select 1
    from public.chat_messages message
    join public.service_requests request
      on request.id = message.service_request_id
    where message.image_url is not null
      and message.sender_id::text = (storage.foldername(name))[1]
      and message.service_request_id::text = (storage.foldername(name))[2]
      and (
        request.motorist_id = auth.uid()::text
        or request.mechanic_id::text = auth.uid()::text
      )
  )
);
