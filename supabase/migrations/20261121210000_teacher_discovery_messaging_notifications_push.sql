-- ==============================================================================
-- Migration: Teacher Discovery Public Fields, Strict Messaging RLS,
--            Student Follows, Live-Class Realtime Notifications, & Web Push
-- Safe & Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PUBLIC TEACHER DISCOVERY & STATUS PROTECTION
-- ------------------------------------------------------------------------------
-- Ensure tutors cannot change their own status or is_verified (idempotent guard)
create or replace function public.enforce_tutor_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
      raise exception 'Only administrators can change teacher approval status'
        using errcode = '42501';
    end if;
    if new.is_verified is distinct from old.is_verified then
      raise exception 'Only administrators can change teacher verification status'
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

-- Public view exposing ONLY public fields of approved teachers (hides email, phone, id_document_url)
create or replace view public.approved_tutors_public as
select
  id,
  user_id,
  name,
  name_ar,
  bio,
  bio_ar,
  subjects,
  hourly_rate,
  rating,
  review_count,
  experience_years,
  languages,
  avatar_url,
  video_url,
  is_online,
  is_live,
  active_session_url,
  active_session_subject,
  live_started_at,
  response_time,
  is_verified,
  status,
  category,
  created_at
from public.tutors
where lower(status) = 'approved';

grant select on public.approved_tutors_public to anon, authenticated;

-- Strict RLS on public.tutors: students see ONLY approved teachers; teachers see own; admins see all
alter table public.tutors enable row level security;

drop policy if exists "Public can view approved tutors" on public.tutors;
create policy "Public can view approved tutors" on public.tutors
  for select
  using (lower(status) = 'approved' or user_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------------------------
-- 2. STRICT CONVERSATIONS & MESSAGES RLS + PARTICIPANT DISPLAY NAMES RPC
-- ------------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Unique constraint prevents duplicate conversations between same student & teacher
create unique index if not exists conversations_student_tutor_unique_idx
  on public.conversations (student_id, tutor_id);

drop policy if exists "Users read own conversations" on public.conversations;
drop policy if exists "Users insert own conversations" on public.conversations;
drop policy if exists "Users update own conversations" on public.conversations;

create policy "Users read own conversations" on public.conversations
  for select to authenticated
  using (auth.uid() = student_id or auth.uid() = tutor_id);

create policy "Users insert own conversations" on public.conversations
  for insert to authenticated
  with check (
    (auth.uid() = student_id and exists (
      select 1 from public.tutors t where t.user_id = tutor_id and lower(t.status) = 'approved'
    ))
    or auth.uid() = tutor_id
  );

create policy "Users update own conversations" on public.conversations
  for update to authenticated
  using (auth.uid() = student_id or auth.uid() = tutor_id)
  with check (auth.uid() = student_id or auth.uid() = tutor_id);

drop policy if exists "Users read own messages" on public.messages;
drop policy if exists "Users send messages" on public.messages;
drop policy if exists "Users update messages status" on public.messages;

create policy "Users read own messages" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.student_id = auth.uid() or c.tutor_id = auth.uid())
    )
  );

create policy "Users send messages" on public.messages
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (
          (c.student_id = auth.uid() and c.tutor_id = messages.receiver_id)
          or (c.tutor_id = auth.uid() and c.student_id = messages.receiver_id)
        )
    )
  );

create policy "Users update messages status" on public.messages
  for update to authenticated
  using (auth.uid() = receiver_id or auth.uid() = sender_id)
  with check (auth.uid() = receiver_id or auth.uid() = sender_id);

-- Safe helper so chat/session participants can display the other party's name/avatar
-- without relaxing strict own-row RLS on public.profiles
create or replace function public.get_participant_profiles(p_user_ids uuid[])
returns table (user_id uuid, full_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.full_name, p.avatar_url
  from public.profiles p
  where p.user_id = any(p_user_ids)
    and (
      p.user_id = auth.uid()
      or public.is_admin()
      or exists (
        select 1 from public.conversations c
        where (c.student_id = auth.uid() and c.tutor_id = p.user_id)
           or (c.tutor_id = auth.uid() and c.student_id = p.user_id)
      )
      or exists (
        select 1 from public.sessions s
        join public.tutors t on t.id = s.tutor_id
        where (s.student_id = auth.uid() and t.user_id = p.user_id)
           or (t.user_id = auth.uid() and s.student_id = p.user_id)
      )
    );
$$;

grant execute on function public.get_participant_profiles(uuid[]) to authenticated;

-- ------------------------------------------------------------------------------
-- 3. STUDENT FOLLOWS (TEACHER OR SUBJECT) FOR LIVE-CLASS NOTIFICATIONS
-- ------------------------------------------------------------------------------
create table if not exists public.student_follows (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  tutor_id uuid references public.tutors(id) on delete cascade,
  subject text,
  created_at timestamptz not null default now(),
  constraint student_follows_target_chk check (tutor_id is not null or nullif(trim(coalesce(subject, '')), '') is not null)
);

create unique index if not exists student_follows_student_tutor_idx
  on public.student_follows (student_id, tutor_id)
  where tutor_id is not null;

create unique index if not exists student_follows_student_subject_idx
  on public.student_follows (student_id, lower(subject))
  where subject is not null;

alter table public.student_follows enable row level security;

drop policy if exists "Students read own follows" on public.student_follows;
drop policy if exists "Students insert own follows" on public.student_follows;
drop policy if exists "Students delete own follows" on public.student_follows;

create policy "Students read own follows" on public.student_follows
  for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

create policy "Students insert own follows" on public.student_follows
  for insert to authenticated
  with check (student_id = auth.uid());

create policy "Students delete own follows" on public.student_follows
  for delete to authenticated
  using (student_id = auth.uid());

grant select, insert, delete on public.student_follows to authenticated;

-- ------------------------------------------------------------------------------
-- 4. WEB PUSH SUBSCRIPTIONS TABLE WITH RLS
-- ------------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists push_subscriptions_user_endpoint_idx
  on public.push_subscriptions (user_id, endpoint);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users read own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users insert own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users update own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users delete own push subscriptions" on public.push_subscriptions;

create policy "Users read own push subscriptions" on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy "Users insert own push subscriptions" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users update own push subscriptions" on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users delete own push subscriptions" on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ------------------------------------------------------------------------------
-- 5. LIVE-CLASS NOTIFICATIONS COLUMNS + AUTOMATIC FAN-OUT ON SESSION START
-- ------------------------------------------------------------------------------
alter table public.notifications add column if not exists room_id text;
alter table public.notifications add column if not exists tutor_id uuid references public.tutors(id) on delete set null;

-- Expand notifications.kind CHECK constraint idempotently to allow 'live_class' and 'message'
do $$
declare
  v_con text;
begin
  for v_con in
    select conname
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.notifications drop constraint if exists %I', v_con);
  end loop;

  alter table public.notifications
    add constraint notifications_kind_check
    check (kind in ('booking', 'reminder', 'credit', 'live', 'live_class', 'message', 'system'));
end $$;

-- Update start_tutor_live_session() to notify students following this teacher,
-- following the subject/category, or booked with this teacher.
create or replace function public.start_tutor_live_session(
  p_room_id text,
  p_subject text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tutor record;
  v_subject text;
  v_notified_count int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  select id, user_id, name, name_ar, category, subjects
  into v_tutor
  from public.tutors
  where user_id = v_uid
    and lower(status) = 'approved'
  limit 1;

  if v_tutor.id is null and not public.is_admin() then
    return jsonb_build_object('error', 'tutor_not_approved');
  end if;

  if v_tutor.id is not null then
    v_subject := coalesce(
      nullif(trim(coalesce(p_subject, '')), ''),
      v_tutor.subjects[1],
      v_tutor.category,
      'Live Session'
    );

    update public.tutors
    set
      is_live = true,
      active_session_url = p_room_id,
      active_session_subject = v_subject,
      live_started_at = now(),
      is_online = true
    where id = v_tutor.id;

    -- Insert real-time notifications for every student following this teacher,
    -- following the subject/category, or with an active booking with this teacher
    with target_students as (
      select distinct sf.student_id
      from public.student_follows sf
      where sf.tutor_id = v_tutor.id
         or (
           sf.subject is not null
           and (
             lower(sf.subject) = lower(v_subject)
             or lower(sf.subject) = lower(coalesce(v_tutor.category, ''))
             or exists (
               select 1 from unnest(coalesce(v_tutor.subjects, '{}'::text[])) s
               where lower(s) = lower(sf.subject)
             )
           )
         )
      union
      select distinct sess.student_id
      from public.sessions sess
      where sess.tutor_id = v_tutor.id
        and sess.status in ('confirmed', 'live')
    )
    insert into public.notifications (user_id, tutor_id, room_id, title, title_ar, body, body_ar, kind, is_read)
    select
      ts.student_id,
      v_tutor.id,
      p_room_id,
      v_tutor.name || ' is live now!',
      coalesce(nullif(v_tutor.name_ar, ''), v_tutor.name) || ' بدأ حصة مباشرة الآن!',
      'Live class in ' || v_subject || '. Tap to join now.',
      'حصة مباشرة في ' || v_subject || '. اضغط للانضمام الآن.',
      'live_class',
      false
    from target_students ts
    where ts.student_id <> v_uid;

    get diagnostics v_notified_count = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'tutor_id', v_tutor.id,
    'room_id', p_room_id,
    'subject', v_subject,
    'notified_count', v_notified_count
  );
end;
$$;

grant execute on function public.start_tutor_live_session(text, text) to authenticated;

-- Ensure Realtime publication includes notifications, conversations, messages, tutors
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ==============================================================================
-- ROLLBACK SQL (run manually if you ever need to revert this migration):
-- ==============================================================================
-- drop view if exists public.approved_tutors_public;
-- drop function if exists public.get_participant_profiles(uuid[]);
-- drop table if exists public.push_subscriptions cascade;
-- drop table if exists public.student_follows cascade;
-- alter table public.notifications drop column if exists room_id;
-- alter table public.notifications drop column if exists tutor_id;
-- drop index if exists public.conversations_student_tutor_unique_idx;
