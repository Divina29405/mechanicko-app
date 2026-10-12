-- Add exact pinned home locations for mechanic profiles and applications.
alter table if exists public.profiles
  add column if not exists home_latitude double precision;

alter table if exists public.profiles
  add column if not exists home_longitude double precision;

alter table if exists public.mechanic_applications
  add column if not exists home_latitude double precision;

alter table if exists public.mechanic_applications
  add column if not exists home_longitude double precision;
