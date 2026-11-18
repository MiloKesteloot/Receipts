-- Migration: Pay me push notifications (User Story 3.5, Task 1)
--
-- 1. push_tokens: each device's Expo push token, registered by the app.
-- 2. pay_me_nudges + start_pay_me: who still owes (using receipt_payments
--    from US 3.4), and at most one Pay me per receipt per hour. Only the
--    send-pay-me Edge Function (service role) can run start_pay_me, because
--    it returns push tokens.
--
-- Same as the matching part of supabase/setup.sql. Safe to run more than once.
-- Run after 20261118_receipt_payments.sql.

begin;

-- ---------------------------------------------------------------------------
-- 8e. Pay me (US 3.5): push tokens and the one-hour cooldown
-- ---------------------------------------------------------------------------
--
-- Same as supabase/migrations/20261119_pay_me.sql. Every table here is
-- written only through security definer RPCs; clients can read what they
-- need but never write directly, and never see anyone else's push token.
-- "Already paid" comes from receipt_payments (US 3.4).

-- One row per device. The token is the key, so a phone that signs into a
-- different account moves to that account instead of notifying both.
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "Users read own push tokens" on public.push_tokens;
create policy "Users read own push tokens"
  on public.push_tokens for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.push_tokens from anon, authenticated;
grant select on public.push_tokens to authenticated;

-- When each receipt last sent a Pay me. One row per receipt.
create table if not exists public.pay_me_nudges (
  receipt_id uuid primary key references public.receipts (id) on delete cascade,
  last_sent_at timestamptz not null default now()
);

alter table public.pay_me_nudges enable row level security;

drop policy if exists "Members read pay me nudges" on public.pay_me_nudges;
create policy "Members read pay me nudges"
  on public.pay_me_nudges for select
  to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = pay_me_nudges.receipt_id
        and public.is_group_member(r.group_id)
    )
  );

revoke all on public.pay_me_nudges from anon, authenticated;
grant select on public.pay_me_nudges to authenticated;

-- RPC: register_push_token(p_token text, p_platform text)
create or replace function public.register_push_token(p_token text, p_platform text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := trim(coalesce(p_token, ''));
begin
  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_SIGNED_IN',
      'message', 'Please sign in and try again.'
    );
  end if;

  if length(v_token) > 255
    or v_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$'
    or p_platform is null
    or p_platform not in ('ios', 'android') then
    return jsonb_build_object(
      'success', false,
      'error', 'INVALID_TOKEN',
      'message', 'That isn''t a valid push token.'
    );
  end if;

  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (v_token, v_user_id, p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = excluded.updated_at;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- RPC: unregister_push_token(p_token text)
create or replace function public.unregister_push_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_SIGNED_IN',
      'message', 'Please sign in and try again.'
    );
  end if;

  delete from public.push_tokens
  where token = trim(coalesce(p_token, '')) and user_id = auth.uid();

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated;

-- RPC: start_pay_me(p_receipt_id text, p_user_id uuid)
-- Called only by the send-pay-me Edge Function (service role), which has
-- already verified p_user_id from the caller's JWT. Returns push tokens, so
-- app clients must never be able to run it.
create or replace function public.start_pay_me(p_receipt_id text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
  v_receipt public.receipts%rowtype;
  v_owing_count integer;
  v_recipients jsonb;
  v_sent_at timestamptz;
  v_last_sent_at timestamptz;
  v_uploader_name text;
begin
  if p_user_id is null then
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

  select * into v_receipt from public.receipts where id = v_receipt_id;

  if not found or not (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = v_receipt.group_id and gm.user_id = p_user_id
    ) or exists (
      select 1 from public.groups g
      where g.id = v_receipt.group_id and g.created_by = p_user_id
    )
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_FOUND',
      'message', 'Receipt not found.'
    );
  end if;

  if v_receipt.created_by <> p_user_id then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_UPLOADER',
      'message', 'Only the person who uploaded this receipt can send a Pay me.'
    );
  end if;

  if v_receipt.status <> 'finalized' then
    return jsonb_build_object(
      'success', false,
      'error', 'NOT_FINALIZED',
      'message', 'Finalize this receipt before asking people to pay.'
    );
  end if;

  -- Who still owes: current members with a claim on an item over $0, other
  -- than the uploader, whose share isn't marked paid or confirmed (US 3.4).
  -- not_received still owes. Guests have no account, so no phone.
  with owing as (
    select distinct c.user_id
    from public.item_claims c
    join public.receipt_items i on i.id = c.item_id
    where i.receipt_id = v_receipt_id
      and c.user_id is not null
      and c.user_id <> v_receipt.created_by
      and i.amount_cents > 0
      and exists (
        select 1 from public.group_members gm
        where gm.group_id = v_receipt.group_id and gm.user_id = c.user_id
      )
      and not exists (
        select 1 from public.receipt_payments p
        where p.receipt_id = v_receipt_id
          and p.payer_key = c.user_id::text
          and p.state in ('paid', 'confirmed')
      )
  )
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', o.user_id,
          'tokens', coalesce(
            (select jsonb_agg(t.token order by t.token)
             from public.push_tokens t
             where t.user_id = o.user_id),
            '[]'::jsonb
          )
        )
        order by o.user_id
      ),
      '[]'::jsonb
    )
  into v_owing_count, v_recipients
  from owing o;

  if v_owing_count = 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'NOBODY_OWES',
      'message', 'Everyone has paid.'
    );
  end if;

  -- Claim the cooldown atomically: only one Pay me per receipt per hour,
  -- even if two taps arrive at once.
  insert into public.pay_me_nudges as n (receipt_id, last_sent_at)
  values (v_receipt_id, now())
  on conflict (receipt_id) do update
    set last_sent_at = excluded.last_sent_at
    where n.last_sent_at <= now() - interval '1 hour'
  returning n.last_sent_at into v_sent_at;

  if v_sent_at is null then
    select last_sent_at into v_last_sent_at
    from public.pay_me_nudges
    where receipt_id = v_receipt_id;

    return jsonb_build_object(
      'success', false,
      'error', 'COOLDOWN',
      'message', 'You can only send a Pay me once an hour.',
      'last_sent_at', v_last_sent_at,
      'retry_after_seconds', greatest(
        1,
        ceil(extract(epoch from (v_last_sent_at + interval '1 hour' - now())))
      )::integer
    );
  end if;

  select nullif(trim(display_name), '') into v_uploader_name
  from public.profiles
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'receipt_id', v_receipt_id,
    'receipt_title', v_receipt.title,
    'uploader_name', coalesce(v_uploader_name, 'Someone'),
    'sent_at', v_sent_at,
    'owing_count', v_owing_count,
    'recipients', v_recipients
  );
end;
$$;

revoke execute on function public.start_pay_me(text, uuid) from public, anon, authenticated;
grant execute on function public.start_pay_me(text, uuid) to service_role;

commit;

notify pgrst, 'reload schema';
