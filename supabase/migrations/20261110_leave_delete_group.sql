-- Migration: Leave and delete group RPCs (User Story 2.4, Task 1)
--
-- leave_group(p_group_id)  removes the signed-in user from a group. Owners are
--                          refused so a group can never be left without one.
-- delete_group(p_group_id) lets the owner (groups.created_by) permanently
--                          delete a group for every member, with its
--                          memberships, receipts, items, claims and guest
--                          claim links.
--
-- Both return jsonb:
--   { success: true,  group_id, group_name, message }
--   { success: false, error, message }
-- where error is NOT_FOUND | FORBIDDEN | OWNER_CANNOT_LEAVE. Not being signed
-- in raises SQLSTATE 42501, like the other group RPCs.
--
-- A group the caller can't see returns NOT_FOUND (not FORBIDDEN), so these
-- functions don't reveal which group ids exist.
--
-- Safe to re-run. Mirrored in supabase/setup.sql.

-- ---------------------------------------------------------------------------
-- leave_group
-- ---------------------------------------------------------------------------
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
  v_group_uuid uuid;
  v_group public.groups%rowtype;
  v_role text;
begin
  if v_user is null then
    raise exception 'Sign in to leave a group' using errcode = '42501';
  end if;

  begin
    v_group_uuid := p_group_id::uuid;
  exception when others then
    return jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Group not found');
  end;

  select * into v_group from public.groups where id = v_group_uuid;
  if not found then
    return jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Group not found');
  end if;

  select role into v_role
  from public.group_members
  where group_id = v_group_uuid and user_id = v_user;

  if v_group.created_by = v_user or v_role = 'owner' then
    return jsonb_build_object(
      'success', false,
      'error', 'OWNER_CANNOT_LEAVE',
      'message', 'Owners can''t leave their group. Delete the group or transfer ownership instead.'
    );
  end if;

  if v_role is null then
    return jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Group not found');
  end if;

  delete from public.group_members
  where group_id = v_group_uuid and user_id = v_user;

  return jsonb_build_object(
    'success', true,
    'group_id', v_group.id,
    'group_name', v_group.name,
    'message', format('Left %s', v_group.name)
  );
end;
$$;

revoke execute on function public.leave_group(text) from public, anon;
grant execute on function public.leave_group(text) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_group
-- ---------------------------------------------------------------------------
-- The foreign keys already cascade (groups -> group_members, receipts ->
-- receipt_items -> item_claims, receipts -> receipt_guest_tokens), but older
-- databases built from 20261027_guest_claim_tokens.sql may lack some of them,
-- so each table is cleared explicitly. Everything runs in one transaction.
drop function if exists public.delete_group(text) cascade;
drop function if exists public.delete_group(uuid) cascade;
create or replace function public.delete_group(p_group_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group_uuid uuid;
  v_group public.groups%rowtype;
  v_is_member boolean;
begin
  if v_user is null then
    raise exception 'Sign in to delete a group' using errcode = '42501';
  end if;

  begin
    v_group_uuid := p_group_id::uuid;
  exception when others then
    return jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Group not found');
  end;

  -- Lock the row so a concurrent join/receipt insert can't race the delete.
  select * into v_group from public.groups where id = v_group_uuid for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Group not found');
  end if;

  if v_group.created_by is distinct from v_user then
    select exists (
      select 1 from public.group_members
      where group_id = v_group_uuid and user_id = v_user
    ) into v_is_member;

    if v_is_member then
      return jsonb_build_object(
        'success', false,
        'error', 'FORBIDDEN',
        'message', 'Only the group owner can delete this group'
      );
    end if;
    return jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'Group not found');
  end if;

  delete from public.item_claims
  where receipt_id::text in (
    select id::text from public.receipts where group_id = v_group_uuid
  )
  or item_id::text in (
    select i.id::text
    from public.receipt_items i
    join public.receipts r on r.id::text = i.receipt_id::text
    where r.group_id = v_group_uuid
  );

  delete from public.receipt_items
  where receipt_id::text in (
    select id::text from public.receipts where group_id = v_group_uuid
  );

  delete from public.receipt_guest_tokens
  where receipt_id::text in (
    select id::text from public.receipts where group_id = v_group_uuid
  );

  delete from public.receipts where group_id = v_group_uuid;
  delete from public.group_members where group_id = v_group_uuid;
  delete from public.groups where id = v_group_uuid;

  return jsonb_build_object(
    'success', true,
    'group_id', v_group.id,
    'group_name', v_group.name,
    'message', format('%s deleted', v_group.name)
  );
end;
$$;

revoke execute on function public.delete_group(text) from public, anon;
grant execute on function public.delete_group(text) to authenticated;

-- Tell the Data API (PostgREST) to pick up the new functions right away,
-- instead of returning PGRST202 "not found in the schema cache".
notify pgrst, 'reload schema';
