-- ==============================================================================
-- Live Video Rooms, Participants, In-Room Chat & Realtime Whiteboard State
-- Clean-Room WebRTC / LiveKit Session Management Schema
-- ==============================================================================

-- 1. Rooms Table
create table if not exists public.rooms (
  id text primary key,
  session_id uuid unique references public.sessions(id) on delete set null,
  host_user_id uuid references auth.users(id) on delete set null,
  student_user_id uuid references auth.users(id) on delete set null,
  title text not null default 'Teach Me Live Classroom',
  status text not null default 'waiting' check (status in ('waiting', 'live', 'ended')),
  active_mode text not null default 'video' check (active_mode in ('video', 'whiteboard', 'screenshare')),
  whiteboard_state jsonb not null default '{}'::jsonb,
  started_at timestamptz default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Room Participants Table
create table if not exists public.room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Participant',
  avatar_url text,
  role text not null default 'student' check (role in ('host', 'student')),
  is_muted boolean not null default false,
  is_camera_off boolean not null default false,
  is_hand_raised boolean not null default false,
  is_sharing_screen boolean not null default false,
  is_online boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint unique_room_participant unique (room_id, user_id)
);

-- 3. Room Messages Table (In-Meeting Live Chat)
create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null default 'Participant',
  sender_role text not null default 'student' check (sender_role in ('host', 'student')),
  content text not null,
  kind text not null default 'text' check (kind in ('text', 'system', 'reaction', 'file')),
  created_at timestamptz not null default now()
);

-- 4. Indexes for High-Performance Realtime Lookups
create index if not exists idx_rooms_session on public.rooms(session_id);
create index if not exists idx_rooms_status on public.rooms(status);
create index if not exists idx_room_participants_room on public.room_participants(room_id, is_online);
create index if not exists idx_room_messages_room_created on public.room_messages(room_id, created_at asc);

-- 5. Enable Row Level Security (RLS)
alter table public.rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.room_messages enable row level security;

-- 6. Helper Function: Check if current user is an authorized member of a room
create or replace function public.is_room_member(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rooms r
    left join public.sessions s on s.id = r.session_id
    left join public.tutors t on t.id = s.tutor_id
    where r.id = p_room_id
      and (
        r.host_user_id = auth.uid()
        or r.student_user_id = auth.uid()
        or s.student_id = auth.uid()
        or t.user_id = auth.uid()
        or exists (
          select 1 from public.room_participants rp
          where rp.room_id = p_room_id and rp.user_id = auth.uid()
        )
      )
  );
$$;

-- 7. RLS Policies for public.rooms
drop policy if exists "Authenticated users read accessible rooms" on public.rooms;
create policy "Authenticated users read accessible rooms" on public.rooms
  for select to authenticated
  using (true);

drop policy if exists "Authenticated users create rooms" on public.rooms;
create policy "Authenticated users create rooms" on public.rooms
  for insert to authenticated
  with check (auth.uid() = host_user_id or auth.uid() = student_user_id or host_user_id is null);

drop policy if exists "Room members update room state" on public.rooms;
create policy "Room members update room state" on public.rooms
  for update to authenticated
  using (public.is_room_member(id));

-- 8. RLS Policies for public.room_participants
drop policy if exists "Room members read participants" on public.room_participants;
create policy "Room members read participants" on public.room_participants
  for select to authenticated
  using (true);

drop policy if exists "Users insert own participant record" on public.room_participants;
create policy "Users insert own participant record" on public.room_participants
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users or room host update participant state" on public.room_participants;
create policy "Users or room host update participant state" on public.room_participants
  for update to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.rooms r
      where r.id = room_participants.room_id and r.host_user_id = auth.uid()
    )
  );

-- 9. RLS Policies for public.room_messages
drop policy if exists "Room members read room messages" on public.room_messages;
create policy "Room members read room messages" on public.room_messages
  for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "Room members send room messages" on public.room_messages;
create policy "Room members send room messages" on public.room_messages
  for insert to authenticated
  with check (auth.uid() = sender_id);

-- 10. RPC: Ensure Room & Participant Registration on Join
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

grant execute on function public.is_room_member(text) to authenticated;
grant execute on function public.ensure_live_room(text, text, text, text) to authenticated;

-- 11. Add Tables to Supabase Realtime Publication
do $$ begin
  alter publication supabase_realtime add table public.rooms, public.room_participants, public.room_messages;
exception when others then null;
end $$;
