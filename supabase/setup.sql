-- ===========================================================================
-- RECEIPTS APP: COMPLETE UNIFIED SUPABASE SETUP SCRIPT
-- ===========================================================================
-- Safe to re-run; uses IF NOT EXISTS and CREATE OR REPLACE throughout.
-- Run in Supabase Dashboard: SQL Editor > New query > Paste entire script > Run.
--
-- Covers:
-- 1. Profiles & Auth triggers (Google / Apple / Email)
-- 2. Groups & Group Memberships + RLS
-- 3. Group RPCs (create_group, join_group, get_group, leave_group, remove_group_member)
-- 4. Receipts & Receipt Items (US 2.1) + RLS
-- 5. Item Claims (US 2.3 Member Claims) + RLS
-- 6. Receipt Guest Tokens & Anonymous Web Claiming (US 2.5) + Public RPCs
-- 7. Click counter (starter utility)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Profiles: created/updated automatically on sign-up / OAuth login
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', '')
  );
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(v_name, split_part(new.email, '@', 1)))
  on conflict (id) do update
    set display_name = coalesce(v_name, public.profiles.display_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_user_profile();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.handle_user_profile();

-- ---------------------------------------------------------------------------
-- 2. Groups & Group Memberships
-- ---------------------------------------------------------------------------

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  invite_code text not null unique
    default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_by uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Helper to generate 8-character invite code (no look-alikes)
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- Ensure default on invite_code in case groups table already existed
alter table public.groups
  alter column invite_code set default public.generate_invite_code();

create index if not exists groups_invite_code_lower_idx
  on public.groups (lower(invite_code));

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index if not exists group_members_user_idx
  on public.group_members (user_id);
create index if not exists group_members_group_idx
  on public.group_members (group_id);

-- Helper functions for RLS
drop function if exists public.is_group_member(uuid) cascade;
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  ) or exists (
    select 1 from public.groups
    where id = p_group_id and created_by = auth.uid()
  );
$$;

drop function if exists public.shares_group_with(uuid) cascade;
create or replace function public.shares_group_with(p_other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = p_other_user
  ) or exists (
    select 1
    from public.groups g
    join public.group_members m on m.group_id = g.id
    where (g.created_by = auth.uid() and m.user_id = p_other_user)
       or (g.created_by = p_other_user and m.user_id = auth.uid())
  );
$$;

revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.shares_group_with(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;

-- Automatically make creator the owner of the group
create or replace function public.add_group_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute function public.add_group_owner();

-- ---------------------------------------------------------------------------
-- 3. Receipts & Receipt Items (US 2.1)
-- ---------------------------------------------------------------------------

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  draft_data jsonb default null,
  created_at timestamptz not null default now()
);

-- Ensure status and draft_data exist if receipts table was created in an earlier migration
alter table public.receipts
  add column if not exists status text not null default 'draft' check (status in ('draft', 'submitted')),
  add column if not exists draft_data jsonb default null;

alter table public.receipts
  alter column created_by set default auth.uid();

create or replace function public.set_receipt_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists on_receipt_insert on public.receipts;
create trigger on_receipt_insert
  before insert on public.receipts
  for each row execute function public.set_receipt_created_by();

create index if not exists idx_receipts_group_id on public.receipts (group_id);
create index if not exists idx_receipts_created_at on public.receipts (created_at desc);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

-- Ensure receipt_id is uuid if created in an earlier migration
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'receipt_items'
      and column_name = 'receipt_id' and data_type = 'text'
  ) then
    alter table public.receipt_items alter column receipt_id type uuid using receipt_id::uuid;
  end if;
end $$;

create index if not exists idx_receipt_items_receipt_id on public.receipt_items (receipt_id);

-- ---------------------------------------------------------------------------
-- 4. Item Claims (US 2.3 Member Claims)
-- ---------------------------------------------------------------------------

create table if not exists public.item_claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.receipt_items (id) on delete cascade,
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  user_id uuid default null references auth.users (id) on delete cascade,
  guest_name text default null,
  claimed_at timestamptz not null default now(),
  constraint chk_claimant_present check (
    (user_id is not null) or (guest_name is not null and length(trim(guest_name)) > 0)
  )
);

create index if not exists idx_item_claims_item_id on public.item_claims (item_id);
create index if not exists idx_item_claims_receipt_id on public.item_claims (receipt_id);

-- Enforce unique claim per member and unique claim per guest name on the same item
create unique index if not exists idx_item_claims_user_unique
  on public.item_claims (item_id, user_id)
  where user_id is not null;

create unique index if not exists idx_item_claims_guest_unique
  on public.item_claims (item_id, lower(trim(guest_name)))
  where guest_name is not null;

-- Ensure columns are uuid and receipt_id is nullable if table already existed
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'item_claims'
      and column_name = 'receipt_id' and data_type = 'text'
  ) then
    alter table public.item_claims alter column receipt_id type uuid using receipt_id::uuid;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'item_claims'
      and column_name = 'item_id' and data_type = 'text'
  ) then
    alter table public.item_claims alter column item_id type uuid using item_id::uuid;
  end if;
end $$;

-- Allow receipt_id to be populated automatically from item_id if omitted
alter table public.item_claims
  alter column receipt_id drop not null;

create or replace function public.set_item_claim_receipt_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.receipt_id is null and new.item_id is not null then
    select receipt_id into new.receipt_id
    from public.receipt_items
    where id = new.item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_item_claim_insert on public.item_claims;
create trigger on_item_claim_insert
  before insert on public.item_claims
  for each row execute function public.set_item_claim_receipt_id();

-- ---------------------------------------------------------------------------
-- 5. Receipt Guest Tokens (US 2.5 Anonymous Web Claiming)
-- ---------------------------------------------------------------------------

create table if not exists public.receipt_guest_tokens (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz default (now() + interval '7 days')
);

create index if not exists idx_receipt_guest_tokens_token on public.receipt_guest_tokens (token);
create index if not exists idx_receipt_guest_tokens_receipt_id on public.receipt_guest_tokens (receipt_id);

-- ---------------------------------------------------------------------------
-- 6. Row Level Security Policies
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.item_claims enable row level security;
alter table public.receipt_guest_tokens enable row level security;

-- Profiles
revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;

drop policy if exists "Members can view profiles" on public.profiles;
create policy "Members can view profiles"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.shares_group_with(id));

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Groups
revoke all on public.groups from anon;
grant select, insert, update, delete on public.groups to authenticated;

drop policy if exists "Members can view their groups" on public.groups;
create policy "Members can view their groups"
  on public.groups for select
  to authenticated
  using (
    created_by = auth.uid() or
    exists (
      select 1 from public.group_members
      where group_id = groups.id and user_id = auth.uid()
    )
  );

drop policy if exists "Signed-in users can create groups" on public.groups;
create policy "Signed-in users can create groups"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Owners can update their groups" on public.groups;
create policy "Owners can update their groups"
  on public.groups for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "Owners can delete their groups" on public.groups;
create policy "Owners can delete their groups"
  on public.groups for delete
  to authenticated
  using (created_by = auth.uid());

-- Group Members
revoke all on public.group_members from anon;
grant select, delete on public.group_members to authenticated;

drop policy if exists "Members can view other members in same group" on public.group_members;
create policy "Members can view other members in same group"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "Members can leave groups or owner can remove" on public.group_members;
create policy "Members can leave groups or owner can remove"
  on public.group_members for delete
  to authenticated
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

-- Receipts
revoke all on public.receipts from anon;
grant select, insert, update, delete on public.receipts to authenticated;

drop policy if exists "Members view receipts" on public.receipts;
create policy "Members view receipts"
  on public.receipts for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "Members insert receipts" on public.receipts;
create policy "Members insert receipts"
  on public.receipts for insert
  to authenticated
  with check (
    public.is_group_member(group_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "Members update own receipts or drafts" on public.receipts;
create policy "Members update own receipts or drafts"
  on public.receipts for update
  to authenticated
  using (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or status = 'draft')
  )
  with check (
    public.is_group_member(group_id)
  );

drop policy if exists "Members delete own drafts" on public.receipts;
create policy "Members delete own drafts"
  on public.receipts for delete
  to authenticated
  using (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or status = 'draft')
  );

-- Receipt Items
grant select, insert, update, delete on public.receipt_items to authenticated;

drop policy if exists "Members view items" on public.receipt_items;
create policy "Members view items"
  on public.receipt_items for select
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id and public.is_group_member(r.group_id)
    )
  );

drop policy if exists "Members insert items" on public.receipt_items;
create policy "Members insert items"
  on public.receipt_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id and public.is_group_member(r.group_id)
    )
  );

drop policy if exists "Members update items" on public.receipt_items;
create policy "Members update items"
  on public.receipt_items for update
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id and public.is_group_member(r.group_id)
    )
  )
  with check (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id and public.is_group_member(r.group_id)
    )
  );

drop policy if exists "Members delete items" on public.receipt_items;
create policy "Members delete items"
  on public.receipt_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id and public.is_group_member(r.group_id)
    )
  );

-- Public read for items when accessed with a valid guest token
drop policy if exists "Public read items with valid guest token" on public.receipt_items;
create policy "Public read items with valid guest token"
  on public.receipt_items for select
  to anon
  using (
    exists (
      select 1 from public.receipt_guest_tokens t
      where t.receipt_id = receipt_items.receipt_id
        and (t.expires_at is null or t.expires_at > now())
    )
  );

-- Receipt Guest Tokens
grant select, insert on public.receipt_guest_tokens to authenticated;
grant select on public.receipt_guest_tokens to anon;

drop policy if exists "Anyone can read valid guest tokens" on public.receipt_guest_tokens;
create policy "Anyone can read valid guest tokens"
  on public.receipt_guest_tokens for select
  to anon, authenticated
  using (
    (expires_at is null or expires_at > now())
    or exists (
      select 1 from public.receipts r
      where r.id = receipt_guest_tokens.receipt_id and public.is_group_member(r.group_id)
    )
  );

drop policy if exists "Members insert guest tokens" on public.receipt_guest_tokens;
create policy "Members insert guest tokens"
  on public.receipt_guest_tokens for insert
  to authenticated
  with check (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_guest_tokens.receipt_id and public.is_group_member(r.group_id)
    )
  );

-- Item Claims
grant select, insert, delete on public.item_claims to authenticated;
grant select on public.item_claims to anon;

drop policy if exists "Members view claims" on public.item_claims;
create policy "Members view claims"
  on public.item_claims for select
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = item_claims.receipt_id and public.is_group_member(r.group_id)
    ) or exists (
      select 1 from public.receipt_items i
      join public.receipts r on r.id = i.receipt_id
      where i.id = item_claims.item_id and public.is_group_member(r.group_id)
    )
  );

-- Only members of the receipt's group can claim or unclaim (US 2.3). Same as
-- supabase/migrations/20261111_item_claims_member_only.sql. The check joins
-- from item_id and doesn't trust item_claims.receipt_id.
drop policy if exists "Users insert own claim" on public.item_claims;
create policy "Users insert own claim"
  on public.item_claims for insert
  to authenticated
  with check (
    user_id = auth.uid()
    -- Members claim as themselves, never under a guest name.
    and guest_name is null
    and exists (
      select 1
      from public.receipt_items i
      join public.receipts r on r.id = i.receipt_id
      where i.id = item_claims.item_id
        and (item_claims.receipt_id is null or item_claims.receipt_id = i.receipt_id)
        and public.is_group_member(r.group_id)
    )
  );

drop policy if exists "Users delete own claim" on public.item_claims;
create policy "Users delete own claim"
  on public.item_claims for delete
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.receipt_items i
      join public.receipts r on r.id = i.receipt_id
      where i.id = item_claims.item_id
        and public.is_group_member(r.group_id)
    )
  );

drop policy if exists "Public read claims with valid guest token" on public.item_claims;
create policy "Public read claims with valid guest token"
  on public.item_claims for select
  to anon
  using (
    exists (
      select 1 from public.receipt_guest_tokens t
      where t.receipt_id = item_claims.receipt_id
        and (t.expires_at is null or t.expires_at > now())
    )
  );

-- ---------------------------------------------------------------------------
-- 7. App RPCs
-- ---------------------------------------------------------------------------

-- RPC: create_group(p_name text)
drop function if exists public.create_group(text) cascade;
create or replace function public.create_group(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group public.groups%rowtype;
  v_code text;
  v_attempts int := 0;
begin
  if v_user is null then
    raise exception 'Sign in to create a group' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Group name cannot be empty' using errcode = '22023';
  end if;

  loop
    v_code := public.generate_invite_code();
    begin
      insert into public.groups (name, created_by, invite_code)
      values (trim(p_name), v_user, v_code)
      returning * into v_group;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'Failed to generate unique invite code' using errcode = '54000';
      end if;
    end;
  end loop;

  -- Ensure creator is immediately recorded as group owner in group_members
  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_user, 'owner')
  on conflict (group_id, user_id) do nothing;

  return jsonb_build_object(
    'success', true,
    'message', format('Group "%s" created successfully', v_group.name),
    'group', jsonb_build_object(
      'id', v_group.id,
      'name', v_group.name,
      'invite_code', v_group.invite_code,
      'created_at', v_group.created_at
    )
  );
end;
$$;

revoke execute on function public.create_group(text) from public, anon;
grant execute on function public.create_group(text) to authenticated;

-- RPC: join_group(p_invite_code text)
drop function if exists public.join_group(text) cascade;
drop function if exists public.join_group(text, text) cascade;
create or replace function public.join_group(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group public.groups%rowtype;
  v_inserted int;
begin
  if v_user is null then
    raise exception 'Sign in to join a group' using errcode = '42501';
  end if;

  if p_invite_code is null or trim(p_invite_code) = '' then
    return jsonb_build_object(
      'success', false,
      'error', 'EMPTY_CODE',
      'message', 'Please enter an invite code'
    );
  end if;

  select * into v_group
  from public.groups
  where lower(invite_code) = lower(trim(p_invite_code))
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'INVALID_CODE',
      'message', 'No group found with that invite code'
    );
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_group.id, v_user)
  on conflict (group_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'success', true,
    'status', case when v_inserted = 0 then 'ALREADY_MEMBER' else 'JOINED' end,
    'group', jsonb_build_object(
      'id', v_group.id,
      'name', v_group.name,
      'invite_code', v_group.invite_code,
      'created_by', v_group.created_by,
      'created_at', v_group.created_at
    ),
    'message', case
      when v_inserted = 0 then 'You are already in this group'
      else format('Joined %s successfully', v_group.name)
    end
  );
end;
$$;

revoke execute on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;

-- RPC: get_group(p_group_id text)
-- Returns group metadata, member profiles, and real receipts list
drop function if exists public.get_group(text) cascade;
drop function if exists public.get_group(uuid) cascade;
create or replace function public.get_group(p_group_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
  v_group_uuid uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to view groups' using errcode = '42501';
  end if;

  begin
    v_group_uuid := p_group_id::uuid;
  exception when others then
    raise exception 'Not a member of this group' using errcode = '42501';
  end;

  select g.* into v_group
  from public.groups g
  where g.id = v_group_uuid and public.is_group_member(g.id);

  if not found then
    raise exception 'Not a member of this group' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'group', jsonb_build_object(
      'id', v_group.id,
      'name', v_group.name,
      'invite_code', v_group.invite_code,
      'created_by', v_group.created_by,
      'created_at', v_group.created_at
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'display_name', p.display_name,
        'role', m.role,
        'joined_at', m.joined_at
      ) order by m.joined_at)
      from public.group_members m
      left join public.profiles p on p.id = m.user_id
      where m.group_id = v_group.id
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'total_cents', r.total_cents,
        'status', r.status,
        'created_at', r.created_at
      ) order by r.created_at desc)
      from public.receipts r
      where r.group_id = v_group.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_group(text) from public, anon;
grant execute on function public.get_group(text) to authenticated;

-- RPC: leave_group(p_group_id text)
-- Teammate helper: allows a member to leave a group
drop function if exists public.leave_group(text) cascade;
drop function if exists public.leave_group(uuid) cascade;
create or replace function public.leave_group(p_group_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group_uuid uuid := p_group_id::uuid;
  v_role text;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select role into v_role
  from public.group_members
  where group_id = v_group_uuid and user_id = v_user;

  if not found then
    return jsonb_build_object('success', false, 'message', 'You are not a member of this group');
  end if;

  if v_role = 'owner' then
    -- If owner is leaving, check if there are other members
    if (select count(*) from public.group_members where group_id = v_group_uuid) > 1 then
      return jsonb_build_object('success', false, 'message', 'Owners cannot leave while other members remain. Delete group or transfer ownership.');
    else
      delete from public.groups where id = v_group_uuid;
      return jsonb_build_object('success', true, 'message', 'Group deleted');
    end if;
  end if;

  delete from public.group_members
  where group_id = v_group_uuid and user_id = v_user;

  return jsonb_build_object('success', true, 'message', 'Left group successfully');
end;
$$;

revoke execute on function public.leave_group(text) from public, anon;
grant execute on function public.leave_group(text) to authenticated;

-- RPC: remove_group_member(p_group_id text, p_target_user_id text)
-- Teammate helper: allows group owner to remove another member
drop function if exists public.remove_group_member(text, text) cascade;
drop function if exists public.remove_group_member(uuid, uuid) cascade;
create or replace function public.remove_group_member(p_group_id text, p_target_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group_uuid uuid := p_group_id::uuid;
  v_target_uuid uuid := p_target_user_id::uuid;
  v_is_owner boolean;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select exists(
    select 1 from public.group_members
    where group_id = v_group_uuid and user_id = v_user and role = 'owner'
  ) into v_is_owner;

  if not v_is_owner then
    return jsonb_build_object('success', false, 'message', 'Only group owners can remove members');
  end if;

  if v_user = v_target_uuid then
    return jsonb_build_object('success', false, 'message', 'Cannot remove yourself as owner');
  end if;

  delete from public.group_members
  where group_id = v_group_uuid and user_id = v_target_uuid;

  return jsonb_build_object('success', true, 'message', 'Member removed successfully');
end;
$$;

revoke execute on function public.remove_group_member(text, text) from public, anon;
grant execute on function public.remove_group_member(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Anonymous Guest Claiming RPCs (US 2.5)
-- ---------------------------------------------------------------------------

-- RPC: get_receipt_by_guest_token(p_token text)
drop function if exists public.get_receipt_by_guest_token(text) cascade;
create or replace function public.get_receipt_by_guest_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_rec record;
  v_receipt public.receipts%rowtype;
  v_items jsonb;
begin
  select * into v_token_rec
  from public.receipt_guest_tokens
  where token = p_token
    and (expires_at is null or expires_at > now());

  if not found then
    return null;
  end if;

  select * into v_receipt
  from public.receipts
  where id = v_token_rec.receipt_id;

  if not found then
    v_receipt.title := 'Receipt';
    v_receipt.total_cents := 0;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'receipt_id', i.receipt_id,
        'name', i.name,
        'amount_cents', i.amount_cents,
        'created_at', i.created_at,
        'claims', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', c.id,
                'user_id', c.user_id,
                'guest_name', c.guest_name,
                'display_name', coalesce(c.guest_name, p.display_name, 'Member')
              )
            )
            from public.item_claims c
            left join public.profiles p on p.id = c.user_id
            where c.item_id = i.id
          ),
          '[]'::jsonb
        )
      )
      order by i.created_at asc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.receipt_items i
  where i.receipt_id = v_token_rec.receipt_id;

  return jsonb_build_object(
    'token', v_token_rec.token,
    'receipt_id', v_token_rec.receipt_id,
    'title', coalesce(v_receipt.title, 'Receipt'),
    'total_cents', coalesce(v_receipt.total_cents, 0),
    'created_at', v_token_rec.created_at,
    'expires_at', v_token_rec.expires_at,
    'items', v_items
  );
end;
$$;

revoke execute on function public.get_receipt_by_guest_token(text) from public;
grant execute on function public.get_receipt_by_guest_token(text) to anon, authenticated;

-- RPC: claim_item_as_guest(p_token text, p_item_id text, p_guest_name text, p_claimed boolean)
drop function if exists public.claim_item_as_guest(text, text, text, boolean) cascade;
drop function if exists public.claim_item_as_guest(text, text, text) cascade;
create or replace function public.claim_item_as_guest(
  p_token text,
  p_item_id text,
  p_guest_name text,
  p_claimed boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_rec record;
  v_item record;
  v_trimmed_name text;
  v_item_uuid uuid;
begin
  v_trimmed_name := trim(coalesce(p_guest_name, ''));
  if length(v_trimmed_name) = 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'EMPTY_NAME',
      'message', 'Please enter a name before claiming items.'
    );
  end if;

  begin
    v_item_uuid := p_item_id::uuid;
  exception when others then
    return jsonb_build_object(
      'success', false,
      'error', 'ITEM_NOT_FOUND',
      'message', 'The requested item was not found on this receipt.'
    );
  end;

  select * into v_token_rec
  from public.receipt_guest_tokens
  where token = p_token
    and (expires_at is null or expires_at > now());

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'INVALID_TOKEN',
      'message', 'This claim link is invalid or has expired.'
    );
  end if;

  select * into v_item
  from public.receipt_items
  where id = v_item_uuid and receipt_id = v_token_rec.receipt_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'ITEM_NOT_FOUND',
      'message', 'The requested item was not found on this receipt.'
    );
  end if;

  if p_claimed then
    if not exists (
      select 1 from public.item_claims
      where item_id = v_item_uuid and lower(trim(guest_name)) = lower(v_trimmed_name)
    ) then
      insert into public.item_claims (item_id, receipt_id, guest_name)
      values (v_item_uuid, v_token_rec.receipt_id, v_trimmed_name);
    end if;
  else
    delete from public.item_claims
    where item_id = v_item_uuid
      and lower(trim(guest_name)) = lower(v_trimmed_name);
  end if;

  return jsonb_build_object(
    'success', true,
    'item_id', p_item_id,
    'guest_name', v_trimmed_name,
    'claimed', p_claimed
  );
end;
$$;

revoke execute on function public.claim_item_as_guest(text, text, text, boolean) from public;
grant execute on function public.claim_item_as_guest(text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Starter Counter Utility
-- ---------------------------------------------------------------------------

create table if not exists public.counter (
  id int primary key default 1 check (id = 1),
  clicks bigint not null default 0
);

insert into public.counter (id) values (1) on conflict (id) do nothing;

alter table public.counter enable row level security;

drop policy if exists "Signed-in users can read the counter" on public.counter;
create policy "Signed-in users can read the counter"
  on public.counter for select
  to authenticated
  using (true);

revoke all on public.counter from anon;
grant select on public.counter to authenticated;

drop function if exists public.increment_clicks() cascade;
create or replace function public.increment_clicks()
returns bigint
language sql
security definer
set search_path = ''
as $$
  update public.counter set clicks = clicks + 1 where id = 1 returning clicks;
$$;

revoke execute on function public.increment_clicks() from public, anon;
grant execute on function public.increment_clicks() to authenticated;
