-- Guest intake fields and rep-managed flight details.
-- Public guest links and outbound email still require a server-side delivery function.

begin;

alter table public.guests
  add column if not exists phone text not null default '',
  add column if not exists title text not null default '',
  add column if not exists allergies text not null default '',
  add column if not exists favorite_drink text not null default '',
  add column if not exists birthday date,
  add column if not exists social_media_consent boolean not null default false,
  add column if not exists preferred_name text not null default '',
  add column if not exists where_based text not null default '',
  add column if not exists preferred_language text not null default 'English'
    check (preferred_language in ('English', 'French')),
  add column if not exists special_request text not null default '',
  add column if not exists travel_mode text not null default 'Plane'
    check (travel_mode in ('Plane', 'Car', 'Other')),
  add column if not exists guest_questionnaire_sent_at timestamptz,
  add column if not exists guest_intake_completed_at timestamptz;

alter table public.visits
  add column if not exists travel_guide_published_at timestamptz;

create or replace function public.can_edit_booking(target_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = target_booking_id
      and (
        public.can_edit_visit(b.visit_id)
        or (
          b.booking_type = 'Flight'
          and public.can_manage_guest_data(b.visit_id)
        )
      )
  );
$$;

drop policy if exists "editors add bookings" on public.bookings;
create policy "editors add bookings"
  on public.bookings for insert to authenticated
  with check (
    (
      public.can_edit_visit(visit_id)
      or (booking_type = 'Flight' and public.can_manage_guest_data(visit_id))
    )
    and created_by = auth.uid()
    and (public.is_super_admin() or status = 'To Do')
  );

drop policy if exists "editors add activity" on public.activity_log;
create policy "editors add activity"
  on public.activity_log for insert to authenticated
  with check (
    (
      public.can_edit_visit(visit_id)
      or public.can_manage_guest_data(visit_id)
    )
    and actor_id = auth.uid()
  );

create or replace function public.notify_visit_team(target_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  target_visit public.visits%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'Only Monserrat can send visit assignment notifications.'
      using errcode = '42501';
  end if;

  select * into target_visit
  from public.visits v
  where v.id = target_visit_id;

  if not found then return; end if;

  insert into public.notifications (user_id, visit_id, category, title, message)
  select distinct team.user_id,
    target_visit.id,
    'visit_created',
    'New visit assigned',
    target_visit.name || ' · ' || coalesce(target_visit.start_date::text, 'Dates TBD') ||
      ' to ' || coalesce(target_visit.end_date::text, 'TBD') || '. You have been added to the visit team.'
  from (
    select target_visit.lead_vp_id as user_id
    union
    select vm.user_id
    from public.visit_members vm
    where vm.visit_id = target_visit.id
  ) team
  join public.profiles p on p.id = team.user_id and p.is_active
  where team.user_id <> auth.uid()
    and not exists (
      select 1 from public.notifications n
      where n.user_id = team.user_id
        and n.visit_id = target_visit.id
        and n.category = 'visit_created'
    );
end;
$$;

revoke all on function public.notify_visit_team(uuid) from public;
grant execute on function public.notify_visit_team(uuid) to authenticated;

commit;
