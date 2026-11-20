-- ==============================================================================
-- Migration: Live Zoom Session Fields on Tutors + Free Trial Credits System
-- Safe & Idempotent (uses IF NOT EXISTS / CREATE OR REPLACE)
-- Preserves all existing data.
-- ==============================================================================

-- 1. Add live session tracking columns on public.tutors
alter table public.tutors add column if not exists is_live boolean not null default false;
alter table public.tutors add column if not exists active_session_url text;
alter table public.tutors add column if not exists active_session_subject text;
alter table public.tutors add column if not exists live_started_at timestamptz;

create index if not exists tutors_approved_live_idx
  on public.tutors (status, is_live)
  where status = 'approved';

-- 2. RPCs for approved tutors to start / stop their live Zoom session safely
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
  v_tutor_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  select id into v_tutor_id
  from public.tutors
  where user_id = v_uid
    and status = 'approved'
  limit 1;

  if v_tutor_id is null and not public.is_admin() then
    return jsonb_build_object('error', 'tutor_not_approved');
  end if;

  if v_tutor_id is not null then
    update public.tutors
    set
      is_live = true,
      active_session_url = p_room_id,
      active_session_subject = coalesce(nullif(trim(coalesce(p_subject, '')), ''), subjects[1], category, 'Live Session'),
      live_started_at = now(),
      is_online = true
    where id = v_tutor_id;
  end if;

  return jsonb_build_object('ok', true, 'tutor_id', v_tutor_id, 'room_id', p_room_id);
end;
$$;

grant execute on function public.start_tutor_live_session(text, text) to authenticated;

create or replace function public.end_tutor_live_session()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  update public.tutors
  set
    is_live = false,
    active_session_url = null,
    active_session_subject = null,
    live_started_at = null
  where user_id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.end_tutor_live_session() to authenticated;

-- 3. Update handle_new_user() trigger so new students automatically get 5 Free Trial Credits
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
  elsif v_role = 'student' then
    -- Grant 5 Free Trial Credits automatically on signup (only if student has no credits yet)
    if not exists (select 1 from public.credit_transactions where student_id = new.id) then
      insert into public.credit_transactions (student_id, amount, type, expires_at)
      values (new.id, 5, 'bonus', now() + interval '90 days');
    end if;
  end if;

  return new;
end;
$$;

-- 4. Backfill 5 Free Trial Credits for all existing students who have no credit transactions yet
insert into public.credit_transactions (student_id, amount, type, expires_at)
select p.user_id, 5, 'bonus', now() + interval '90 days'
from public.profiles p
where p.role = 'student'
  and not exists (
    select 1 from public.credit_transactions ct where ct.student_id = p.user_id
  );

-- 5. RPC: Claim Free Trial Credits (available during free trial period when balance <= 2)
create or replace function public.claim_free_trial_credits(p_amount int default 5)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance int := 0;
  v_grant int := greatest(1, least(coalesce(p_amount, 5), 10));
begin
  if v_uid is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  select coalesce(sum(amount), 0) into v_balance
  from public.credit_transactions
  where student_id = v_uid
    and (expires_at is null or expires_at > now());

  -- Allow claiming starter/refill trial credits when balance is low (<= 2)
  if v_balance > 2 then
    return jsonb_build_object('ok', true, 'already_sufficient', true, 'granted', 0, 'balance', v_balance);
  end if;

  insert into public.credit_transactions (student_id, amount, type, expires_at)
  values (v_uid, v_grant, 'bonus', now() + interval '90 days');

  v_balance := v_balance + v_grant;

  insert into public.notifications (user_id, title, title_ar, body, body_ar, kind)
  values (
    v_uid,
    'Free Trial Credits Added!',
    'تمت إضافة أرصدة تجريبية مجانية!',
    'You received ' || v_grant || ' free trial credits to join live sessions.',
    'حصلت على ' || v_grant || ' أرصدة تجريبية مجانية للانضمام للحصص المباشرة.',
    'credit'
  );

  return jsonb_build_object('ok', true, 'granted', v_grant, 'balance', v_balance);
end;
$$;

grant execute on function public.claim_free_trial_credits(int) to authenticated;

-- 6. RPC: Deduct 1 Free Trial Credit when joining a teacher's active live Zoom session directly
create or replace function public.spend_trial_credit_for_live_join(
  p_tutor_id uuid default null,
  p_cost int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance int := 0;
  v_cost int := greatest(1, coalesce(p_cost, 1));
begin
  if v_uid is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  -- Verify tutor is approved when a tutor_id is provided
  if p_tutor_id is not null then
    if not exists (select 1 from public.tutors where id = p_tutor_id and status = 'approved') then
      return jsonb_build_object('error', 'tutor_not_approved');
    end if;
  end if;

  -- Auto-grant starter 5 free trial credits if this student has zero transaction history
  if not exists (select 1 from public.credit_transactions where student_id = v_uid) then
    insert into public.credit_transactions (student_id, amount, type, expires_at)
    values (v_uid, 5, 'bonus', now() + interval '90 days');
  end if;

  select coalesce(sum(amount), 0) into v_balance
  from public.credit_transactions
  where student_id = v_uid
    and (expires_at is null or expires_at > now());

  if v_balance < v_cost then
    return jsonb_build_object('error', 'insufficient_credits', 'balance', v_balance);
  end if;

  insert into public.credit_transactions (student_id, amount, type)
  values (v_uid, -v_cost, 'spend');

  return jsonb_build_object('ok', true, 'spent', v_cost, 'balance', v_balance - v_cost);
end;
$$;

grant execute on function public.spend_trial_credit_for_live_join(uuid, int) to authenticated;

-- 7. Update join_live_session to auto-grant starter 5 trial credits if student has no history yet
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

  if v_s.status <> 'live' and now() < v_start - interval '15 minutes' then
    return jsonb_build_object('error', 'too_early');
  end if;
  if v_s.status <> 'live' and now() > v_end then
    return jsonb_build_object('error', 'ended');
  end if;

  -- Ensure student receives initial free trial credits if they have no transactions yet
  if not exists (select 1 from credit_transactions where student_id = auth.uid()) then
    insert into credit_transactions (student_id, amount, type, expires_at)
    values (auth.uid(), 5, 'bonus', now() + interval '90 days');
  end if;

  if not exists (
    select 1 from credit_transactions
    where student_id = auth.uid() and session_id = p_session_id and type = 'spend'
  ) then
    select coalesce(sum(amount), 0) into v_balance
    from credit_transactions
    where student_id = auth.uid()
      and (expires_at is null or expires_at > now());

    if v_balance < v_s.credit_cost then
      return jsonb_build_object('error', 'insufficient_credits', 'balance', v_balance);
    end if;

    insert into credit_transactions (student_id, amount, type, session_id)
    values (auth.uid(), -v_s.credit_cost, 'spend', p_session_id);
  end if;

  return jsonb_build_object('room_id', v_s.live_room_id);
end $$;

-- 8. Ensure credit_balance() respects expiry dates consistently
create or replace function public.credit_balance()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::integer
  from public.credit_transactions
  where student_id = auth.uid()
    and (expires_at is null or expires_at > now());
$$;

grant execute on function public.credit_balance() to authenticated;
