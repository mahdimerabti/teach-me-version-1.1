-- ==============================================================================
-- Migration: Harden Admin Non-Recursive RLS, Profiles Own-Row RLS,
--            and Google OAuth Student Profile Trigger + Backfill
-- Safe & Idempotent (CREATE OR REPLACE / DROP POLICY IF EXISTS / ON CONFLICT)
-- ==============================================================================

-- 1. Non-recursive SECURITY DEFINER admin helper
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

-- 2. Idempotent handle_new_user() trigger on auth.users (defaults new Google users to role = 'student')
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
    if not exists (select 1 from public.credit_transactions where student_id = new.id) then
      insert into public.credit_transactions (student_id, amount, type, expires_at)
      values (new.id, 5, 'bonus', now() + interval '90 days');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Backfill any existing auth.users missing a public.profiles row
insert into public.profiles (user_id, full_name, role, avatar_url, phone)
select
  u.id,
  coalesce(
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'name', '')), ''),
    split_part(coalesce(u.email, 'user'), '@', 1),
    'User'
  ),
  case
    when lower(coalesce(u.email, '')) in ('admin@demo.com', 'admin@teachme.dz') then 'admin'
    when lower(coalesce(u.raw_user_meta_data ->> 'role', '')) = 'tutor' then 'tutor'
    else 'student'
  end,
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
  coalesce(u.raw_user_meta_data ->> 'phone', u.phone)
from auth.users u
where not exists (
  select 1 from public.profiles p where p.user_id = u.id
)
on conflict (user_id) do nothing;

-- Ensure admin@demo.com always has role = 'admin' in public.profiles
update public.profiles p
set role = 'admin'
from auth.users u
where p.user_id = u.id
  and lower(u.email) in ('admin@demo.com', 'admin@teachme.dz')
  and p.role is distinct from 'admin';

-- 4. Prevent non-admin users from changing their own role
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

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    raise exception 'Users cannot change their own role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_profile_role_guard on public.profiles;
create trigger trg_enforce_profile_role_guard
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_role_guard();

-- 5. Strict non-recursive RLS on public.profiles:
--    Users can SELECT/INSERT/UPDATE only their own profile row; admins can read/update all.
alter table public.profiles enable row level security;

drop policy if exists "Allow all to read profiles" on public.profiles;
drop policy if exists "Users read own profile or public" on public.profiles;
drop policy if exists "Users read own profile or admin" on public.profiles;
drop policy if exists "Allow insert on profiles" on public.profiles;
drop policy if exists "Allow update on profiles" on public.profiles;

create policy "Users read own profile or admin" on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

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

-- 6. Non-recursive RLS on public.tutors: admins can read and update all teacher rows
alter table public.tutors enable row level security;

drop policy if exists "Admins can read all tutors" on public.tutors;
drop policy if exists "Admins can update all tutors" on public.tutors;

create policy "Admins can read all tutors" on public.tutors
  for select to authenticated
  using (public.is_admin());

create policy "Admins can update all tutors" on public.tutors
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
