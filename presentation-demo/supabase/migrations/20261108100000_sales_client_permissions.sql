-- Sales reps may manage client guest details on visits they are assigned to.
begin;

create or replace function public.can_manage_guest_data(target_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select public.can_edit_visit(target_visit_id)
    or exists (
      select 1
      from public.visits v
      join public.profiles p on p.id = auth.uid()
        and p.global_role = 'SALES'
        and p.is_active
      join public.visit_members vm on vm.visit_id = v.id
        and vm.user_id = p.id
        and vm.visit_role = 'SALES'
      where v.id = target_visit_id
        and not v.archived
        and v.status not in ('Completed', 'Cancelled')
    );
$$;

revoke all on function public.can_manage_guest_data(uuid) from public;
grant execute on function public.can_manage_guest_data(uuid) to authenticated;

drop policy if exists "editors add guests" on public.guests;
create policy "editors add guests"
  on public.guests for insert to authenticated
  with check (
    public.can_edit_visit(visit_id)
    or (profile_id is null and public.can_manage_guest_data(visit_id))
  );

drop policy if exists "editors update guests" on public.guests;
create policy "editors update guests"
  on public.guests for update to authenticated
  using (
    public.can_edit_visit(visit_id)
    or (profile_id is null and public.can_manage_guest_data(visit_id))
  )
  with check (
    public.can_edit_visit(visit_id)
    or (profile_id is null and public.can_manage_guest_data(visit_id))
  );

create or replace function public.guard_guest_profile_link()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if tg_op = 'INSERT' then
    if new.profile_id is not null and not public.can_edit_visit(new.visit_id) then
      raise exception 'Only a visit editor can link an internal profile to a guest.'
        using errcode = '42501';
    end if;
  elsif new.profile_id is distinct from old.profile_id
    and not public.can_edit_visit(new.visit_id) then
    raise exception 'Only a visit editor can change an internal guest profile link.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guests_guard_profile_link
  before insert or update of profile_id on public.guests
  for each row execute function public.guard_guest_profile_link();

commit;
