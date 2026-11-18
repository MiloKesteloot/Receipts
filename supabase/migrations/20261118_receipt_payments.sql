-- Migration: mark shares paid and confirm them (User Story 3.4, Task 2)
--
-- 1. receipt_payments records where each person's share of a finalized
--    receipt stands: 'paid' (marked by the payer), 'confirmed' or
--    'not_received' (answered by the uploader). No row means unpaid.
-- 2. mark_share_paid lets a member mark their own share paid.
-- 3. respond_to_payment lets the uploader confirm a payment or say it wasn't
--    received. Guest shares can be confirmed directly.
--
-- Same as the matching part of supabase/setup.sql. Safe to run more than once.

begin;

--
-- One row per person who owes on a finalized receipt, once they (or the
-- uploader, for guests) do something about it. No row means "unpaid".
-- payer_key is a member's user id, or 'guest:' + their trimmed, lowercased
-- name, the same key the app splits guest claims under (guestClaimKey).
-- Only mark_share_paid and respond_to_payment write here.

create table if not exists public.receipt_payments (
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  payer_key text not null check (length(payer_key) > 0),
  state text not null check (state in ('paid', 'confirmed', 'not_received')),
  marked_paid_at timestamptz default null,
  responded_at timestamptz default null,
  updated_at timestamptz not null default now(),
  primary key (receipt_id, payer_key)
);

alter table public.receipt_payments enable row level security;

revoke all on public.receipt_payments from anon, authenticated;
grant select on public.receipt_payments to authenticated;

drop policy if exists "Members view payments" on public.receipt_payments;
create policy "Members view payments"
  on public.receipt_payments for select
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_payments.receipt_id
        and public.is_group_member(r.group_id)
    )
  );

-- Whether someone (by payer key) has a claim on a receipt.
create or replace function public.receipt_has_payer(p_receipt_id uuid, p_payer_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.item_claims c
    join public.receipt_items i on i.id = c.item_id
    where i.receipt_id = p_receipt_id
      and case
        when c.user_id is not null then c.user_id::text
        else 'guest:' || lower(trim(c.guest_name))
      end = p_payer_key
  );
$$;

revoke execute on function public.receipt_has_payer(uuid, text) from public, anon, authenticated;

-- RPC: mark_share_paid(p_receipt_id text)
-- A member marks their own share of a finalized receipt as paid.
create or replace function public.mark_share_paid(p_receipt_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt_id uuid;
  v_receipt public.receipts%rowtype;
  v_payment public.receipt_payments%rowtype;
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

  -- Lock the receipt so a response can't race this.
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

  if v_receipt.status <> 'finalized' then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_FINALIZED',
      'message', 'This receipt needs to be finalized before shares can be paid.'
    );
  end if;

  if v_receipt.created_by = v_user_id then
    return jsonb_build_object(
      'success', false,
      'error', 'IS_UPLOADER',
      'message', 'You paid for this receipt, so you don''t owe anyone.'
    );
  end if;

  if not public.receipt_has_payer(v_receipt_id, v_user_id::text) then
    return jsonb_build_object(
      'success', false,
      'error', 'NO_SHARE',
      'message', 'You don''t have a share on this receipt.'
    );
  end if;

  select * into v_payment
  from public.receipt_payments
  where receipt_id = v_receipt_id and payer_key = v_user_id::text;

  if found and v_payment.state = 'confirmed' then
    return jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CONFIRMED',
      'message', 'Your payment was already confirmed.'
    );
  end if;

  if not found or v_payment.state <> 'paid' then
    insert into public.receipt_payments
      (receipt_id, payer_key, state, marked_paid_at, responded_at, updated_at)
    values (v_receipt_id, v_user_id::text, 'paid', now(), null, now())
    on conflict (receipt_id, payer_key) do update
      set state = 'paid',
          marked_paid_at = excluded.marked_paid_at,
          responded_at = null,
          updated_at = excluded.updated_at
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'success', true,
    'payer_key', v_payment.payer_key,
    'state', v_payment.state,
    'marked_paid_at', v_payment.marked_paid_at,
    'responded_at', v_payment.responded_at
  );
end;
$$;

revoke execute on function public.mark_share_paid(text) from public, anon;
grant execute on function public.mark_share_paid(text) to authenticated;

-- RPC: respond_to_payment(p_receipt_id text, p_payer_key text, p_received boolean)
-- The uploader confirms a payment or says it wasn't received. Guests can't
-- mark paid in the app, so their shares can be confirmed directly.
create or replace function public.respond_to_payment(
  p_receipt_id text,
  p_payer_key text,
  p_received boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt_id uuid;
  v_receipt public.receipts%rowtype;
  v_payment public.receipt_payments%rowtype;
  v_payer_key text := trim(coalesce(p_payer_key, ''));
  v_received boolean := coalesce(p_received, false);
  v_is_guest boolean;
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
      'message', 'Only the person who uploaded this receipt can confirm payments.'
    );
  end if;

  if v_receipt.status <> 'finalized' then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_FINALIZED',
      'message', 'This receipt needs to be finalized before payments can be confirmed.'
    );
  end if;

  if v_payer_key = ''
    or v_payer_key = v_receipt.created_by::text
    or not public.receipt_has_payer(v_receipt_id, v_payer_key)
  then
    return jsonb_build_object(
      'success', false,
      'error', 'NO_SHARE',
      'message', 'That person doesn''t have a share on this receipt.'
    );
  end if;

  v_is_guest := v_payer_key like 'guest:%';

  select * into v_payment
  from public.receipt_payments
  where receipt_id = v_receipt_id and payer_key = v_payer_key;

  if found and v_payment.state = 'confirmed' then
    return jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CONFIRMED',
      'message', 'This payment was already confirmed.'
    );
  end if;

  -- Members mark paid first. Guests can only be confirmed directly.
  if (not found or v_payment.state <> 'paid') and (not v_is_guest or not v_received) then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_MARKED_PAID',
      'message', 'This share hasn''t been marked as paid.'
    );
  end if;

  insert into public.receipt_payments
    (receipt_id, payer_key, state, marked_paid_at, responded_at, updated_at)
  values (
    v_receipt_id,
    v_payer_key,
    case when v_received then 'confirmed' else 'not_received' end,
    null,
    now(),
    now()
  )
  on conflict (receipt_id, payer_key) do update
    set state = excluded.state,
        responded_at = excluded.responded_at,
        updated_at = excluded.updated_at
  returning * into v_payment;

  return jsonb_build_object(
    'success', true,
    'payer_key', v_payment.payer_key,
    'state', v_payment.state,
    'marked_paid_at', v_payment.marked_paid_at,
    'responded_at', v_payment.responded_at
  );
end;
$$;

revoke execute on function public.respond_to_payment(text, text, boolean) from public, anon;
grant execute on function public.respond_to_payment(text, text, boolean) to authenticated;

commit;
