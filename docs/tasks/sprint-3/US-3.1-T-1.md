---
id: US-3.1-T-1
story: US-3.1
sprint: 3
assignee: Kellar McLaughlin
estimate_hours: 5
---

# Build Home overview data loader and balance calculator

## Description
Serves User Story 3.1 (Home overview). This task implements the data-loading and calculation module in `src/lib/home-overview.ts` that resolves the signed-in user's greeting name, builds per-group overview summaries (member count and latest submitted receipt), and computes total amounts owed to the user and owed by the user across submitted group receipts. Home screen UI rendering and navigation integration (`US-3.1-T-2`) are out of scope.

## Specs
- `resolveDisplayName(input: UserIdentityInput): string` in `src/lib/home-overview.ts` resolves the user's greeting name by choosing the first non-empty trimmed value in priority order: `fullName`, `name`, `profileDisplayName`, the local part of `email` before `@`, or `"there"` when none are present.
- `buildGroupOverviewCards(groups, members, receipts): HomeGroupSummary[]` returns one card model per group sorted alphabetically by group name, each containing `{ id, name, memberCount, latestReceipt }`.
  - `memberCount` counts unique `user_id` values belonging to that group.
  - `latestReceipt` selects the newest receipt with `status === "submitted"` ordered by `created_at` descending (breaking ties deterministically by `id` descending), mapping `{ id, title, totalCents, createdAt }`, or `null` when the group has no submitted receipts.
- `calculateUserBalances(currentUserId, receipts, items, claims): HomeBalanceSummary` returns `{ owedToMeCents, iOweCents }` across receipts with `status === "submitted"` only (ignoring drafts), splitting each item's `amount_cents` with `splitCents` from `src/lib/claims.ts`:
  - When `receipt.created_by === currentUserId`, shares belonging to other group members and guests (`guest_name` keyed with `guestClaimKey`) are added to `owedToMeCents`; the payer's own claim share on that receipt is excluded.
  - When `receipt.created_by !== currentUserId`, the share belonging to `currentUserId` is added to `iOweCents`.
  - Unclaimed items contribute `0`, and items with invalid `amount_cents` are skipped without throwing.
- `loadHomeOverview(options?: HomeOverviewOptions): Promise<HomeOverviewResult>` queries `groups`, `profiles`, `group_members`, `receipts`, `receipt_items`, and `item_claims` using an injected `HomeOverviewClient` (defaulting to `SUPABASE` in `src/lib/supabase.ts`) and optional `user` identity, returning `{ status: "ok", overview }` or `{ status: "error", message }`.
  - When `options.client` is null or undefined, returns `{ status: "error", message: NOT_CONFIGURED }`.
  - When no user ID is provided and `client.auth.getUser()` returns no user, returns `{ status: "error", message: "Please sign in to view your overview." }`.
  - When the user belongs to zero groups, returns empty `groups: []` and zeroed balances without querying group details.

## Requirements
- Keep pure calculation functions (`resolveDisplayName`, `buildGroupOverviewCards`, `calculateUserBalances`) decoupled from Supabase queries so logic is deterministic and testable without network access.
- Reuse `splitCents`, `guestClaimKey`, and `toWholeCents` from `src/lib/claims.ts` and `NOT_CONFIGURED` from `src/lib/group-data.ts` rather than duplicating split math or configuration messages.
- Do not rely on `src/lib/mock.ts` or add new `USE_MOCK` branches; unit tests must use an injected `HomeOverviewClient`.
- Treat `receipts.created_by` as the receipt payer and exclude `draft` receipts from both balances and latest-receipt summaries.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` with zero errors.

## Acceptance criteria
1. `resolveDisplayName` prioritizes `fullName`, then `name`, then `profileDisplayName`, then the email prefix before `@`, falling back to `"there"` when all fields are blank or missing.
2. `buildGroupOverviewCards` calculates unique `memberCount` per group and chooses the latest `submitted` receipt (ignoring `draft` receipts), returning `latestReceipt: null` when none exist.
3. `calculateUserBalances` uses `splitCents` exact-cent allocation on `submitted` receipts so `owedToMeCents` includes other members' and guests' shares on receipts paid by the current user (excluding the payer's own share) and excludes draft receipts.
4. `calculateUserBalances` sums the current user's claimed shares on `submitted` receipts paid by other users into `iOweCents`, while ignoring unclaimed items and invalid item amounts safely.
5. `loadHomeOverview` returns `NOT_CONFIGURED` when no client is available, returns an auth error when signed out, short-circuits cleanly with empty groups and zero balances when the user has no groups, and propagates query/network errors cleanly.
