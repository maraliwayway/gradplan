-- Run this once in your Supabase project: SQL Editor, then New query, paste, Run.
-- It creates the table that holds each user's plan and locks it down so a
-- signed-in user can only read and write their own row.

create table if not exists public.plans (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;

create policy "Owners read their plan"
  on public.plans for select
  using (auth.uid() = user_id);

create policy "Owners write their plan"
  on public.plans for insert
  with check (auth.uid() = user_id);

create policy "Owners update their plan"
  on public.plans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
