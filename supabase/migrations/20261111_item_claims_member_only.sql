-- Migration: only group members can claim or unclaim items (User Story 2.3, Tasks 1 & 6)
--
-- Before this, "Users insert own claim" only checked user_id = auth.uid(), so
-- any signed-in user who knew an item id could claim it. Both policies now
-- also require the claimer to be a member of the group that owns the item's
-- receipt.
--
-- The membership check joins from item_id (receipt_items -> receipts) and
-- does not trust item_claims.receipt_id: RLS WITH CHECK runs after the
-- set_item_claim_receipt_id BEFORE trigger, but the client may also send its
-- own receipt_id, so it must match the item's receipt when present.
--
-- Guest claims are unaffected: claim_item_as_guest is security definer and
-- doesn't go through these policies.
--
-- Safe to run more than once.

begin;

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

commit;
