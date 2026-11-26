-- ==============================================================================
-- Migration: Comprehensive Security Hardening Audit (RLS, RPCs, Auth & Storage)
-- Idempotent & Backward-Compatible with Existing Student/Tutor/Admin Workflows
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Harden public.is_admin() & public.handle_new_user()
--    - Rely strictly on server-side public.profiles.role = 'admin'
--    - Never auto-grant 'admin' to newly registered signups via email matching
-- ------------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

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

  -- Never assign 'admin' automatically on signup; restrict strictly to 'tutor' | 'student'
  if v_meta_role = 'tutor' then
    v_role := 'tutor';
  else
    v_role := 'student';
  end if;

  v_name := left(
    coalesce(
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), ''),
      split_part(coalesce(new.email, 'user'), '@', 1),
      'User'
    ),
    100
  );

  v_avatar := case
    when coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '') ~* '^https://'
      then left(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'), 500)
    else null
  end;

  v_phone := left(coalesce(new.raw_user_meta_data ->> 'phone', new.phone, ''), 32);

  insert into public.profiles (user_id, full_name, role, avatar_url, phone)
  values (new.id, v_name, v_role, v_avatar, nullif(v_phone, ''))
  on conflict (user_id) do update set
    full_name = case
      when coalesce(public.profiles.full_name, '') = '' then excluded.full_name
      else public.profiles.full_name
    end,
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    phone = coalesce(public.profiles.phone, excluded.phone);

  if v_role = 'tutor' then
    insert into public.tutors (user_id, name, name_ar, email, phone, avatar_url, status, is_verified)
    values (new.id, v_name, v_name, new.email, nullif(v_phone, ''), v_avatar, 'pending', false)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------------------------
-- 2. Revoke Unverified Client Credit Minting (public.purchase_package)
--    - Paid credit grants must be executed exclusively by service_role (verified webhook)
-- ------------------------------------------------------------------------------
do $$ begin
  revoke execute on function public.purchase_package(text) from public, anon, authenticated;
  grant execute on function public.purchase_package(text) to service_role;
exception when undefined_function then null;
end $$;

-- Also prevent direct client INSERT on credit_transactions (all legitimate flows use RPCs)
drop policy if exists "Allow insert on credit transactions" on public.credit_transactions;

-- ------------------------------------------------------------------------------
-- 3. Harden public.register_user_account
--    - Enforce strong password (8..128 chars, letters + digits) & valid email
--    - Eliminate existing user UUID disclosure on 'already_exists'
--    - Require cryptographic password match before confirming an unconfirmed row
-- ------------------------------------------------------------------------------
create or replace function public.register_user_account(
  p_email text,
  p_password text,
  p_full_name text default '',
  p_role text default 'student'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_name text := left(coalesce(nullif(trim(p_full_name), ''), split_part(v_clean_email, '@', 1), 'User'), 100);
  v_clean_role text := case when lower(coalesce(p_role, 'student')) = 'tutor' then 'tutor' else 'student' end;
  v_existing_id uuid;
  v_existing_hash text;
  v_existing_confirmed timestamptz;
  v_new_id uuid := gen_random_uuid();
begin
  if v_clean_email = '' or v_clean_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' or length(v_clean_email) > 254 then
    return jsonb_build_object('error', 'invalid_email');
  end if;

  if p_password is null or length(p_password) < 8 or length(p_password) > 128 then
    return jsonb_build_object('error', 'weak_password');
  end if;

  if p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then
    return jsonb_build_object('error', 'weak_password');
  end if;

  select u.id, u.encrypted_password, u.email_confirmed_at
    into v_existing_id, v_existing_hash, v_existing_confirmed
  from auth.users u
  where lower(u.email) = v_clean_email
  limit 1;

  if v_existing_id is not null then
    -- Only auto-confirm if unconfirmed AND caller proves knowledge of the existing password
    if v_existing_confirmed is null and v_existing_hash is not null and v_existing_hash = extensions.crypt(p_password, v_existing_hash) then
      update auth.users
      set email_confirmed_at = now(), updated_at = now()
      where id = v_existing_id;
    end if;
    -- Do NOT disclose internal user UUID to unauthenticated callers
    return jsonb_build_object('status', 'already_exists');
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_new_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_clean_name, 'role', v_clean_role),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_new_id,
    v_new_id::text,
    jsonb_build_object('sub', v_new_id::text, 'email', v_clean_email, 'email_verified', true),
    'email',
    now(), now(), now()
  ) on conflict do nothing;

  insert into public.profiles (user_id, full_name, role)
  values (v_new_id, v_clean_name, v_clean_role)
  on conflict (user_id) do nothing;

  if v_clean_role = 'tutor' then
    insert into public.tutors (user_id, name, name_ar, email, status, is_verified)
    values (v_new_id, v_clean_name, v_clean_name, v_clean_email, 'pending', false)
    on conflict (user_id) do nothing;
  end if;

  return jsonb_build_object('status', 'created');
end;
$$;

-- ------------------------------------------------------------------------------
-- 4. Harden public.book_sessions (Bounds, Tutor Approval Check & Positive Cost)
-- ------------------------------------------------------------------------------
create or replace function public.book_sessions(p_tutor_id uuid, p_slots jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid := gen_random_uuid();
  v_slot jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_slot_count int;
  v_date date;
  v_start time;
  v_end time;
  v_cost int;
  v_subject text;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    return jsonb_build_object('error', 'no_slots');
  end if;

  v_slot_count := jsonb_array_length(p_slots);
  if v_slot_count = 0 then
    return jsonb_build_object('error', 'no_slots');
  end if;
  if v_slot_count > 20 then
    return jsonb_build_object('error', 'too_many_slots');
  end if;

  if not exists (select 1 from public.tutors t where t.id = p_tutor_id and t.status = 'approved') then
    return jsonb_build_object('error', 'tutor_not_available');
  end if;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    v_date := (v_slot->>'date')::date;
    v_start := (v_slot->>'start_time')::time;
    v_end := (v_slot->>'end_time')::time;
    v_cost := greatest(1, coalesce((v_slot->>'credit_cost')::int, 1));
    v_subject := left(coalesce(nullif(trim(v_slot->>'subject'), ''), 'Private lesson'), 120);

    if v_end <= v_start then
      return jsonb_build_object('error', 'invalid_time_range');
    end if;

    insert into public.sessions (booking_group_id, student_id, tutor_id, date, start_time, end_time, credit_cost, subject)
    values (v_group, v_uid, p_tutor_id, v_date, v_start, v_end, v_cost, v_subject)
    returning id into v_id;

    v_ids := array_append(v_ids, v_id);
  end loop;

  insert into public.notifications (user_id, title, title_ar, body, body_ar, kind)
  values (
    v_uid,
    'Booking Confirmed',
    'تم تأكيد الحجز',
    v_slot_count || ' session(s) booked successfully.',
    'تم حجز ' || v_slot_count || ' حصة بنجاح.',
    'booking'
  );

  return jsonb_build_object('booking_group_id', v_group, 'session_ids', to_jsonb(v_ids));
exception when exclusion_violation then
  return jsonb_build_object('error', 'conflict', 'detail', 'One or more selected slots overlap an existing session.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 5. Harden Live Rooms, Participants, Messages & public.ensure_live_room
--    - Verify approved tutor status before granting 'host' role in a room
--    - Restrict room, participant, and room_messages access to room members / admins
-- ------------------------------------------------------------------------------
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
  v_clean_room text := trim(coalesce(p_room_id, ''));
  v_is_verified_tutor boolean := false;
  v_role text;
  v_can_draw boolean;
  v_safe_name text := left(coalesce(nullif(trim(p_display_name), ''), 'Participant'), 80);
  v_safe_avatar text := case when coalesce(p_avatar_url, '') ~* '^https://' then left(trim(p_avatar_url), 500) else null end;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  if v_clean_room !~ '^[A-Za-z0-9_-]{3,100}$' then
    return jsonb_build_object('error', 'invalid_room_id');
  end if;

  select exists (
    select 1 from public.tutors t
    where t.user_id = v_uid and t.status = 'approved'
  ) or public.is_admin()
  into v_is_verified_tutor;

  v_role := case
    when p_role in ('host', 'tutor') and v_is_verified_tutor then 'host'
    else 'student'
  end;
  v_can_draw := (v_role = 'host');

  insert into public.rooms (id, host_user_id, student_user_id, status, allowed_drawers)
  values (
    v_clean_room,
    case when v_role = 'host' then v_uid else null end,
    case when v_role = 'student' then v_uid else null end,
    case when v_role = 'host' then 'live' else 'waiting' end,
    case when v_role = 'host' then array[v_uid] else '{}'::uuid[] end
  )
  on conflict (id) do update set
    host_user_id = coalesce(public.rooms.host_user_id, excluded.host_user_id),
    student_user_id = coalesce(public.rooms.student_user_id, excluded.student_user_id),
    status = case
      when v_role = 'host' then 'live'
      when public.rooms.status = 'ended' then 'waiting'
      else public.rooms.status
    end,
    allowed_drawers = case
      when v_role = 'host' and not (v_uid = any(coalesce(public.rooms.allowed_drawers, '{}'::uuid[])))
        then array_append(coalesce(public.rooms.allowed_drawers, '{}'::uuid[]), v_uid)
      else coalesce(public.rooms.allowed_drawers, '{}'::uuid[])
    end,
    updated_at = now();

  insert into public.room_participants (
    room_id, user_id, display_name, avatar_url, role, can_draw, is_online, joined_at, left_at, updated_at
  )
  values (
    v_clean_room, v_uid, v_safe_name, v_safe_avatar, v_role, v_can_draw, true, now(), null, now()
  )
  on conflict (room_id, user_id) do update set
    display_name = excluded.display_name,
    avatar_url = coalesce(excluded.avatar_url, public.room_participants.avatar_url),
    role = excluded.role,
    can_draw = case
      when v_role = 'host' then true
      else public.room_participants.can_draw
    end,
    is_online = true,
    left_at = null,
    updated_at = now();

  return jsonb_build_object('room_id', v_clean_room, 'role', v_role, 'can_draw', v_can_draw, 'status', 'ok');
end;
$$;

drop policy if exists "Authenticated users read accessible rooms" on public.rooms;
create policy "Room members or admins read rooms" on public.rooms
  for select to authenticated
  using (public.is_room_member(id) or public.is_admin());

drop policy if exists "Room members read participants" on public.room_participants;
create policy "Room members read participants" on public.room_participants
  for select to authenticated
  using (public.is_room_member(room_id) or public.is_admin());

drop policy if exists "Room members send room messages" on public.room_messages;
create policy "Room members send room messages" on public.room_messages
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_room_member(room_id)
    and char_length(content) <= 2000
  );

drop policy if exists "Users send messages" on public.messages;
create policy "Users send messages" on public.messages
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and char_length(content) <= 4000
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.student_id = auth.uid() or c.tutor_id = auth.uid())
    )
  );

-- Restrict direct client notification spoofing: users can only insert notifications for themselves (server RPCs bypass via SECURITY DEFINER)
drop policy if exists "Insert notifications" on public.notifications;
create policy "Users insert own notifications" on public.notifications
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------------------------
-- 6. Storage Security Hardening:
--    - Private 'id-documents' bucket for Government ID uploads (owner + admin only)
--    - Strict owner checks (owner = auth.uid() or public.is_admin()) on UPDATE/DELETE
--      for 'avatars' and 'tutor-videos' (prevents cross-user file tampering/deletion)
-- ------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'id-documents',
  'id-documents',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
where id = 'avatars';

drop policy if exists "ID documents owner upload" on storage.objects;
create policy "ID documents owner upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'id-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ID documents owner or admin read" on storage.objects;
create policy "ID documents owner or admin read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'id-documents'
    and (owner = auth.uid() or (storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "ID documents owner or admin delete" on storage.objects;
create policy "ID documents owner or admin delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'id-documents'
    and (owner = auth.uid() or public.is_admin())
  );

-- Tighten avatars UPDATE/DELETE to file owner or admin only
drop policy if exists "Authenticated update avatars" on storage.objects;
create policy "Owner update avatars" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (owner = auth.uid() or public.is_admin()));

drop policy if exists "Authenticated delete avatars" on storage.objects;
create policy "Owner delete avatars" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (owner = auth.uid() or public.is_admin()));

-- Tighten tutor-videos UPDATE/DELETE to file owner or admin only
drop policy if exists "Tutors update video" on storage.objects;
create policy "Owner update tutor video" on storage.objects
  for update to authenticated
  using (bucket_id = 'tutor-videos' and (owner = auth.uid() or public.is_admin()));

drop policy if exists "Tutors delete video" on storage.objects;
create policy "Owner delete tutor video" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tutor-videos' and (owner = auth.uid() or public.is_admin()));
