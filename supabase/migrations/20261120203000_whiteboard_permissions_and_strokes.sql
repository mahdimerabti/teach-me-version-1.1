-- ==============================================================================
-- Migration: Server-Side Whiteboard Drawing Permissions & Persisted Strokes
-- Safe & Idempotent (uses IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE)
-- Preserves all existing data.
-- ==============================================================================

-- 1. Add teacher-controlled drawing permission column to public.room_participants
alter table public.room_participants
  add column if not exists can_draw boolean not null default false;

-- Hosts always have drawing permission by default
update public.room_participants
set can_draw = true
where role = 'host' and can_draw = false;

-- 2. Helper function: checks whether the current user is the room host/teacher (or admin)
create or replace function public.is_room_host(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.rooms r
      where r.id = p_room_id
        and r.host_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.room_participants rp
      where rp.room_id = p_room_id
        and rp.user_id = auth.uid()
        and rp.role = 'host'
    );
$$;

grant execute on function public.is_room_host(text) to authenticated;

-- 3. Helper function: checks whether the current user is allowed to draw on the room whiteboard
create or replace function public.can_draw_on_whiteboard(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_room_host(p_room_id)
    or exists (
      select 1
      from public.room_participants rp
      where rp.room_id = p_room_id
        and rp.user_id = auth.uid()
        and rp.can_draw = true
    );
$$;

grant execute on function public.can_draw_on_whiteboard(text) to authenticated;

-- 4. Guard trigger: prevent students from self-granting can_draw on public.room_participants
create or replace function public.enforce_participant_can_draw_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow SQL Editor / service_role (auth.uid() is null) and verified room host/admin
  if auth.uid() is null or public.is_room_host(new.room_id) then
    if new.role = 'host' then
      new.can_draw := true;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.can_draw := false;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.can_draw is distinct from old.can_draw then
      raise exception 'Only the session teacher can grant or revoke whiteboard drawing permission'
        using errcode = '42501';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_participant_can_draw_guard on public.room_participants;
create trigger trg_enforce_participant_can_draw_guard
  before insert or update on public.room_participants
  for each row execute function public.enforce_participant_can_draw_guard();

-- 5. Update ensure_live_room so hosts get can_draw = true and students default to can_draw = false
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
    room_id, user_id, display_name, avatar_url, role, can_draw, is_online, joined_at, left_at, updated_at
  )
  values (
    p_room_id,
    v_uid,
    coalesce(nullif(p_display_name, ''), 'Participant'),
    p_avatar_url,
    v_role,
    (v_role = 'host'),
    true,
    now(),
    null,
    now()
  )
  on conflict (room_id, user_id) do update set
    display_name = excluded.display_name,
    avatar_url = coalesce(excluded.avatar_url, public.room_participants.avatar_url),
    role = excluded.role,
    can_draw = case
      when excluded.role = 'host' then true
      else public.room_participants.can_draw
    end,
    is_online = true,
    left_at = null,
    updated_at = now();

  return jsonb_build_object('room_id', p_room_id, 'role', v_role, 'status', 'ok');
end;
$$;

grant execute on function public.ensure_live_room(text, text, text, text) to authenticated;

-- 6. Teacher-only RPC to grant or revoke student drawing permission in realtime
create or replace function public.set_student_draw_permission(
  p_room_id text,
  p_target_user_id uuid,
  p_can_draw boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  if not public.is_room_host(p_room_id) then
    return jsonb_build_object('error', 'forbidden', 'detail', 'Only the session teacher can manage drawing permissions');
  end if;

  update public.room_participants
  set
    can_draw = coalesce(p_can_draw, false),
    updated_at = now()
  where room_id = p_room_id
    and user_id = p_target_user_id
    and role <> 'host';

  return jsonb_build_object(
    'ok', true,
    'room_id', p_room_id,
    'target_user_id', p_target_user_id,
    'can_draw', coalesce(p_can_draw, false)
  );
end;
$$;

grant execute on function public.set_student_draw_permission(text, uuid, boolean) to authenticated;

-- 7. Server-authoritative Whiteboard Strokes table with strict RLS
create table if not exists public.whiteboard_strokes (
  id text primary key,
  room_id text not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'draw' check (mode in ('draw', 'erase')),
  color text not null default '#0F172A',
  width numeric not null default 3 check (width >= 1 and width <= 60),
  points jsonb not null default '[]'::jsonb,
  is_undone boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_whiteboard_strokes_room_created
  on public.whiteboard_strokes (room_id, created_at asc);

alter table public.whiteboard_strokes enable row level security;

grant select, insert, update, delete on public.whiteboard_strokes to authenticated;

drop policy if exists "Room members read whiteboard strokes" on public.whiteboard_strokes;
create policy "Room members read whiteboard strokes" on public.whiteboard_strokes
  for select to authenticated
  using (public.is_room_member(room_id) or public.is_admin());

drop policy if exists "Authorized drawers insert whiteboard strokes" on public.whiteboard_strokes;
create policy "Authorized drawers insert whiteboard strokes" on public.whiteboard_strokes
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and public.can_draw_on_whiteboard(room_id)
  );

drop policy if exists "Authorized drawers update whiteboard strokes" on public.whiteboard_strokes;
create policy "Authorized drawers update whiteboard strokes" on public.whiteboard_strokes
  for update to authenticated
  using (public.can_draw_on_whiteboard(room_id))
  with check (public.can_draw_on_whiteboard(room_id));

drop policy if exists "Authorized drawers delete whiteboard strokes" on public.whiteboard_strokes;
create policy "Authorized drawers delete whiteboard strokes" on public.whiteboard_strokes
  for delete to authenticated
  using (public.can_draw_on_whiteboard(room_id));

-- 8. Tighten public.rooms UPDATE policy so only authorized drawers/hosts update room whiteboard state
drop policy if exists "Room members update room state" on public.rooms;
create policy "Room hosts and authorized drawers update room state" on public.rooms
  for update to authenticated
  using (public.can_draw_on_whiteboard(id))
  with check (public.can_draw_on_whiteboard(id));

-- 9. Add whiteboard_strokes & room_participants to Realtime publication (idempotent)
do $$
declare
  v_tbl text;
begin
  foreach v_tbl in array array['whiteboard_strokes', 'room_participants', 'rooms']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', v_tbl);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
