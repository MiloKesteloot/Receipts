-- Migration: finalize a receipt and lock it afterwards (User Story 3.3, Task 2)
--
-- 1. Receipts store tax and tip, so they can be split by subtotal (US 3.3 T-1).
-- 2. A receipt can be 'finalized'. Only the finalize_receipt RPC sets that,
--    and only for the uploader, once every item has at least one claim.
-- 3. Once finalized, claims (member and guest) and items can't change, and
--    clients can't edit the receipt row.
--
-- Same as the matching parts of supabase/setup.sql. Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns and status
-- ---------------------------------------------------------------------------

alter table public.receipts
  add column if not exists tax_cents bigint not null default 0,
  add column if not exists tip_cents bigint not null default 0,
  add column if not exists finalized_at timestamptz default null;

alter table public.receipts drop constraint if exists receipts_tax_cents_check;
alter table public.receipts
  add constraint receipts_tax_cents_check check (tax_cents >= 0);
alter table public.receipts drop constraint if exists receipts_tip_cents_check;
alter table public.receipts
  add constraint receipts_tip_cents_check check (tip_cents >= 0);

-- Replace whichever check constraint(s) limit status to draft/submitted.
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.receipts'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.receipts drop constraint %I', v_name);
  end loop;
end $$;

alter table public.receipts
  add constraint receipts_status_check
  check (status in ('draft', 'submitted', 'finalized'));

-- ---------------------------------------------------------------------------
-- 2. RLS: clients can't edit or finalize receipts themselves
-- ---------------------------------------------------------------------------

drop policy if exists "Members update own receipts or drafts" on public.receipts;
create policy "Members update own receipts or drafts"
  on public.receipts for update
  to authenticated
  using (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or status = 'draft')
    and status <> 'finalized'
  )
  with check (
    public.is_group_member(group_id)
    -- Only finalize_receipt (security definer) may set 'finalized'.
    and status in ('draft', 'submitted')
  );

drop policy if exists "Members insert items" on public.receipt_items;
create policy "Members insert items"
  on public.receipt_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and public.is_group_member(r.group_id)
        and r.status <> 'finalized'
    )
  );

drop policy if exists "Members update items" on public.receipt_items;
create policy "Members update items"
  on public.receipt_items for update
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and public.is_group_member(r.group_id)
        and r.status <> 'finalized'
    )
  )
  with check (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and public.is_group_member(r.group_id)
        and r.status <> 'finalized'
    )
  );

drop policy if exists "Members delete items" on public.receipt_items;
create policy "Members delete items"
  on public.receipt_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and public.is_group_member(r.group_id)
        and r.status <> 'finalized'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Claims can't change on a finalized receipt
-- ---------------------------------------------------------------------------
--
-- A trigger rather than RLS so it also covers claim_item_as_guest (security
-- definer, which skips RLS). It locks the receipt row FOR SHARE, so it waits
-- for a finalize_receipt in progress (FOR UPDATE) and can't slip a change in
-- between finalize's "all claimed" check and its update.
--
-- Cascaded deletes (deleting an item, receipt, group or user) run at trigger
-- depth > 1 and are let through.

create or replace function public.block_claims_on_finalized_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_status text;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  v_item_id := case when tg_op = 'DELETE' then old.item_id else new.item_id end;

  -- Look the receipt up from the item: receipt_id on the claim may not be
  -- set yet (set_item_claim_receipt_id is another BEFORE trigger).
  select r.status into v_status
  from public.receipts r
  join public.receipt_items i on i.receipt_id = r.id
  where i.id = v_item_id
  for share of r;

  if v_status = 'finalized' then
    raise exception 'This receipt is finalized, so claims can''t change.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists block_claims_on_finalized_receipt on public.item_claims;
create trigger block_claims_on_finalized_receipt
  before insert or delete on public.item_claims
  for each row execute function public.block_claims_on_finalized_receipt();

-- ---------------------------------------------------------------------------
-- 4. RPC: finalize_receipt(p_receipt_id text)
-- ---------------------------------------------------------------------------

create or replace function public.finalize_receipt(p_receipt_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt_id uuid;
  v_receipt public.receipts%rowtype;
  v_item_count integer;
  v_unclaimed_count integer;
  v_finalized_at timestamptz;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_SIGNED_IN',
      'message', 'Please sign in and try again.'
    );
  end if;

  begin
    v_receipt_id := p_receipt_id::uuid;
  exception when others then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_FOUND',
      'message', 'Receipt not found.'
    );
  end;

  -- Lock the receipt so claims can't change while we check them.
  select * into v_receipt
  from public.receipts
  where id = v_receipt_id
  for update;

  if not found or not public.is_group_member(v_receipt.group_id) then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_FOUND',
      'message', 'Receipt not found.'
    );
  end if;

  if v_receipt.created_by <> v_user_id then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_UPLOADER',
      'message', 'Only the person who uploaded this receipt can finalize it.'
    );
  end if;

  if v_receipt.status = 'finalized' then
    return jsonb_build_object(
      'success', false,
      'error', 'ALREADY_FINALIZED',
      'message', 'This receipt is already finalized.'
    );
  end if;

  if v_receipt.status <> 'submitted' then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_SUBMITTED',
      'message', 'Submit this receipt before finalizing it.'
    );
  end if;

  select count(*) into v_item_count
  from public.receipt_items
  where receipt_id = v_receipt_id;

  if v_item_count = 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'NO_ITEMS',
      'message', 'This receipt has no items to split.'
    );
  end if;

  select count(*) into v_unclaimed_count
  from public.receipt_items i
  where i.receipt_id = v_receipt_id
    and not exists (select 1 from public.item_claims c where c.item_id = i.id);

  if v_unclaimed_count > 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'UNCLAIMED_ITEMS',
      'message', 'Every item needs to be claimed before finalizing.',
      'unclaimed_count', v_unclaimed_count
    );
  end if;

  update public.receipts
  set status = 'finalized', finalized_at = now()
  where id = v_receipt_id
  returning finalized_at into v_finalized_at;

  return jsonb_build_object(
    'success', true,
    'receipt_id', v_receipt_id,
    'finalized_at', v_finalized_at
  );
end;
$$;

revoke execute on function public.finalize_receipt(text) from public, anon;
grant execute on function public.finalize_receipt(text) to authenticated;

commit;
