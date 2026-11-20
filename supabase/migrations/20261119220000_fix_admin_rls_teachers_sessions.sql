-- ==============================================================================
-- Migration: Fix Admin Auth, Pending Teachers Trigger, Non-Recursive RLS,
--            Tutor Self-Approval Protection, and Live Sessions Propagation
-- Safe & Idempotent (uses IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE)
-- Preserves all existing data.
-- ==============================================================================

-- 1. Fix NULL GoTrue string token columns on SQL-seeded auth.users (e.g. admin@demo.com)
--    GoTrue fails with HTTP 500 "Database error querying schema" when these are NULL.
--    Also ensure email_confirmed_at is populated so users are never locked out by email confirmation.
update auth.users
set
  email_confirmed_at         = coalesce(email_confirmed_at, now()),
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where email_confirmed_at is null
   or confirmation_token is null
   or recovery_token is null
   or email_change_token_new is null
   or email_change is null
   or email_change_token_current is null
   or phone_change is null
   or phone_change_token is null
   or reauthentication_token is null;

-- 1b. BEFORE INSERT trigger on auth.users to auto-confirm new accounts and normalize tokens
create or replace function public.before_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email_confirmed_at         := coalesce(new.email_confirmed_at, now());
  new.confirmation_token         := coalesce(new.confirmation_token, '');
  new.recovery_token             := coalesce(new.recovery_token, '');
  new.email_change_token_new     := coalesce(new.email_change_token_new, '');
  new.email_change               := coalesce(new.email_change, '');
  new.email_change_token_current := coalesce(new.email_change_token_current, '');
  new.phone_change               := coalesce(new.phone_change, '');
  new.phone_change_token         := coalesce(new.phone_change_token, '');
  new.reauthentication_token     := coalesce(new.reauthentication_token, '');
  return new;
end;
$$;

drop trigger if exists on_auth_user_before_insert on auth.users;
create trigger on_auth_user_before_insert
  before insert on auth.users
  for each row execute function public.before_auth_user_created();

-- 2. Add optional email & phone columns to public.tutors (preserves existing data)
alter table public.tutors add column if not exists email text;
alter table public.tutors add column if not exists phone text;

-- Backfill tutor emails & phones from auth.users / public.profiles where missing
update public.tutors t
set email = u.email
from auth.users u
where t.user_id = u.id
  and (t.email is null or t.email = '');

update public.tutors t
set phone = p.phone
from public.profiles p
where t.user_id = p.user_id
  and (t.phone is null or t.phone = '')
  and p.phone is not null;

-- 3. Expand status CHECK constraints safely to match all app statuses
do $$
declare
  v_con text;
begin
  for v_con in
    select conname
    from pg_constraint
    where conrelid = 'public.tutors'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.tutors drop constraint if exists %I', v_con);
  end loop;

  alter table public.tutors
    add constraint tutors_status_check
    check (status in ('pending', 'approved', 'rejected', 'info_requested', 'suspended', 'banned'));
end $$;

do $$
declare
  v_con text;
begin
  for v_con in
    select conname
    from pg_constraint
    where conrelid = 'public.sessions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.sessions drop constraint if exists %I', v_con);
  end loop;

  alter table public.sessions
    add constraint sessions_status_check
    check (status in ('confirmed', 'live', 'cancelled', 'completed', 'missed'));
end $$;

-- Ensure authenticated role has full table privileges (row access enforced by RLS)
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update on public.tutors to authenticated;
grant select, insert, update on public.profiles to authenticated;

-- 4. Reliable, non-recursive SECURITY DEFINER admin check
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@demo.com', 'admin@teachme.dz')
    or exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
    );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- 5. Reliable auth.users signup trigger:
--    Always creates public.profiles (and pending public.tutors row for teachers),
--    even when email confirmation is enabled and signUp returns session = null.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta_role text;
  v_role text;
  v_name text;
  v_avatar text;
  v_phone text;
begin
  v_meta_role := lower(coalesce(new.raw_user_meta_data ->> 'role', 'student'));

  if lower(coalesce(new.email, '')) in ('admin@demo.com', 'admin@teachme.dz') then
    v_role := 'admin';
  elsif v_meta_role = 'tutor' then
    v_role := 'tutor';
  else
    v_role := 'student';
  end if;

  v_name := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), ''),
    split_part(coalesce(new.email, 'user'), '@', 1),
    'User'
  );
  v_avatar := coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  );
  v_phone := coalesce(new.raw_user_meta_data ->> 'phone', new.phone);

  insert into public.profiles (user_id, full_name, role, avatar_url, phone)
  values (new.id, v_name, v_role, v_avatar, v_phone)
  on conflict (user_id) do update set
    full_name = case
      when coalesce(public.profiles.full_name, '') = '' then excluded.full_name
      else public.profiles.full_name
    end,
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    phone = coalesce(public.profiles.phone, excluded.phone);

  if v_role = 'tutor' then
    insert into public.tutors (user_id, name, name_ar, email, phone, avatar_url, status, is_verified)
    values (new.id, v_name, v_name, new.email, v_phone, v_avatar, 'pending', false)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5b. Fallback direct account registration RPC (bypasses Supabase free-tier 2-emails/hour
--     SMTP rate limit when 'Confirm email' is left enabled in the dashboard, while creating
--     a genuine bcrypt-hashed GoTrue user + identity so signInWithPassword returns a real JWT).
create or replace function public.register_user_account(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text default 'student'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_name text := coalesce(nullif(trim(coalesce(p_full_name, '')), ''), split_part(v_clean_email, '@', 1), 'User');
  v_clean_role text := case when lower(coalesce(p_role, '')) = 'tutor' then 'tutor' else 'student' end;
  v_existing_id uuid;
  v_user_id uuid;
  v_meta jsonb;
begin
  if v_clean_email = '' or position('@' in v_clean_email) = 0 then
    return jsonb_build_object('error', 'invalid_email');
  end if;

  if length(coalesce(p_password, '')) < 6 then
    return jsonb_build_object('error', 'weak_password');
  end if;

  select id into v_existing_id
  from auth.users
  where lower(email) = v_clean_email
  limit 1;

  if v_existing_id is not null then
    -- Ensure existing account is confirmed so signInWithPassword works if password matches
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = v_existing_id and email_confirmed_at is null;

    return jsonb_build_object('status', 'already_exists', 'user_id', v_existing_id);
  end if;

  v_user_id := gen_random_uuid();
  v_meta := jsonb_build_object(
    'sub', v_user_id::text,
    'email', v_clean_email,
    'full_name', v_clean_name,
    'role', v_clean_role,
    'email_verified', true,
    'phone_verified', false
  );

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    v_meta,
    now(),
    now(),
    '', '', '', '',
    '', '', '', '',
    false,
    false
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
  ) values (
    v_user_id::text,
    v_user_id,
    v_meta,
    'email',
    now(),
    now(),
    now(),
    gen_random_uuid()
  )
  on conflict (provider_id, provider) do nothing;

  return jsonb_build_object('status', 'created', 'user_id', v_user_id);
end;
$$;

grant execute on function public.register_user_account(text, text, text, text) to anon, authenticated;

-- 6. Prevent non-admins from changing tutor approval status or escalating profile role to admin
create or replace function public.enforce_tutor_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow server/SQL Editor/service_role (auth.uid() is null) and verified admins
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.is_verified := false;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      raise exception 'Only administrators can change tutor approval status'
        using errcode = '42501';
    end if;
    if new.is_verified is distinct from old.is_verified then
      raise exception 'Only administrators can change tutor verification status'
        using errcode = '42501';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_tutor_status_guard on public.tutors;
create trigger trg_enforce_tutor_status_guard
  before insert or update on public.tutors
  for each row execute function public.enforce_tutor_status_guard();

create or replace function public.enforce_profile_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.role = 'admin' then
    raise exception 'Only administrators can assign admin role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_profile_role_guard on public.profiles;
create trigger trg_enforce_profile_role_guard
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_role_guard();

-- 7. Clean, Non-Recursive RLS Policies

-- 7.1 Profiles
drop policy if exists "Allow all to read profiles" on public.profiles;
drop policy if exists "Allow insert on profiles" on public.profiles;
drop policy if exists "Allow update on profiles" on public.profiles;

create policy "Allow all to read profiles" on public.profiles
  for select using (true);

create policy "Allow insert on profiles" on public.profiles
  for insert to authenticated
  with check (
    (user_id = auth.uid() and role in ('student', 'tutor'))
    or public.is_admin()
  );

create policy "Allow update on profiles" on public.profiles
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (
    (user_id = auth.uid() and role in ('student', 'tutor'))
    or public.is_admin()
  );

-- 7.2 Tutors
drop policy if exists "Public can view approved tutors" on public.tutors;
drop policy if exists "Users can insert tutor profile" on public.tutors;
drop policy if exists "Tutors and admins can update tutors" on public.tutors;
drop policy if exists "Admins can delete tutors" on public.tutors;

create policy "Public can view approved tutors" on public.tutors
  for select using (
    status = 'approved'
    or user_id = auth.uid()
    or public.is_admin()
  );

create policy "Users can insert tutor profile" on public.tutors
  for insert to authenticated
  with check (
    (user_id = auth.uid() and status = 'pending' and is_verified = false)
    or public.is_admin()
  );

create policy "Tutors and admins can update tutors" on public.tutors
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- 7.3 Schedules (students see only approved tutors' schedules)
drop policy if exists "Public can read schedules" on public.schedules;
drop policy if exists "Tutors manage own schedules insert" on public.schedules;
drop policy if exists "Tutors manage own schedules update" on public.schedules;
drop policy if exists "Tutors manage own schedules delete" on public.schedules;

create policy "Public can read schedules" on public.schedules
  for select using (
    exists (
      select 1 from public.tutors t
      where t.id = schedules.tutor_id
        and (t.status = 'approved' or t.user_id = auth.uid())
    )
    or public.is_admin()
  );

create policy "Tutors manage own schedules insert" on public.schedules
  for insert to authenticated
  with check (
    exists (select 1 from public.tutors t where t.id = schedules.tutor_id and t.user_id = auth.uid())
    or public.is_admin()
  );

create policy "Tutors manage own schedules update" on public.schedules
  for update to authenticated
  using (
    exists (select 1 from public.tutors t where t.id = schedules.tutor_id and t.user_id = auth.uid())
    or public.is_admin()
  );

create policy "Tutors manage own schedules delete" on public.schedules
  for delete to authenticated
  using (
    exists (select 1 from public.tutors t where t.id = schedules.tutor_id and t.user_id = auth.uid())
    or public.is_admin()
  );

-- 7.4 Sessions (students only see approved tutors' sessions; approved tutors can create/update their sessions)
drop policy if exists "Users and admins read sessions" on public.sessions;
drop policy if exists "Students read own sessions" on public.sessions;
drop policy if exists "Tutors read their sessions" on public.sessions;
drop policy if exists "Students can update sessions" on public.sessions;
drop policy if exists "Approved tutors can insert sessions" on public.sessions;
drop policy if exists "Participants and admins update sessions" on public.sessions;

create policy "Users and admins read sessions" on public.sessions
  for select to authenticated using (
    (
      student_id = auth.uid()
      and exists (
        select 1 from public.tutors tu
        where tu.id = sessions.tutor_id and tu.status = 'approved'
      )
    )
    or exists (
      select 1 from public.tutors tu
      where tu.id = sessions.tutor_id and tu.user_id = auth.uid()
    )
    or public.is_admin()
  );

create policy "Approved tutors can insert sessions" on public.sessions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tutors tu
      where tu.id = sessions.tutor_id
        and tu.user_id = auth.uid()
        and tu.status = 'approved'
    )
    or public.is_admin()
  );

create policy "Participants and admins update sessions" on public.sessions
  for update to authenticated using (
    student_id = auth.uid()
    or exists (
      select 1 from public.tutors tu
      where tu.id = sessions.tutor_id
        and tu.user_id = auth.uid()
        and tu.status = 'approved'
    )
    or public.is_admin()
  );

-- 7.5 Credit Transactions & Bookings (replace recursive profile checks with is_admin())
drop policy if exists "Students and admins read credit history" on public.credit_transactions;
create policy "Students and admins read credit history" on public.credit_transactions
  for select to authenticated using (
    student_id = auth.uid() or public.is_admin()
  );

drop policy if exists "Users access bookings" on public.bookings;
create policy "Users access bookings" on public.bookings
  for all to authenticated using (
    student_id = auth.uid()
    or exists (select 1 from public.tutors t where t.id = bookings.tutor_id and t.user_id = auth.uid())
    or public.is_admin()
  ) with check (
    student_id = auth.uid()
    or exists (select 1 from public.tutors t where t.id = bookings.tutor_id and t.user_id = auth.uid())
    or public.is_admin()
  );

-- 8. Update RPCs to enforce tutor approval & allow joining 'live' sessions
create or replace function public.get_available_slots(p_tutor_id uuid, p_from date, p_to date)
returns table (slot_date date, start_time time, end_time time)
language sql stable security definer set search_path = public as $$
  select d::date, s.start_time, s.end_time
  from generate_series(p_from, p_to, interval '1 day') d
  join tutors t
    on t.id = p_tutor_id
   and t.status = 'approved'
  join schedules s
    on s.tutor_id = p_tutor_id
   and s.is_available
   and s.day_of_week = extract(dow from d)::int
  where not exists (
    select 1 from sessions x
    where x.tutor_id = p_tutor_id
      and x.status in ('confirmed', 'live')
      and x.date = d::date
      and timerange(x.start_time, x.end_time) && timerange(s.start_time, s.end_time)
  )
  order by 1, 2;
$$;

create or replace function public.book_sessions(p_tutor_id uuid, p_slots jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_group uuid := gen_random_uuid();
  v_slot jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  if not exists (select 1 from public.tutors where id = p_tutor_id and status = 'approved') then
    return jsonb_build_object('error', 'tutor_not_approved');
  end if;

  if p_slots is null or jsonb_array_length(p_slots) = 0 then
    return jsonb_build_object('error', 'no_slots');
  end if;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    insert into sessions (booking_group_id, student_id, tutor_id, date, start_time, end_time, credit_cost, subject)
    values (
      v_group, auth.uid(), p_tutor_id,
      (v_slot->>'date')::date,
      (v_slot->>'start_time')::time,
      (v_slot->>'end_time')::time,
      coalesce((v_slot->>'credit_cost')::int, 1),
      coalesce(v_slot->>'subject', 'Private lesson')
    )
    returning id into v_id;
    v_ids := array_append(v_ids, v_id);
  end loop;

  insert into notifications (user_id, title, title_ar, body, body_ar, kind)
  values (auth.uid(), 'Booking Confirmed', 'تم تأكيد الحجز',
          jsonb_array_length(p_slots) || ' session(s) booked successfully.',
          'تم حجز ' || jsonb_array_length(p_slots) || ' حصة بنجاح.', 'booking');

  return jsonb_build_object('booking_group_id', v_group, 'session_ids', to_jsonb(v_ids));
exception when exclusion_violation then
  return jsonb_build_object('error', 'conflict',
    'detail', 'One or more selected slots overlap an existing session.');
end $$;

create or replace function public.join_live_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_balance int;
begin
  select s.* into v_s
  from sessions s
  join tutors t on t.id = s.tutor_id
  where s.id = p_session_id
    and s.student_id = auth.uid()
    and s.status in ('confirmed', 'live')
    and t.status = 'approved'
  for update of s;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  v_start := (v_s.date + v_s.start_time)::timestamptz;
  v_end   := (v_s.date + v_s.end_time)::timestamptz;

  -- If tutor already started the session (status = 'live'), allow joining immediately
  if v_s.status <> 'live' and now() < v_start - interval '15 minutes' then
    return jsonb_build_object('error', 'too_early');
  end if;
  if v_s.status <> 'live' and now() > v_end then
    return jsonb_build_object('error', 'ended');
  end if;

  if not exists (
    select 1 from credit_transactions
    where student_id = auth.uid() and session_id = p_session_id and type = 'spend'
  ) then
    select coalesce(sum(amount), 0) into v_balance from credit_transactions where student_id = auth.uid();
    if v_balance < v_s.credit_cost then
      return jsonb_build_object('error', 'insufficient_credits');
    end if;
    insert into credit_transactions (student_id, amount, type, session_id)
    values (auth.uid(), -v_s.credit_cost, 'spend', p_session_id);
  end if;

  return jsonb_build_object('room_id', v_s.live_room_id);
end $$;

create or replace function public.ensure_live_room(
  p_room_id text,
  p_display_name text,
  p_role text default 'student',
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := case when p_role in ('host', 'tutor') then 'host' else 'student' end;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  -- Only approved tutors (or admins) may host a live room
  if v_role = 'host' and not public.is_admin() then
    if not exists (select 1 from public.tutors where user_id = v_uid and status = 'approved') then
      return jsonb_build_object('error', 'tutor_not_approved');
    end if;
  end if;

  insert into public.rooms (id, host_user_id, student_user_id, status)
  values (
    p_room_id,
    case when v_role = 'host' then v_uid else null end,
    case when v_role = 'student' then v_uid else null end,
    case when v_role = 'host' then 'live' else 'waiting' end
  )
  on conflict (id) do update set
    host_user_id = coalesce(public.rooms.host_user_id, excluded.host_user_id),
    student_user_id = coalesce(public.rooms.student_user_id, excluded.student_user_id),
    status = case
      when v_role = 'host' then 'live'
      when public.rooms.status = 'ended' then 'waiting'
      else public.rooms.status
    end,
    updated_at = now();

  insert into public.room_participants (
    room_id, user_id, display_name, avatar_url, role, is_online, joined_at, left_at, updated_at
  )
  values (
    p_room_id, v_uid, coalesce(nullif(p_display_name, ''), 'Participant'), p_avatar_url, v_role, true, now(), null, now()
  )
  on conflict (room_id, user_id) do update set
    display_name = excluded.display_name,
    avatar_url = coalesce(excluded.avatar_url, public.room_participants.avatar_url),
    role = excluded.role,
    is_online = true,
    left_at = null,
    updated_at = now();

  return jsonb_build_object('room_id', p_room_id, 'role', v_role, 'status', 'ok');
end $$;

-- 9. Ensure Realtime publication includes tutors & sessions (idempotent)
do $$
declare
  v_tbl text;
begin
  foreach v_tbl in array array['tutors', 'sessions', 'notifications', 'rooms', 'room_participants', 'room_messages']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', v_tbl);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
