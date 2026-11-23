-- ==============================================================================
-- Migration: Real Teacher Profile Metrics, Reviews Table with Strict RLS,
--            Real Computed Ratings/Counts, and Zero Placeholder Values
-- Safe & Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS)
-- ==============================================================================

-- 1. Ensure tutors columns exist and allow NULL rating when no reviews exist
alter table public.tutors alter column rating drop default;
alter table public.tutors alter column rating drop not null;
alter table public.tutors alter column review_count set default 0;
alter table public.tutors alter column experience_years set default 0;

-- 2. Create real reviews table (one review per student per teacher, rating 1..5)
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutors(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  rating int not null check (rating >= 1 and rating <= 5),
  comment text check (char_length(coalesce(comment, '')) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_unique_student_tutor unique (tutor_id, student_id)
);

create index if not exists reviews_tutor_id_idx on public.reviews (tutor_id, created_at desc);

-- 3. Eligibility helper: student must have a real relationship with the approved teacher
--    (at least one booked/attended session OR a conversation with that teacher)
create or replace function public.can_student_review_tutor(p_tutor_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tutors t
    where t.id = p_tutor_id
      and lower(t.status) = 'approved'
      and t.user_id <> p_student_id
      and (
        exists (
          select 1 from public.sessions s
          where s.tutor_id = t.id
            and s.student_id = p_student_id
        )
        or exists (
          select 1 from public.conversations c
          where (c.student_id = p_student_id and c.tutor_id = t.user_id)
             or (c.tutor_id = p_student_id and c.student_id = t.user_id)
        )
      )
  );
$$;

grant execute on function public.can_student_review_tutor(uuid, uuid) to authenticated;

create or replace function public.can_i_review_tutor(p_tutor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    else public.can_student_review_tutor(p_tutor_id, auth.uid())
  end;
$$;

grant execute on function public.can_i_review_tutor(uuid) to authenticated;

-- 4. Strict RLS on public.reviews
alter table public.reviews enable row level security;

drop policy if exists "Authenticated read approved tutor reviews" on public.reviews;
drop policy if exists "Eligible students insert own review" on public.reviews;
drop policy if exists "Students update own review" on public.reviews;
drop policy if exists "Students delete own review" on public.reviews;

create policy "Authenticated read approved tutor reviews" on public.reviews
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.tutors t
      where t.id = reviews.tutor_id
        and (lower(t.status) = 'approved' or t.user_id = auth.uid())
    )
  );

create policy "Eligible students insert own review" on public.reviews
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.can_student_review_tutor(tutor_id, auth.uid())
  );

create policy "Students update own review" on public.reviews
  for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "Students delete own review" on public.reviews
  for delete to authenticated
  using (student_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on public.reviews to authenticated;

-- 5. Keep public.tutors.rating and public.tutors.review_count synced from real reviews
create or replace function public.sync_tutor_review_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tutor_id uuid;
  v_avg numeric;
  v_cnt int;
begin
  v_tutor_id := coalesce(new.tutor_id, old.tutor_id);
  if v_tutor_id is null then
    return null;
  end if;

  select round(avg(r.rating)::numeric, 1), count(*)::int
  into v_avg, v_cnt
  from public.reviews r
  where r.tutor_id = v_tutor_id;

  update public.tutors
  set
    rating = case when v_cnt > 0 then v_avg else null end,
    review_count = coalesce(v_cnt, 0)
  where id = v_tutor_id;

  return null;
end;
$$;

drop trigger if exists trg_sync_tutor_review_stats on public.reviews;
create trigger trg_sync_tutor_review_stats
  after insert or update or delete on public.reviews
  for each row execute function public.sync_tutor_review_stats();

-- Backfill existing tutors so none carry fake seeded rating/review_count without real reviews
update public.tutors t
set
  rating = sub.avg_rating,
  review_count = sub.cnt
from (
  select
    tu.id as tutor_id,
    round(avg(r.rating)::numeric, 1) as avg_rating,
    count(r.id)::int as cnt
  from public.tutors tu
  left join public.reviews r on r.tutor_id = tu.id
  group by tu.id
) sub
where t.id = sub.tutor_id;

-- 6. Safe RPC to fetch real reviews for an approved teacher with reviewer display names
create or replace function public.get_tutor_reviews(p_tutor_id uuid)
returns table (
  id uuid,
  tutor_id uuid,
  student_id uuid,
  rating int,
  comment text,
  created_at timestamptz,
  reviewer_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.tutor_id,
    r.student_id,
    r.rating,
    r.comment,
    r.created_at,
    coalesce(nullif(trim(p.full_name), ''), 'Student') as reviewer_name
  from public.reviews r
  join public.tutors t on t.id = r.tutor_id
  left join public.profiles p on p.user_id = r.student_id
  where r.tutor_id = p_tutor_id
    and (lower(t.status) = 'approved' or t.user_id = auth.uid() or public.is_admin())
  order by r.created_at desc;
$$;

grant execute on function public.get_tutor_reviews(uuid) to authenticated;

-- 7. Rebuild approved_tutors_public view with real computed rating, review_count, and students_count
drop view if exists public.approved_tutors_public;
create view public.approved_tutors_public as
select
  t.id,
  t.user_id,
  t.name,
  t.name_ar,
  t.bio,
  t.bio_ar,
  t.subjects,
  t.hourly_rate,
  rev.avg_rating as rating,
  coalesce(rev.review_count, 0)::int as review_count,
  coalesce(stu.students_count, 0)::int as students_count,
  coalesce(t.experience_years, 0)::int as experience_years,
  t.languages,
  t.avatar_url,
  t.video_url,
  t.is_online,
  t.is_live,
  t.active_session_url,
  t.active_session_subject,
  t.live_started_at,
  t.is_verified,
  t.status,
  t.category,
  t.created_at
from public.tutors t
left join lateral (
  select
    round(avg(r.rating)::numeric, 1) as avg_rating,
    count(*)::int as review_count
  from public.reviews r
  where r.tutor_id = t.id
) rev on true
left join lateral (
  select count(distinct sid)::int as students_count
  from (
    select s.student_id as sid from public.sessions s where s.tutor_id = t.id
    union
    select sf.student_id as sid from public.student_follows sf where sf.tutor_id = t.id
  ) u
) stu on true
where lower(t.status) = 'approved';

grant select on public.approved_tutors_public to anon, authenticated;

-- ==============================================================================
-- ROLLBACK SQL (run manually if you ever need to revert this migration):
-- ==============================================================================
-- drop view if exists public.approved_tutors_public;
-- drop function if exists public.get_tutor_reviews(uuid);
-- drop function if exists public.can_i_review_tutor(uuid);
-- drop function if exists public.can_student_review_tutor(uuid, uuid);
-- drop trigger if exists trg_sync_tutor_review_stats on public.reviews;
-- drop function if exists public.sync_tutor_review_stats();
-- drop table if exists public.reviews cascade;
