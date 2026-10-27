-- Migration: Guest claim tokens and public claim RPCs (User Story 2.5)
-- Allows anonymous guests to view receipts and claim items via a secure share token.

-- 1. Table for guest share tokens
create table if not exists public.receipt_guest_tokens (
  id uuid primary key default gen_random_uuid(),
  receipt_id text not null,
  token text unique not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz default null
);

create index if not exists idx_receipt_guest_tokens_token on public.receipt_guest_tokens(token);
create index if not exists idx_receipt_guest_tokens_receipt_id on public.receipt_guest_tokens(receipt_id);

-- 2. Receipt items table (if not already created)
create table if not exists public.receipt_items (
  id text primary key default gen_random_uuid()::text,
  receipt_id text not null,
  name text not null,
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_receipt_items_receipt_id on public.receipt_items(receipt_id);

-- 3. Item claims table (supporting registered members and guest names)
create table if not exists public.item_claims (
  id text primary key default gen_random_uuid()::text,
  item_id text not null references public.receipt_items(id) on delete cascade,
  receipt_id text not null,
  user_id uuid default null,
  guest_name text default null,
  created_at timestamptz not null default now(),
  constraint chk_claimant_present check (
    (user_id is not null) or (guest_name is not null and length(trim(guest_name)) > 0)
  )
);

create index if not exists idx_item_claims_item_id on public.item_claims(item_id);
create index if not exists idx_item_claims_receipt_id on public.item_claims(receipt_id);

-- Prevent duplicate claims on same item by same user or same guest
create unique index if not exists idx_item_claims_user_unique
  on public.item_claims(item_id, user_id)
  where user_id is not null;

create unique index if not exists idx_item_claims_guest_unique
  on public.item_claims(item_id, guest_name)
  where guest_name is not null;

-- Enable Row Level Security
alter table public.receipt_guest_tokens enable row level security;
alter table public.receipt_items enable row level security;
alter table public.item_claims enable row level security;

-- Policy: Allow reading tokens that are not expired
drop policy if exists "Anyone can read valid guest tokens" on public.receipt_guest_tokens;
create policy "Anyone can read valid guest tokens"
  on public.receipt_guest_tokens for select
  to anon, authenticated
  using (expires_at is null or expires_at > now());

-- Policy: Allow public read of receipt items given a valid token
drop policy if exists "Public read receipt items with valid token" on public.receipt_items;
create policy "Public read receipt items with valid token"
  on public.receipt_items for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.receipt_guest_tokens t
      where t.receipt_id = receipt_items.receipt_id
        and (t.expires_at is null or t.expires_at > now())
    )
  );

-- Policy: Allow public read of item claims given a valid token
drop policy if exists "Public read item claims with valid token" on public.item_claims;
create policy "Public read item claims with valid token"
  on public.item_claims for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.receipt_guest_tokens t
      where t.receipt_id = item_claims.receipt_id
        and (t.expires_at is null or t.expires_at > now())
    )
  );

-- Function: get_receipt_by_guest_token(p_token text)
-- Returns receipt info, items, and claims for anonymous guest access.
create or replace function public.get_receipt_by_guest_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token_rec record;
  v_receipt record;
  v_items jsonb;
begin
  -- Validate token
  select * into v_token_rec
  from public.receipt_guest_tokens
  where token = p_token
    and (expires_at is null or expires_at > now());

  if not found then
    return null;
  end if;

  -- Fetch receipt
  select id, title, total_cents, created_at
  into v_receipt
  from public.receipts
  where id = v_token_rec.receipt_id;

  -- If receipts table doesn't have it, try default object
  if not found then
    v_receipt := row(v_token_rec.receipt_id, 'Receipt', 0, v_token_rec.created_at);
  end if;

  -- Fetch items with all claimant information (both users and guests)
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
                'display_name', coalesce(c.guest_name, u.raw_user_meta_data->>'display_name', 'Member')
              )
            )
            from public.item_claims c
            left join auth.users u on u.id = c.user_id
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

-- Function: claim_item_as_guest(p_token text, p_item_id text, p_guest_name text, p_claimed boolean default true)
-- Safely inserts or removes a guest claim without requiring Supabase auth.
create or replace function public.claim_item_as_guest(
  p_token text,
  p_item_id text,
  p_guest_name text,
  p_claimed boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token_rec record;
  v_item record;
  v_trimmed_name text;
begin
  -- Validate guest name
  v_trimmed_name := trim(coalesce(p_guest_name, ''));
  if length(v_trimmed_name) = 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'EMPTY_NAME',
      'message', 'Please enter a name before claiming items.'
    );
  end if;

  -- Validate token
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

  -- Verify item exists and belongs to the receipt
  select * into v_item
  from public.receipt_items
  where id = p_item_id and receipt_id = v_token_rec.receipt_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'ITEM_NOT_FOUND',
      'message', 'The requested item was not found on this receipt.'
    );
  end if;

  if p_claimed then
    -- Insert guest claim, avoiding duplicates
    insert into public.item_claims (item_id, receipt_id, guest_name)
    values (p_item_id, v_token_rec.receipt_id, v_trimmed_name)
    on conflict (item_id, guest_name) do nothing;
  else
    -- Unclaim item
    delete from public.item_claims
    where item_id = p_item_id
      and guest_name = v_trimmed_name;
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
