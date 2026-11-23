-- ==============================================================================
-- Migration: Infinite Whiteboard Objects (Images & Text) + Private Storage Bucket
-- Safe & Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS)
-- ==============================================================================

-- 1. Create private Supabase Storage bucket for whiteboard images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whiteboard-media',
  'whiteboard-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Storage RLS policies: path convention `<room_id>/<filename>`
drop policy if exists "Room members read whiteboard media" on storage.objects;
create policy "Room members read whiteboard media" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'whiteboard-media'
    and (
      public.is_room_member((storage.foldername(name))[1])
      or public.is_admin()
    )
  );

drop policy if exists "Authorized drawers upload whiteboard media" on storage.objects;
create policy "Authorized drawers upload whiteboard media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'whiteboard-media'
    and public.can_draw_on_whiteboard((storage.foldername(name))[1])
  );

drop policy if exists "Authorized drawers update whiteboard media" on storage.objects;
create policy "Authorized drawers update whiteboard media" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'whiteboard-media'
    and public.can_draw_on_whiteboard((storage.foldername(name))[1])
  );

drop policy if exists "Authorized drawers delete whiteboard media" on storage.objects;
create policy "Authorized drawers delete whiteboard media" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'whiteboard-media'
    and public.can_draw_on_whiteboard((storage.foldername(name))[1])
  );

-- 2. Create public.whiteboard_objects table for synced images & text on the infinite canvas
create table if not exists public.whiteboard_objects (
  id text primary key,
  room_id text not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('image', 'text')),
  storage_path text,
  text_content text,
  color text not null default '#0F172A',
  font_size numeric not null default 22 check (font_size >= 8 and font_size <= 160),
  x numeric not null default 0,
  y numeric not null default 0,
  width numeric not null default 320 check (width >= 16 and width <= 8000),
  height numeric not null default 240 check (height >= 16 and height <= 8000),
  rotation numeric not null default 0,
  z_index int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whiteboard_objects_room_z
  on public.whiteboard_objects (room_id, z_index asc, created_at asc);

alter table public.whiteboard_objects enable row level security;
grant select, insert, update, delete on public.whiteboard_objects to authenticated;

drop policy if exists "Room members read whiteboard objects" on public.whiteboard_objects;
create policy "Room members read whiteboard objects" on public.whiteboard_objects
  for select to authenticated
  using (public.is_room_member(room_id) or public.is_admin());

drop policy if exists "Authorized drawers insert whiteboard objects" on public.whiteboard_objects;
create policy "Authorized drawers insert whiteboard objects" on public.whiteboard_objects
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and public.can_draw_on_whiteboard(room_id)
  );

drop policy if exists "Authorized drawers update whiteboard objects" on public.whiteboard_objects;
create policy "Authorized drawers update whiteboard objects" on public.whiteboard_objects
  for update to authenticated
  using (public.can_draw_on_whiteboard(room_id))
  with check (public.can_draw_on_whiteboard(room_id));

drop policy if exists "Authorized drawers delete whiteboard objects" on public.whiteboard_objects;
create policy "Authorized drawers delete whiteboard objects" on public.whiteboard_objects
  for delete to authenticated
  using (public.can_draw_on_whiteboard(room_id));

-- 3. Add whiteboard_objects to Realtime publication (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'whiteboard_objects'
  ) then
    alter publication supabase_realtime add table public.whiteboard_objects;
  end if;
end $$;

-- ==============================================================================
-- ROLLBACK SQL (run manually if you ever need to revert this migration):
-- ==============================================================================
-- drop table if exists public.whiteboard_objects cascade;
-- drop policy if exists "Room members read whiteboard media" on storage.objects;
-- drop policy if exists "Authorized drawers upload whiteboard media" on storage.objects;
-- drop policy if exists "Authorized drawers update whiteboard media" on storage.objects;
-- drop policy if exists "Authorized drawers delete whiteboard media" on storage.objects;
-- delete from storage.buckets where id = 'whiteboard-media';
