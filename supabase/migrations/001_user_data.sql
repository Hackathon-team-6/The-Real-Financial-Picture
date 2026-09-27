-- One row per user holding their Financial X-Ray state (transactions, goals, profile) as JSON.
-- Row-level security ensures every user can only read and write their own row.

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "Users read their own data"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "Users insert their own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "Users update their own data"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete their own data"
  on public.user_data for delete
  using (auth.uid() = user_id);
