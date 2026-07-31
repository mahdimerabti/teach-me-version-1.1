-- ==============================================================================
-- Teach Me Platform - Complete Database Setup Script
-- All-in-One Database Schema for New Supabase Project
-- ==============================================================================

-- 1. Enable Required Extensions
create extension if not exists btree_gist;
create extension if not exists "uuid-ossp";

-- 2. Custom Types
do $$ begin
  create type timerange as range (subtype = time);
exception when duplicate_object then null; end $$;

-- 3. Profiles Table (Stores user roles, names, and avatars)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  full_name text not null default '',
  role text not null default 'student' check (role in ('student', 'tutor', 'admin')),
  avatar_url text,
  phone text,
  created_at timestamptz not null default now()
);

-- 4. Tutors Table (Approved & registered educators)
create table if not exists public.tutors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  name text not null,
  name_ar text,
  bio text default '',
  bio_ar text default '',
  subjects text[] default '{}'::text[],
  hourly_rate numeric default 2500,
  rating numeric default 5.0,
  review_count integer default 0,
  experience_years integer default 5,
  languages text[] default '{"Arabic"}'::text[],
  avatar_url text,
  video_url text,
  id_document_url text,
  is_online boolean default true,
  response_time text default '< 15 mins',
  is_verified boolean default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  category text,
  certificates text[] default '{}'::text[],
  identity_verified boolean default false,
  meeting_settings jsonb,
  created_at timestamptz not null default now()
);

-- 5. Schedules Table (Tutor weekly available working hours)
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  constraint schedule_time_valid check (end_time > start_time)
);

-- 6. Packages Table (Student credit subscription packages)
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  name_ar text not null,
  price_cents integer not null check (price_cents >= 0),
  credits integer not null check (credits > 0),
  bonus_credits integer not null default 0,
  gift_description text,
  gift_description_ar text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Default Credit Packages
insert into public.packages (code, name, name_ar, price_cents, credits, bonus_credits, gift_description, gift_description_ar) values
  ('basic',    'Basic',    'الأساسية', 1500, 10,  1, 'Welcome gift: +1 bonus credit',               'هدية ترحيبية: +1 رصيد مجاني'),
  ('standard', 'Standard', 'القياسية', 3000, 25,  5, '+5 bonus credits',                            '+5 أرصدة مجانية'),
  ('premium',  'Premium',  'المميزة',  6000, 60, 15, '+15 bonus credits + 1 free special session',  '+15 رصيداً مجانياً + حصة خاصة مجانية')
on conflict (code) do nothing;

-- 7. Sessions Table (Booked and Live 1-on-1 tutoring sessions)
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  booking_group_id uuid not null,
  student_id uuid not null references auth.users(id) on delete cascade,
  tutor_id uuid not null references public.tutors(id) on delete cascade,
  subject text default 'Private lesson',
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed', 'missed')),
  credit_cost integer not null default 1 check (credit_cost > 0),
  live_room_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint session_time_valid check (end_time > start_time)
);

-- Ensure no overlapping sessions for tutors or students
do $$ begin
  alter table public.sessions add constraint sessions_no_tutor_overlap
    exclude using gist (tutor_id with =, date with =, timerange(start_time, end_time) with &&)
    where (status = 'confirmed');
exception when duplicate_object or duplicate_table then null; end $$;

do $$ begin
  alter table public.sessions add constraint sessions_no_student_overlap
    exclude using gist (student_id with =, date with =, timerange(start_time, end_time) with &&)
    where (status = 'confirmed');
exception when duplicate_object or duplicate_table then null; end $$;

create index if not exists sessions_student_idx on public.sessions (student_id, date);
create index if not exists sessions_tutor_idx on public.sessions (tutor_id, date);

-- 8. Bookings Table (General reservations log)
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  tutor_id uuid not null references public.tutors(id) on delete cascade,
  schedule_id uuid references public.schedules(id) on delete set null,
  date date not null,
  start_time time not null,
  duration_minutes integer not null default 60,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  total_price numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- 9. Credit Transactions Table (Student balance audit & ledger)
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  type text not null check (type in ('purchase', 'bonus', 'spend', 'refund', 'referral', 'expiry')),
  package_id uuid references public.packages(id),
  session_id uuid references public.sessions(id),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists credit_tx_once_per_session
  on public.credit_transactions (student_id, session_id, type)
  where session_id is not null;

create index if not exists credit_tx_student_idx on public.credit_transactions (student_id, created_at desc);

-- 10. Notifications Table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  title text not null,
  title_ar text,
  body text not null,
  body_ar text,
  kind text not null default 'reminder' check (kind in ('reminder', 'booking', 'credit')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- 11. Questions & Answers Table (Student Q&A with Tutors)
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references auth.users(id) on delete cascade,
  tutor_id uuid not null references public.tutors(id) on delete cascade,
  student_name text,
  student_avatar text,
  subject text,
  question text not null,
  answer text,
  is_answered boolean not null default false,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

-- 12. Meeting History Table (Attendance & Duration logs)
create table if not exists public.meeting_history (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('tutor', 'student')),
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- 13. Direct Messaging: Conversations & Messages Tables
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  tutor_id uuid not null references auth.users(id) on delete cascade,
  last_message text,
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  constraint unique_student_tutor_pair unique(student_id, tutor_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  status text not null default 'sent' check (status in ('sent', 'delivered', 'read')),
  is_read boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_conversations_student on public.conversations(student_id);
create index if not exists idx_conversations_tutor on public.conversations(tutor_id);
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at asc);
create index if not exists idx_messages_receiver_read on public.messages(receiver_id, is_read);

-- ==============================================================================
-- 14. Enable Row Level Security (RLS) on all tables
-- ==============================================================================
alter table public.profiles enable row level security;
alter table public.tutors enable row level security;
alter table public.schedules enable row level security;
alter table public.sessions enable row level security;
alter table public.packages enable row level security;
alter table public.bookings enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.questions enable row level security;
alter table public.meeting_history enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- ==============================================================================
-- 15. RLS Policies
-- ==============================================================================

-- Profiles: Anyone authenticated can read profiles; users can insert/update own profile; admins can manage
create policy "Allow all to read profiles" on public.profiles
  for select using (true);
create policy "Allow insert on profiles" on public.profiles
  for insert to authenticated with check (true);
create policy "Allow update on profiles" on public.profiles
  for update to authenticated using (
    user_id = auth.uid() 
    or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
    or (auth.jwt()->>'email') in ('admin@demo.com', 'admin@teachme.dz')
  );

-- Tutors: Everyone can view approved tutors; tutors can view & update own record; admins full access
create policy "Public can view approved tutors" on public.tutors
  for select using (
    status = 'approved' 
    or user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
    or (auth.jwt()->>'email') in ('admin@demo.com', 'admin@teachme.dz')
  );
create policy "Users can insert tutor profile" on public.tutors
  for insert to authenticated with check (user_id = auth.uid());
create policy "Tutors and admins can update tutors" on public.tutors
  for update to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
    or (auth.jwt()->>'email') in ('admin@demo.com', 'admin@teachme.dz')
  );

-- Schedules: Read available schedules, tutors edit own
create policy "Public can read schedules" on public.schedules
  for select using (true);
create policy "Tutors manage own schedules insert" on public.schedules
  for insert to authenticated with check (
    exists (select 1 from public.tutors t where t.id = schedules.tutor_id and t.user_id = auth.uid())
  );
create policy "Tutors manage own schedules update" on public.schedules
  for update to authenticated using (
    exists (select 1 from public.tutors t where t.id = schedules.tutor_id and t.user_id = auth.uid())
  );
create policy "Tutors manage own schedules delete" on public.schedules
  for delete to authenticated using (
    exists (select 1 from public.tutors t where t.id = schedules.tutor_id and t.user_id = auth.uid())
  );

-- Sessions: Students, tutors, and admins can see sessions
create policy "Users and admins read sessions" on public.sessions
  for select to authenticated using (
    student_id = auth.uid()
    or exists (select 1 from public.tutors tu where tu.id = sessions.tutor_id and tu.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
    or (auth.jwt()->>'email') in ('admin@demo.com', 'admin@teachme.dz')
  );
create policy "Students can update sessions" on public.sessions
  for update to authenticated using (
    student_id = auth.uid()
    or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  );

-- Packages
create policy "Anyone read active packages" on public.packages
  for select using (is_active);

-- Credit transactions
create policy "Students and admins read credit history" on public.credit_transactions
  for select to authenticated using (
    student_id = auth.uid()
    or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
    or (auth.jwt()->>'email') in ('admin@demo.com', 'admin@teachme.dz')
  );
create policy "Allow insert on credit transactions" on public.credit_transactions
  for insert to authenticated with check (student_id = auth.uid());

-- Notifications
create policy "Users read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "Users update own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid());
create policy "Insert notifications" on public.notifications
  for insert to authenticated with check (true);

-- Questions
create policy "Public read questions" on public.questions
  for select to authenticated using (true);
create policy "Students insert questions" on public.questions
  for insert to authenticated with check (student_id = auth.uid() or student_id is null);
create policy "Tutors answer questions" on public.questions
  for update to authenticated using (
    exists (select 1 from public.tutors t where t.id = questions.tutor_id and t.user_id = auth.uid())
  );

-- Bookings
create policy "Users access bookings" on public.bookings
  for all to authenticated using (
    student_id = auth.uid()
    or exists (select 1 from public.tutors t where t.id = bookings.tutor_id and t.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  ) with check (
    student_id = auth.uid()
    or exists (select 1 from public.tutors t where t.id = bookings.tutor_id and t.user_id = auth.uid())
    or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
  );

-- Meeting History
create policy "Users can view own meeting history" on public.meeting_history
  for select to authenticated using (user_id = auth.uid());
create policy "Users can log meeting start" on public.meeting_history
  for insert to authenticated with check (user_id = auth.uid());
create policy "Users can update meeting duration" on public.meeting_history
  for update to authenticated using (user_id = auth.uid());

-- Conversations & Messages
create policy "Users read own conversations" on public.conversations
  for select to authenticated using (auth.uid() = student_id or auth.uid() = tutor_id);
create policy "Users insert own conversations" on public.conversations
  for insert to authenticated with check (auth.uid() = student_id or auth.uid() = tutor_id);
create policy "Users update own conversations" on public.conversations
  for update to authenticated using (auth.uid() = student_id or auth.uid() = tutor_id);

create policy "Users read own messages" on public.messages
  for select to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Users send messages" on public.messages
  for insert to authenticated with check (auth.uid() = sender_id);
create policy "Users update messages status" on public.messages
  for update to authenticated using (auth.uid() = receiver_id or auth.uid() = sender_id);

-- ==============================================================================
-- 16. Database Functions & Stored Procedures (RPCs)
-- ==============================================================================

-- 16.1 Credit balance calculation
create or replace function public.credit_balance()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from credit_transactions where student_id = auth.uid();
$$;

-- 16.2 Get available slots for tutor
create or replace function public.get_available_slots(p_tutor_id uuid, p_from date, p_to date)
returns table (slot_date date, start_time time, end_time time)
language sql stable security definer set search_path = public as $$
  select d::date, s.start_time, s.end_time
  from generate_series(p_from, p_to, interval '1 day') d
  join schedules s
    on s.tutor_id = p_tutor_id
   and s.is_available
   and s.day_of_week = extract(dow from d)::int
  where not exists (
    select 1 from sessions x
    where x.tutor_id = p_tutor_id
      and x.status = 'confirmed'
      and x.date = d::date
      and timerange(x.start_time, x.end_time) && timerange(s.start_time, s.end_time)
  )
  order by 1, 2;
$$;

-- 16.3 Booking sessions atomically
create or replace function public.book_sessions(p_tutor_id uuid, p_slots jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_group uuid := gen_random_uuid();
  v_slot jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
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

-- 16.4 Purchase package
create or replace function public.purchase_package(p_package_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pkg packages%rowtype;
  v_expires timestamptz := now() + interval '90 days';
begin
  select * into v_pkg from packages where code = p_package_code and is_active;
  if not found then return jsonb_build_object('error', 'unknown_package'); end if;

  insert into credit_transactions (student_id, amount, type, package_id, expires_at)
  values (auth.uid(), v_pkg.credits, 'purchase', v_pkg.id, v_expires);

  if v_pkg.bonus_credits > 0 then
    insert into credit_transactions (student_id, amount, type, package_id, expires_at)
    values (auth.uid(), v_pkg.bonus_credits, 'bonus', v_pkg.id, v_expires);
  end if;

  return jsonb_build_object('balance', public.credit_balance());
end $$;

-- 16.5 Join live session
create or replace function public.join_live_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s sessions%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_balance int;
begin
  select * into v_s from sessions
  where id = p_session_id and student_id = auth.uid() and status = 'confirmed'
  for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  v_start := (v_s.date + v_s.start_time)::timestamptz;
  v_end   := (v_s.date + v_s.end_time)::timestamptz;
  if now() < v_start - interval '15 minutes' then return jsonb_build_object('error', 'too_early'); end if;
  if now() > v_end then return jsonb_build_object('error', 'ended'); end if;

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

-- Grants for RPC functions
grant execute on function public.credit_balance() to authenticated;
grant execute on function public.get_available_slots(uuid, date, date) to authenticated;
grant execute on function public.book_sessions(uuid, jsonb) to authenticated;
grant execute on function public.purchase_package(text) to authenticated;
grant execute on function public.join_live_session(uuid) to authenticated;

-- ==============================================================================
-- 17. Storage Buckets (Avatars & Tutor Videos)
-- ==============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values 
  ('avatars', 'avatars', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']),
  ('tutor-videos', 'tutor-videos', true, 104857600, array['video/mp4', 'video/webm'])
on conflict (id) do update set public = true;

-- Storage policies for avatars
create policy "Avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "Authenticated upload avatars" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');
create policy "Authenticated update avatars" on storage.objects
  for update to authenticated using (bucket_id = 'avatars');
create policy "Authenticated delete avatars" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars');

-- Storage policies for tutor-videos
create policy "Public read tutor videos" on storage.objects
  for select using (bucket_id = 'tutor-videos');
create policy "Tutors upload video" on storage.objects
  for insert to authenticated with check (bucket_id = 'tutor-videos');
create policy "Tutors update video" on storage.objects
  for update to authenticated using (bucket_id = 'tutor-videos');
create policy "Tutors delete video" on storage.objects
  for delete to authenticated using (bucket_id = 'tutor-videos');

-- ==============================================================================
-- 18. Enable Realtime Publications
-- ==============================================================================
do $$ begin
  alter publication supabase_realtime add table public.conversations, public.messages, public.sessions, public.notifications, public.tutors;
exception when others then null;
end $$;

-- ==============================================================================
-- 19. Sample Approved Tutor (Optional - For Immediate Out-of-the-Box Testing)
-- ==============================================================================
insert into public.tutors (
  id, name, name_ar, bio, bio_ar, subjects, hourly_rate, rating, 
  review_count, experience_years, languages, avatar_url, is_online, 
  response_time, is_verified, status, category
) values (
  '11111111-1111-1111-1111-111111111111',
  'Prof. Ahmed Benali',
  'أ. أحمد بن علي',
  'Certified Mathematics Teacher with 8+ years experience preparing BAC students.',
  'أستاذ معتمد في مادة الرياضيات، خبرة أكثر من 8 سنوات في تحضير طلاب البكالوريا.',
  array['Mathematics', 'الرياضيات'],
  2500,
  4.9,
  24,
  8,
  array['Arabic', 'French'],
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
  true,
  '< 15 mins',
  true,
  'approved',
  'school'
) on conflict (id) do nothing;


