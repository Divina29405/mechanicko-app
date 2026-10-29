create or replace function public.submit_mechanic_rating(
  p_service_request_id uuid,
  p_mechanic_id uuid,
  p_rating integer,
  p_review text default null
)
returns public.mechanic_ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.service_requests;
  rating_row public.mechanic_ratings;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to submit a rating';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id
    and motorist_id = auth.uid()::text
    and mechanic_id = p_mechanic_id
    and status in ('completed', 'done', 'resolved');

  if not found then
    raise exception 'Only the motorist of a completed booking can submit this rating';
  end if;

  insert into public.mechanic_ratings (
    service_request_id, mechanic_id, motorist_id, rating, review
  )
  values (
    p_service_request_id,
    p_mechanic_id,
    auth.uid(),
    p_rating,
    nullif(left(trim(p_review), 400), '')
  )
  returning * into rating_row;

  update public.profiles
  set average_rating = coalesce((
    select round(avg(rating)::numeric, 1)
    from public.mechanic_ratings
    where mechanic_id = p_mechanic_id
  ), 5.0),
  rating_count = (
    select count(*)
    from public.mechanic_ratings
    where mechanic_id = p_mechanic_id
  ),
  updated_at = now()
  where id = p_mechanic_id;

  return rating_row;
end;
$$;

revoke all on function public.submit_mechanic_rating(uuid, uuid, integer, text) from public;
grant execute on function public.submit_mechanic_rating(uuid, uuid, integer, text) to authenticated;
