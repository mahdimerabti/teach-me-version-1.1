-- ==============================================================================
-- Security Audit Hardening Migration
-- Addresses Critical & High findings from security-audit run-1:
--   1. Revoke public/anon/authenticated EXECUTE on register_user_account
--   2. Revoke authenticated/anon EXECUTE on purchase_package (server-only via webhook)
--   3. Restrict rooms, room_participants, and room_messages RLS to room members
--   4. Prevent non-admin students from tampering with sessions.credit_cost/tutor_id/status
-- ==============================================================================

-- 1. Lock down register_user_account (prevents unauthenticated signup & email-confirmation bypass)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'register_user_account'
  ) then
    revoke execute on function public.register_user_account(text, text, text, text) from public, anon, authenticated;
  end if;
end $$;

-- 2. Lock down purchase_package (credits must only be minted server-side after verified payment)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'purchase_package'
  ) then
    revoke execute on function public.purchase_package(text) from public, anon, authenticated;
  end if;
end $$;

-- 3. Restrict public.rooms & public.room_participants SELECT and room_messages INSERT
drop policy if exists "Authenticated users read accessible rooms" on public.rooms;
create policy "Authenticated users read accessible rooms" on public.rooms
  for select to authenticated
  using (public.is_room_member(id));

drop policy if exists "Room members read participants" on public.room_participants;
create policy "Room members read participants" on public.room_participants
  for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "Room members send room messages" on public.room_messages;
create policy "Room members send room messages" on public.room_messages
  for insert to authenticated
  with check (auth.uid() = sender_id and public.is_room_member(room_id));

-- 4. Prevent students from modifying credit_cost, tutor_id, student_id, or setting status='live' directly
create or replace function public.guard_student_session_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_tutor boolean := false;
begin
  -- Allow service_role / SQL migrations (auth.uid() is null)
  if v_uid is null then
    return new;
  end if;

  select exists (
    select 1 from public.profiles where user_id = v_uid and role = 'admin'
  ) into v_is_admin;

  if v_is_admin then
    return new;
  end if;

  select exists (
    select 1 from public.tutors where id = old.tutor_id and user_id = v_uid
  ) into v_is_tutor;

  if v_is_tutor then
    if new.credit_cost is distinct from old.credit_cost
       or new.student_id is distinct from old.student_id
       or new.tutor_id is distinct from old.tutor_id then
      raise exception 'Tutors cannot alter session ownership or credit cost';
    end if;
    return new;
  end if;

  -- Student caller: only allow cancelling their own session
  if new.credit_cost is distinct from old.credit_cost
     or new.tutor_id is distinct from old.tutor_id
     or new.student_id is distinct from old.student_id
     or new.date is distinct from old.date
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or (new.status is distinct from old.status and new.status <> 'cancelled') then
    raise exception 'Students may only cancel their own session';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_student_session_update on public.sessions;
create trigger trg_guard_student_session_update
  before update on public.sessions
  for each row execute function public.guard_student_session_update();
