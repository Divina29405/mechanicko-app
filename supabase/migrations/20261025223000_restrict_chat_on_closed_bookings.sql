drop policy if exists "chat_messages_participants_insert"
on public.chat_messages;

create policy "chat_messages_participants_insert"
on public.chat_messages for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.service_requests request
    where request.id = service_request_id
      and (
        request.motorist_id = auth.uid()::text
        or request.mechanic_id = auth.uid()
      )
      and lower(coalesce(request.status, '')) in (
        'scheduled',
        'pending',
        'accepted',
        'arrived',
        'in_transit',
        'in_progress',
        'ongoing'
      )
  )
);
