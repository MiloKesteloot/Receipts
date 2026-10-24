-- Run this in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Safe to run again; it only adds what is missing and replaces policies/functions.
--
-- Access rule: everything needs a signed-in account. The `anon` role (the
-- publishable key with no session) can't read or change any table here, and
-- groups are only visible to their members.

-- ---------------------------------------------------------------------------
-- Profiles: one per account, created automatically on sign-up.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Fill in the profile from the account. Google sends `full_name`/`name`;
-- Apple's name arrives later via updateUser, so this also runs on update.
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
-- Groups and memberships.
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

-- Policy helpers. `security definer` lets them read group_members without
-- tripping that table's own policies (which would recurse).
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
  );
$$;

create or replace function public.shares_group_with(p_user_id uuid)
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
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.shares_group_with(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;

-- Whoever creates a group becomes its owner.
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
-- Row Level Security. Every policy is `to authenticated`; anon gets nothing.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

revoke all on public.profiles, public.groups, public.group_members from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;

-- Profiles: yourself, and people you share a group with.
drop policy if exists "Members can view profiles" on public.profiles;
create policy "Members can view profiles"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.shares_group_with(id));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Groups: members can see; anyone signed in can create; owners can edit/delete.
-- Joining goes through join_group(), so non-members never read groups directly.
drop policy if exists "Members can view their groups" on public.groups;
create policy "Members can view their groups"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id));

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

-- Memberships: members see who else is in the group; you can leave a group.
-- There is no insert policy: rows are only added by join_group() and the
-- owner trigger, so nobody can add themselves (or others) to a group directly.
drop policy if exists "Members can view group members" on public.group_members;
create policy "Members can view group members"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "Users can leave groups" on public.group_members;
create policy "Users can leave groups"
  on public.group_members for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPCs used by the app. Both use auth.uid(), never a user id from the client.
-- ---------------------------------------------------------------------------

-- Join a group by invite code (src/lib/groups.ts). Returns a JoinGroupResult.
drop function if exists public.join_group(text, text);
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

-- One group's details for its page (src/app/(app)/groups/[id].tsx).
-- Raises 42501 for non-members, and for ids that don't exist, so the two
-- look the same.
drop function if exists public.get_group(uuid);
create or replace function public.get_group(p_group_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group public.groups%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to view groups' using errcode = '42501';
  end if;

  select g.* into v_group
  from public.groups g
  where g.id::text = p_group_id and public.is_group_member(g.id);

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
    'receipts', '[]'::jsonb -- receipts arrive in sprint 2
  );
end;
$$;

revoke execute on function public.join_group(text) from public, anon;
revoke execute on function public.get_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.get_group(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Shared click counter (from the starter app), now signed-in users only.
-- ---------------------------------------------------------------------------

create table if not exists public.counter (
  id int primary key default 1 check (id = 1),
  clicks bigint not null default 0
);

insert into public.counter (id) values (1) on conflict (id) do nothing;

alter table public.counter enable row level security;

drop policy if exists "Anyone can read the counter" on public.counter;
drop policy if exists "Signed-in users can read the counter" on public.counter;
create policy "Signed-in users can read the counter"
  on public.counter for select
  to authenticated
  using (true);

revoke all on public.counter from anon;
grant select on public.counter to authenticated;

-- Changes go through this function, which adds exactly 1 inside the database
-- so two taps at the same moment can't overwrite each other.
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
