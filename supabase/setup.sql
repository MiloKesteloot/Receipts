-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.

-- A table that only ever holds one row: the shared click count.
create table if not exists public.counter (
  id int primary key default 1 check (id = 1),
  clicks bigint not null default 0
);

insert into public.counter (id) values (1) on conflict (id) do nothing;

-- Anyone using the app (signed in or not) can read the count...
alter table public.counter enable row level security;

drop policy if exists "Anyone can read the counter" on public.counter;
create policy "Anyone can read the counter"
  on public.counter for select
  to anon, authenticated
  using (true);

grant select on public.counter to anon, authenticated;

-- ...but can only change it through this function, which adds exactly 1.
-- Doing the +1 inside the database means two taps at the same moment
-- can't overwrite each other.
create or replace function public.increment_clicks()
returns bigint
language sql
security definer
set search_path = ''
as $$
  update public.counter set clicks = clicks + 1 where id = 1 returning clicks;
$$;

revoke execute on function public.increment_clicks() from public;
grant execute on function public.increment_clicks() to anon, authenticated;
