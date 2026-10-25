create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  chat_message_id uuid references public.chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists app_notifications_user_created_idx
  on public.app_notifications (user_id, created_at desc);

alter table public.app_notifications enable row level security;

revoke all on public.app_notifications from anon, authenticated;
grant select on public.app_notifications to authenticated;
grant update (read_at) on public.app_notifications to authenticated;

drop policy if exists "app_notifications_select_own"
on public.app_notifications;
create policy "app_notifications_select_own"
on public.app_notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "app_notifications_update_own"
on public.app_notifications;
create policy "app_notifications_update_own"
on public.app_notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.notify_service_request_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  event_title text;
  event_body text;
begin
  if tg_op = 'INSERT' then
    insert into public.app_notifications (
      user_id,
      type,
      title,
      body,
      service_request_id
    )
    values (
      new.motorist_id::uuid,
      'booking_submitted',
      'Booking request sent',
      'Your service request has been submitted.',
      new.id
    );

    if new.mechanic_id is not null then
      insert into public.app_notifications (
        user_id,
        type,
        title,
        body,
        service_request_id
      )
      values (
        new.mechanic_id,
        'booking_assigned',
        'New booking assigned',
        'A service request has been assigned to you.',
        new.id
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if (
      new.cancelled_by = 'motorist'
      or auth.uid() = new.motorist_id::uuid
    ) and new.mechanic_id is not null then
      recipient_id := new.mechanic_id;
    else
      recipient_id := new.motorist_id::uuid;
    end if;

    event_title := case lower(coalesce(new.status, ''))
      when 'accepted' then 'Booking accepted'
      when 'in_transit' then 'Mechanic on the way'
      when 'arrived' then 'Mechanic arrived'
      when 'in_progress' then 'Service started'
      when 'completed' then 'Service completed'
      when 'cancelled' then 'Booking cancelled'
      when 'canceled' then 'Booking cancelled'
      when 'closed' then 'Booking closed'
      else 'Booking updated'
    end;

    event_body := case lower(coalesce(new.status, ''))
      when 'accepted' then 'Your mechanic accepted the booking.'
      when 'in_transit' then 'Your mechanic is on the way to your location.'
      when 'arrived' then 'Your mechanic has arrived at the service location.'
      when 'in_progress' then 'The service for your booking has started.'
      when 'completed' then 'The service for your booking has been completed.'
      when 'cancelled' then 'This booking has been cancelled.'
      when 'canceled' then 'This booking has been cancelled.'
      when 'closed' then 'This booking has been closed.'
      else 'The status of your booking has changed.'
    end;

    if recipient_id is not null
      and recipient_id is distinct from auth.uid() then
      insert into public.app_notifications (
        user_id,
        type,
        title,
        body,
        service_request_id
      )
      values (
        recipient_id,
        'booking_status',
        event_title,
        event_body,
        new.id
      );
    end if;
  end if;

  if new.mechanic_id is distinct from old.mechanic_id
    and new.mechanic_id is not null
    and new.mechanic_id is distinct from auth.uid() then
    insert into public.app_notifications (
      user_id,
      type,
      title,
      body,
      service_request_id
    )
    values (
      new.mechanic_id,
      'booking_assigned',
      'New booking assigned',
      'A service request has been assigned to you.',
      new.id
    );
  end if;

  if new.additional_charges is distinct from old.additional_charges then
    recipient_id := case
      when auth.uid() = new.mechanic_id then new.motorist_id::uuid
      when auth.uid() = new.motorist_id::uuid then new.mechanic_id
      else null
    end;

    if recipient_id is not null then
      insert into public.app_notifications (
        user_id,
        type,
        title,
        body,
        service_request_id
      )
      values (
        recipient_id,
        'repair_charge',
        'Repair charge updated',
        'Additional repair charges were updated for your booking.',
        new.id
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists service_request_app_notifications
on public.service_requests;
create trigger service_request_app_notifications
after insert or update of status, mechanic_id, additional_charges
on public.service_requests
for each row
execute function public.notify_service_request_changes();

create or replace function public.notify_chat_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recipient_id is distinct from new.sender_id then
    insert into public.app_notifications (
      user_id,
      type,
      title,
      body,
      service_request_id,
      chat_message_id
    )
    values (
      new.recipient_id,
      'chat_message',
      'New chat message',
      coalesce(nullif(left(trim(new.body), 140), ''), 'You received a photo.'),
      new.service_request_id,
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists chat_message_app_notification
on public.chat_messages;
create trigger chat_message_app_notification
after insert on public.chat_messages
for each row
execute function public.notify_chat_message_recipient();

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_notifications'
  ) then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
end;
$$;
