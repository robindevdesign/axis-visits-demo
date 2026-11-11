-- Axis Visits shared MVP schema
-- Apply this migration to a new Supabase project before connecting the client.

begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text not null default '',
  last_name text not null default '',
  global_role text not null default 'SALES'
    check (global_role in ('SUPER_ADMIN', 'VP', 'SALES')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default '',
  country text not null default '',
  start_date date,
  end_date date,
  status text not null default 'Planning'
    check (status in ('Planning', 'Upcoming', 'In Progress', 'Completed', 'Cancelled')),
  lead_vp_id uuid not null references public.profiles(id),
  archived boolean not null default false,
  theme text not null default 'terracotta',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create table public.visit_members (
  visit_id uuid not null references public.visits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  visit_role text not null check (visit_role in ('COLLABORATING_VP', 'SALES')),
  created_at timestamptz not null default now(),
  primary key (visit_id, user_id)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null default '',
  company text not null default '',
  status text not null default 'Invited'
    check (status in ('Invited', 'Confirmed', 'Cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  booking_type text not null
    check (booking_type in ('Flight', 'Hotel', 'Transportation', 'Restaurant', 'Activity')),
  name text not null,
  status text not null default 'To Do'
    check (status in ('To Do', 'In Progress', 'Done', 'Cancelled')),
  booking_date date,
  booking_time time,
  location text not null default '',
  end_date date,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  needs_review boolean not null default false,
  review_reason text not null default '',
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booking_guests (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  primary key (booking_id, guest_id)
);

create table public.flight_segments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  segment_order integer not null check (segment_order > 0),
  origin text not null default '',
  destination text not null default '',
  flight_number text not null default '',
  airline text not null default '',
  segment_date date,
  departure_time time,
  unique (booking_id, segment_order)
);

create table public.hotel_guest_stays (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  check_in date,
  check_out date,
  unique (booking_id, guest_id),
  check (check_in is null or check_out is null or check_out >= check_in)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 512000),
  uploaded_by uuid not null default auth.uid() references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  check (mime_type = 'application/pdf' or mime_type like 'image/%')
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  actor_id uuid not null default auth.uid() references public.profiles(id),
  actor_name text not null default '',
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete cascade,
  category text not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  disabled_at timestamptz
);

create index visits_lead_vp_idx on public.visits (lead_vp_id);
create index visit_members_user_idx on public.visit_members (user_id, visit_id);
create index guests_visit_idx on public.guests (visit_id);
create index bookings_visit_date_idx on public.bookings (visit_id, booking_date);
create index booking_guests_guest_idx on public.booking_guests (guest_id, booking_id);
create index activity_log_visit_created_idx on public.activity_log (visit_id, created_at desc);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index push_subscriptions_user_active_idx on public.push_subscriptions (user_id) where disabled_at is null;

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.sync_auth_user_profile();

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.global_role = 'SUPER_ADMIN' and p.is_active
  );
$$;

create or replace function public.can_access_visit(target_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.visits v
    join public.profiles p on p.id = auth.uid() and p.is_active
    where v.id = target_visit_id
      and (
        p.global_role = 'SUPER_ADMIN'
        or v.lead_vp_id = auth.uid()
        or exists (
          select 1 from public.visit_members vm
          where vm.visit_id = v.id and vm.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_edit_visit(target_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.visits v
    join public.profiles p on p.id = auth.uid() and p.is_active
    where v.id = target_visit_id
      and (
        p.global_role = 'SUPER_ADMIN'
        or (
          p.global_role = 'VP'
          and not v.archived
          and v.status not in ('Completed', 'Cancelled')
          and (
            v.lead_vp_id = auth.uid()
            or exists (
              select 1 from public.visit_members vm
              where vm.visit_id = v.id
                and vm.user_id = auth.uid()
                and vm.visit_role = 'COLLABORATING_VP'
            )
          )
        )
      )
  );
$$;

create or replace function public.can_manage_visit_members(target_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.visits v
    join public.profiles p on p.id = auth.uid() and p.is_active
    where v.id = target_visit_id
      and (
        p.global_role = 'SUPER_ADMIN'
        or (
          p.global_role = 'VP'
          and not v.archived
          and v.status not in ('Completed', 'Cancelled')
          and v.lead_vp_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_access_booking(target_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = target_booking_id and public.can_access_visit(b.visit_id)
  );
$$;

create or replace function public.can_edit_booking(target_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = target_booking_id and public.can_edit_visit(b.visit_id)
  );
$$;

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select target_user_id = auth.uid()
    or public.is_super_admin()
    or exists (
      select 1
      from public.visits v
      join public.profiles target_profile
        on target_profile.id = target_user_id and target_profile.is_active
      where public.can_access_visit(v.id)
        and (
          v.lead_vp_id = target_user_id
          or exists (
            select 1 from public.visit_members target_member
            where target_member.visit_id = v.id and target_member.user_id = target_user_id
          )
        )
    );
$$;

create or replace function public.storage_visit_id(object_path text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  return split_part(object_path, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

create trigger guests_set_updated_at
  before update on public.guests
  for each row execute function public.set_updated_at();

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create or replace function public.guard_guest_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.visit_id is distinct from old.visit_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Guest identity and visit cannot be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guests_guard_identity
  before update on public.guests
  for each row execute function public.guard_guest_identity();

create or replace function public.validate_visit_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.lead_vp_id and p.global_role = 'VP' and p.is_active
  ) then
    raise exception 'Lead VP must be an active VP account.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger visits_validate_lead
  before insert or update of lead_vp_id on public.visits
  for each row execute function public.validate_visit_lead();

create or replace function public.guard_visit_lifecycle_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Visit identity and creation metadata cannot be changed.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.is_super_admin()
    and (
      new.status is distinct from old.status
      or new.archived is distinct from old.archived
      or new.lead_vp_id is distinct from old.lead_vp_id
    ) then
    raise exception 'Only Monserrat can change visit status, archive state, or Lead VP.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger visits_guard_lifecycle_fields
  before update on public.visits
  for each row execute function public.guard_visit_lifecycle_fields();

create or replace function public.guard_booking_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.visit_id is distinct from old.visit_id
    or new.booking_type is distinct from old.booking_type
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Booking identity and creation metadata cannot be changed.' using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.is_super_admin()
    and new.status is distinct from old.status then
    raise exception 'Only Monserrat can change booking status.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger bookings_guard_status
  before update on public.bookings
  for each row execute function public.guard_booking_status();

create or replace function public.validate_visit_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  required_role text;
begin
  required_role := case new.visit_role
    when 'COLLABORATING_VP' then 'VP'
    when 'SALES' then 'SALES'
  end;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.user_id and p.global_role = required_role and p.is_active
  ) then
    raise exception 'Visit member role does not match the user profile.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger visit_members_validate_role
  before insert or update on public.visit_members
  for each row execute function public.validate_visit_member_role();

create or replace function public.validate_booking_guest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.bookings b
    join public.guests g on g.visit_id = b.visit_id
    where b.id = new.booking_id and g.id = new.guest_id
  ) then
    raise exception 'Guest and booking must belong to the same visit.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger booking_guests_validate_visit
  before insert or update on public.booking_guests
  for each row execute function public.validate_booking_guest();

create or replace function public.validate_hotel_guest_stay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.bookings b
    join public.guests g on g.visit_id = b.visit_id
    where b.id = new.booking_id and b.booking_type = 'Hotel' and g.id = new.guest_id
  ) then
    raise exception 'Hotel stay guest must belong to the same visit.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger hotel_guest_stays_validate_visit
  before insert or update on public.hotel_guest_stays
  for each row execute function public.validate_hotel_guest_stay();

create or replace function public.validate_attachment_path()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_visit_id uuid;
begin
  select b.visit_id into parent_visit_id
  from public.bookings b where b.id = new.booking_id;
  if parent_visit_id is null
    or new.storage_path not like parent_visit_id::text || '/' || new.booking_id::text || '/%' then
    raise exception 'Attachment path must be nested under its visit and booking.' using errcode = '23514';
  end if;
  new.uploaded_by := coalesce(new.uploaded_by, auth.uid());
  return new;
end;
$$;

create trigger attachments_validate_path
  before insert or update on public.attachments
  for each row execute function public.validate_attachment_path();

create or replace function public.set_activity_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  new.actor_id := auth.uid();
  select concat_ws(' ', p.first_name, p.last_name)
    into new.actor_name from public.profiles p where p.id = auth.uid();
  return new;
end;
$$;

create trigger activity_log_set_actor
  before insert on public.activity_log
  for each row execute function public.set_activity_actor();

alter table public.profiles enable row level security;
alter table public.visits enable row level security;
alter table public.visit_members enable row level security;
alter table public.guests enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_guests enable row level security;
alter table public.flight_segments enable row level security;
alter table public.hotel_guest_stays enable row level security;
alter table public.attachments enable row level security;
alter table public.activity_log enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.profiles, public.visits, public.visit_members, public.guests,
  public.bookings, public.booking_guests, public.flight_segments,
  public.hotel_guest_stays, public.attachments, public.activity_log,
  public.notifications, public.push_subscriptions from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (first_name, last_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.visits to authenticated;
grant select, insert, delete on public.visit_members to authenticated;
grant select, insert, update, delete on public.guests to authenticated;
grant select, insert, update, delete on public.bookings to authenticated;
grant select, insert, delete on public.booking_guests to authenticated;
grant select, insert, update, delete on public.flight_segments to authenticated;
grant select, insert, update, delete on public.hotel_guest_stays to authenticated;
grant select, insert, delete on public.attachments to authenticated;
grant select, insert on public.activity_log to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy "profiles visible to self, admins, and visit teammates"
  on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy "users update their own name"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "visit members can read visits"
  on public.visits for select to authenticated
  using (public.can_access_visit(id));
create policy "admins create visits"
  on public.visits for insert to authenticated
  with check (public.is_super_admin() and created_by = auth.uid());
create policy "admins and active VPs edit visits"
  on public.visits for update to authenticated
  using (public.can_edit_visit(id)) with check (public.can_edit_visit(id));
create policy "admins delete visits"
  on public.visits for delete to authenticated
  using (public.is_super_admin());

create policy "visit members can read assignments"
  on public.visit_members for select to authenticated
  using (public.can_access_visit(visit_id));
create policy "admins and lead VPs assign visit members"
  on public.visit_members for insert to authenticated
  with check (public.can_manage_visit_members(visit_id));
create policy "admins and lead VPs remove visit members"
  on public.visit_members for delete to authenticated
  using (public.can_manage_visit_members(visit_id));

create policy "visit members can read guests"
  on public.guests for select to authenticated
  using (public.can_access_visit(visit_id));
create policy "editors add guests"
  on public.guests for insert to authenticated
  with check (public.can_edit_visit(visit_id));
create policy "editors update guests"
  on public.guests for update to authenticated
  using (public.can_edit_visit(visit_id)) with check (public.can_edit_visit(visit_id));
create policy "editors remove guests"
  on public.guests for delete to authenticated
  using (public.can_edit_visit(visit_id));

create policy "visit members can read bookings"
  on public.bookings for select to authenticated
  using (public.can_access_visit(visit_id));
create policy "editors add bookings"
  on public.bookings for insert to authenticated
  with check (
    public.can_edit_visit(visit_id)
    and created_by = auth.uid()
    and (public.is_super_admin() or status = 'To Do')
  );
create policy "editors update bookings"
  on public.bookings for update to authenticated
  using (public.can_edit_booking(id)) with check (public.can_edit_booking(id));
create policy "only admins delete bookings"
  on public.bookings for delete to authenticated
  using (public.is_super_admin());

create policy "visit members can read booking guest links"
  on public.booking_guests for select to authenticated
  using (public.can_access_booking(booking_id));
create policy "editors assign booking guests"
  on public.booking_guests for insert to authenticated
  with check (public.can_edit_booking(booking_id));
create policy "editors remove booking guest links"
  on public.booking_guests for delete to authenticated
  using (public.can_edit_booking(booking_id));

create policy "visit members can read flight segments"
  on public.flight_segments for select to authenticated
  using (public.can_access_booking(booking_id));
create policy "editors manage flight segments"
  on public.flight_segments for all to authenticated
  using (public.can_edit_booking(booking_id))
  with check (public.can_edit_booking(booking_id));

create policy "visit members can read hotel stays"
  on public.hotel_guest_stays for select to authenticated
  using (public.can_access_booking(booking_id));
create policy "editors manage hotel stays"
  on public.hotel_guest_stays for all to authenticated
  using (public.can_edit_booking(booking_id))
  with check (public.can_edit_booking(booking_id));

create policy "visit members can read attachment records"
  on public.attachments for select to authenticated
  using (public.can_access_booking(booking_id));
create policy "editors add attachment records"
  on public.attachments for insert to authenticated
  with check (public.can_edit_booking(booking_id) and uploaded_by = auth.uid());
create policy "editors remove attachment records"
  on public.attachments for delete to authenticated
  using (public.can_edit_booking(booking_id));

create policy "visit members can read activity"
  on public.activity_log for select to authenticated
  using (public.can_access_visit(visit_id));
create policy "editors add activity"
  on public.activity_log for insert to authenticated
  with check (public.can_edit_visit(visit_id) and actor_id = auth.uid());

create policy "users read their notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "users mark their notifications read"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users manage their push subscriptions"
  on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-attachments',
  'booking-attachments',
  false,
  512000,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "members read booking files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'booking-attachments'
    and public.can_access_visit(public.storage_visit_id(name))
  );
create policy "editors upload booking files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'booking-attachments'
    and public.can_edit_visit(public.storage_visit_id(name))
  );
create policy "editors replace booking files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'booking-attachments'
    and public.can_edit_visit(public.storage_visit_id(name))
  )
  with check (
    bucket_id = 'booking-attachments'
    and public.can_edit_visit(public.storage_visit_id(name))
  );
create policy "editors delete booking files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'booking-attachments'
    and public.can_edit_visit(public.storage_visit_id(name))
  );

revoke all on function public.is_super_admin() from public;
revoke all on function public.can_access_visit(uuid) from public;
revoke all on function public.can_edit_visit(uuid) from public;
revoke all on function public.can_manage_visit_members(uuid) from public;
revoke all on function public.can_access_booking(uuid) from public;
revoke all on function public.can_edit_booking(uuid) from public;
revoke all on function public.can_view_profile(uuid) from public;
revoke all on function public.storage_visit_id(text) from public;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.can_access_visit(uuid) to authenticated;
grant execute on function public.can_edit_visit(uuid) to authenticated;
grant execute on function public.can_manage_visit_members(uuid) to authenticated;
grant execute on function public.can_access_booking(uuid) to authenticated;
grant execute on function public.can_edit_booking(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.storage_visit_id(text) to authenticated;

commit;
