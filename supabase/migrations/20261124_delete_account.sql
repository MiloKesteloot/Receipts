-- Migration: Delete user account RPC (User Story 4.3, Task 1)
--
-- delete_user_account() lets an authenticated user permanently delete their account.
-- It purges all groups owned by the user, removes their memberships in other groups,
-- anonymizes their past claims in other groups to 'Deleted user' to preserve roommates'
-- balances, removes their profile and push tokens, and deletes their auth.users record.
--
-- Safe to re-run. Mirrored in supabase/setup.sql.

drop function if exists public.delete_user_account() cascade;

create or replace function public.delete_user_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_owned_group_ids uuid[];
begin
  if v_user is null then
    raise exception 'Sign in to delete your account' using errcode = '42501';
  end if;

  -- 1. Identify all groups owned by the user (created_by or role = 'owner')
  select coalesce(array_agg(distinct g_id), '{}') into v_owned_group_ids
  from (
    select id as g_id from public.groups where created_by = v_user
    union
    select group_id as g_id from public.group_members where user_id = v_user and role = 'owner'
  ) owned;

  -- 2. Delete all owned groups and their associated data
  if array_length(v_owned_group_ids, 1) > 0 then
    -- Delete push nudges and payments for receipts in owned groups
    delete from public.pay_me_nudges
    where receipt_id in (
      select id from public.receipts where group_id = any(v_owned_group_ids)
    );

    delete from public.receipt_payments
    where receipt_id in (
      select id from public.receipts where group_id = any(v_owned_group_ids)
    );

    -- Delete claims for receipts in owned groups
    delete from public.item_claims
    where receipt_id in (
      select id from public.receipts where group_id = any(v_owned_group_ids)
    )
    or item_id in (
      select i.id
      from public.receipt_items i
      join public.receipts r on r.id = i.receipt_id
      where r.group_id = any(v_owned_group_ids)
    );

    -- Delete items for receipts in owned groups
    delete from public.receipt_items
    where receipt_id in (
      select id from public.receipts where group_id = any(v_owned_group_ids)
    );

    -- Delete guest tokens for receipts in owned groups
    delete from public.receipt_guest_tokens
    where receipt_id in (
      select id from public.receipts where group_id = any(v_owned_group_ids)
    );

    -- Delete receipts in owned groups
    delete from public.receipts where group_id = any(v_owned_group_ids);

    -- Delete members of owned groups
    delete from public.group_members where group_id = any(v_owned_group_ids);

    -- Delete the owned groups themselves
    delete from public.groups where id = any(v_owned_group_ids);
  end if;

  -- 3. In other groups where user is a non-owner member:
  -- Anonymize user's claims to 'Deleted user' with user_id = null so that
  -- foreign key to auth.users won't cascade-delete them, preserving roommates' balances!
  update public.item_claims
  set user_id = null,
      guest_name = 'Deleted user'
  where user_id = v_user;

  -- Delete receipt payments recorded for this user
  delete from public.receipt_payments where user_id = v_user;

  -- Remove group membership in remaining groups
  delete from public.group_members where user_id = v_user;

  -- 4. Delete push tokens registered for this user
  delete from public.push_tokens where user_id = v_user;

  -- 5. Delete profile record
  delete from public.profiles where id = v_user;

  -- 6. Delete user from auth.users (cascading anything remaining)
  delete from auth.users where id = v_user;

  return jsonb_build_object(
    'success', true,
    'message', 'Account deleted successfully'
  );
end;
$$;

revoke execute on function public.delete_user_account() from public, anon;
grant execute on function public.delete_user_account() to authenticated;

notify pgrst, 'reload schema';
