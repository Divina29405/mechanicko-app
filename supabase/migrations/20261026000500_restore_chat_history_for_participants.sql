grant select on public.chat_messages to authenticated;

drop policy if exists "chat_messages_participants_select"
on public.chat_messages;

create policy "chat_messages_participants_select"
on public.chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.service_requests request
    where request.id = service_request_id
      and (
        request.motorist_id = auth.uid()::text
        or request.mechanic_id = auth.uid()
      )
  )
);
