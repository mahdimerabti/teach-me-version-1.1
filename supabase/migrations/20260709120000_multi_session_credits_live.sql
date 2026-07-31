create extension if not exists btree_gist;

do $$ begin
  create type timerange as range (subtype = time);
exception when duplicate_object then null; end $$;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  booking_group_id uuid not null,
  student_id uuid not null references auth.users (id) on delete cascade,
  tutor_id uuid not null references public.tutors (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'confirmed'
    check (status in ('confirmed','cancelled','completed','missed')),
  credit_cost integer not null default 1 check (credit_cost > 0),
  live_room_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint session_time_valid check (end_time > start_time)
);

alter table public.sessions add constraint sessions_no_tutor_overlap
  exclude using gist (tutor_id with =, date with =, timerange(start_time, end_time) with &&)
  where (status = 'confirmed');

alter table public.sessions add constraint sessions_no_student_overlap
  exclude using gist (student_id with =, date with =, timerange(start_time, end_time) with &&)
  where (status = 'confirmed');

create index sessions_student_idx on public.sessions (student_id, date);
create index sessions_tutor_idx on public.sessions (tutor_id, date);

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

insert into public.packages (code, name, name_ar, price_cents, credits, bonus_credits, gift_description, gift_description_ar) values
  ('basic',    'Basic',    'الأساسية', 1500, 10,  1, 'Welcome gift: +1 bonus credit',               'هدية ترحيبية: +1 رصيد مجاني'),
  ('standard', 'Standard', 'القياسية', 3000, 25,  5, '+5 bonus credits',                            '+5 أرصدة مجانية'),
  ('premium',  'Premium',  'المميزة',  6000, 60, 15, '+15 bonus credits + 1 free special session',  '+15 رصيداً مجانياً + حصة خاصة مجانية')
on conflict (code) do nothing;

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  type text not null check (type in ('purchase','bonus','spend','refund','referral','expiry')),
  package_id uuid references public.packages (id),
  session_id uuid references public.sessions (id),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index credit_tx_once_per_session
  on public.credit_transactions (student_id, session_id, type)
  where session_id is not null;

create index credit_tx_student_idx on public.credit_transactions (student_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete cascade,
  title text not null,
  title_ar text,
  body text not null,
  body_ar text,
  kind text not null default 'reminder' check (kind in ('reminder','booking','credit')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;
alter table public.packages enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.notifications enable row level security;

create policy "Students read own sessions" on public.sessions
  for select to authenticated using (student_id = auth.uid());
create policy "Tutors read their sessions" on public.sessions
  for select to authenticated
  using (exists (select 1 from public.tutors tu where tu.id = sessions.tutor_id and tu.user_id = auth.uid()));
create policy "Authenticated read active packages" on public.packages
  for select to authenticated using (is_active);
create policy "Students read own credit history" on public.credit_transactions
  for select to authenticated using (student_id = auth.uid());
create policy "Users read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "Users mark own notifications read" on public.notifications
  for update to authenticated using (user_id = auth.uid());

revoke select on public.sessions from anon, authenticated;
grant select (id, booking_group_id, student_id, tutor_id, date, start_time, end_time, status, credit_cost, created_at)
  on public.sessions to authenticated;

create or replace function public.credit_balance()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from credit_transactions where student_id = auth.uid();
$$;

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
    insert into sessions (booking_group_id, student_id, tutor_id, date, start_time, end_time, credit_cost)
    values (
      v_group, auth.uid(), p_tutor_id,
      (v_slot->>'date')::date,
      (v_slot->>'start_time')::time,
      (v_slot->>'end_time')::time,
      coalesce((v_slot->>'credit_cost')::int, 1)
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

create or replace function public.enqueue_session_reminders()
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, session_id, title, title_ar, body, body_ar, kind)
  select s.student_id, s.id, 'Session Reminder', 'تذكير بالحصة',
         'Your session starts within 30 minutes.', 'حصتك ستبدأ خلال 30 دقيقة.', 'reminder'
  from sessions s
  where s.status = 'confirmed'
    and (s.date + s.start_time)::timestamptz between now() and now() + interval '30 minutes'
    and not exists (select 1 from notifications n where n.session_id = s.id and n.kind = 'reminder');
$$;

create or replace function public.finalize_past_sessions()
returns void language sql security definer set search_path = public as $$
  update sessions s set status = case
      when exists (select 1 from credit_transactions ct where ct.session_id = s.id and ct.type = 'spend')
      then 'completed' else 'missed' end
  where s.status = 'confirmed' and (s.date + s.end_time)::timestamptz < now();
$$;

revoke execute on function public.book_sessions(uuid, jsonb) from public;
revoke execute on function public.purchase_package(text) from public;
revoke execute on function public.join_live_session(uuid) from public;
grant execute on function public.credit_balance() to authenticated;
grant execute on function public.get_available_slots(uuid, date, date) to authenticated;
grant execute on function public.book_sessions(uuid, jsonb) to authenticated;
grant execute on function public.purchase_package(text) to authenticated;
grant execute on function public.join_live_session(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutor-videos', 'tutor-videos', true, 104857600, array['video/mp4','video/webm'])
on conflict (id) do nothing;

create policy "Public read tutor videos" on storage.objects
  for select using (bucket_id = 'tutor-videos');
create policy "Tutors upload own intro video" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tutor-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Tutors update own intro video" on storage.objects
  for update to authenticated
  using (bucket_id = 'tutor-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Tutors delete own intro video" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tutor-videos' and (storage.foldername(name))[1] = auth.uid()::text);
