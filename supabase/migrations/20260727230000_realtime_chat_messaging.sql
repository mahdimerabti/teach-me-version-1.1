-- 1. Create Conversations Table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  tutor_id uuid not null references auth.users(id) on delete cascade,
  last_message text,
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  constraint unique_student_tutor_pair unique(student_id, tutor_id)
);

-- 2. Create Messages Table
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

-- 3. Indexes for High Performance Querying
create index if not exists idx_conversations_student on public.conversations(student_id);
create index if not exists idx_conversations_tutor on public.conversations(tutor_id);
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at asc);
create index if not exists idx_messages_receiver_read on public.messages(receiver_id, is_read);

-- 4. Enable Row Level Security (RLS)
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- 5. RLS Policies for Conversations
create policy "Users read own conversations" on public.conversations
  for select to authenticated
  using (auth.uid() = student_id or auth.uid() = tutor_id);

create policy "Users insert own conversations" on public.conversations
  for insert to authenticated
  with check (auth.uid() = student_id or auth.uid() = tutor_id);

create policy "Users update own conversations" on public.conversations
  for update to authenticated
  using (auth.uid() = student_id or auth.uid() = tutor_id);

-- 6. RLS Policies for Messages
create policy "Users read own messages" on public.messages
  for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users send messages" on public.messages
  for insert to authenticated
  with check (auth.uid() = sender_id);

create policy "Users update received messages status" on public.messages
  for update to authenticated
  using (auth.uid() = receiver_id or auth.uid() = sender_id);

-- 7. Add Tables to Supabase Realtime Publication if available
do $$ begin
  alter publication supabase_realtime add table public.conversations, public.messages;
exception when others then null;
end $$;
