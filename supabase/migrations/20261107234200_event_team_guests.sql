-- Keep the people assigned to a visit linked to their generated guest entries.
begin;

alter table public.guests
  add column if not exists profile_id uuid
  references public.profiles(id) on delete cascade;

create unique index if not exists guests_visit_profile_unique
  on public.guests (visit_id, profile_id)
  where profile_id is not null;

create index if not exists guests_profile_idx
  on public.guests (profile_id)
  where profile_id is not null;

commit;
