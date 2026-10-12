alter table if exists public.profiles
  add column if not exists maintenance_pricing jsonb not null default '[]'::jsonb;

update public.profiles
set maintenance_pricing = '[]'::jsonb
where maintenance_pricing is null;
