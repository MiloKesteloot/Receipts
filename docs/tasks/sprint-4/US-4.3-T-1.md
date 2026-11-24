---
id: US-4.3-T-1
story: US-4.3
sprint: 4
assignee: Kellar McLaughlin
estimate_hours: 2
---

# Build delete user account database RPC and account deletion service

## Description
Serves User Story 4.3 (Delete my account): "As a user, I want to delete my account from inside the app, so that my data is gone when I stop using it." This task implements the server-side deletion logic via a Supabase migration `supabase/migrations/20261124_delete_account.sql` (mirrored in `supabase/setup.sql`) providing the `delete_user_account()` RPC, and the client data service in `src/lib/account.ts` with unit tests in `tests/unit/account-deletion.test.ts`. When a user deletes their account, groups they own are permanently deleted (along with cascading receipts, items, claims, and guest tokens), their membership in other groups is revoked, their profile is deleted, their push tokens are deleted, and their past item claims in other groups are anonymized to "Deleted user" so roommates' splits and balances remain intact without referencing the deleted user. Client-side profile UI confirmation modals and receipt screen badge integration (`US-4.3-T-2`) are out of scope.

## Specs
- Migration `supabase/migrations/20261124_delete_account.sql` (mirrored in `supabase/setup.sql`, safe to re-run):
  - Adds `public.delete_user_account()` RPC (`security definer`, `returns jsonb`, granted to `authenticated`):
    - Rejects unauthenticated callers (`auth.uid() is null`) with SQLSTATE `42501` (`"Sign in to delete your account"`).
    - In a single atomic transaction:
      1. Identifies all groups owned by the user (`created_by = auth.uid()` or role = `'owner'`).
      2. Deletes all data for those owned groups: `item_claims`, `receipt_items`, `receipt_guest_tokens`, `receipt_payments`, `pay_me_nudges`, `receipts`, `group_members`, and `groups` (matching `delete_group` cascade logic).
      3. For other groups where the user is a non-owner member:
         - Updates existing claims in `public.item_claims` where `user_id = auth.uid()`: sets `user_id = null` and `guest_name = 'Deleted user'`, preserving the claim row so roommates' splits and balances stay correct while removing personal association and satisfying `chk_claimant_present`.
         - Removes the user's membership row from `public.group_members` (`where user_id = auth.uid()`).
      4. Deletes the user's row from `public.profiles` (`where id = auth.uid()`).
      5. Deletes push tokens from `public.push_tokens` (`where user_id = auth.uid()`).
      6. Deletes the user from `auth.users` (`where id = auth.uid()`).
      7. Returns `{ success: true, message: "Account deleted successfully" }`.
- `deleteAccount(options?: DeleteAccountOptions): Promise<DeleteAccountResult>` in `src/lib/account.ts`:
  - Accepts optional `client` (`AccountClient`, defaulting to `SUPABASE` in `src/lib/supabase.ts`).
  - Returns `{ success: false, error: "NOT_CONFIGURED", message: NOT_CONFIGURED }` when `options.client` is null or undefined.
  - Calls `client.rpc("delete_user_account")`.
  - Maps SQLSTATE `42501` to `{ success: false, error: "NOT_SIGNED_IN", message: "Please sign in to delete your account" }`.
  - Handles server RPC failure payloads `{ success: false, error, message }` and thrown network errors gracefully.
  - On `{ success: true }`, invokes `client.auth.signOut()` to clear local session storage and tokens before returning `{ success: true, message: "Account deleted successfully" }`.
- Types in `src/lib/account.ts`:
  - `AccountClient`: minimal interface picking `rpc` and `auth.signOut`.
  - `DeleteAccountErrorCode = "NOT_CONFIGURED" | "NOT_SIGNED_IN" | "NETWORK_ERROR" | "DELETE_FAILED"`.
  - `DeleteAccountResult`: discriminated union `{ success: true; message: string } | { success: false; error: DeleteAccountErrorCode; message: string }`.

## Requirements
- All database modifications during account deletion must run inside a single atomic transaction within the `delete_user_account` RPC so partial deletions never occur.
- Groups owned by the user must be completely purged along with their child tables (receipts, items, claims, tokens, payments).
- Roommates' balances must not be broken: claims in other groups must be retained under `guest_name = 'Deleted user'` with `user_id = null`.
- The client function must never throw; all error states must return typed failure objects.
- Unit tests must use mock client injection without requiring network access or live Supabase instances.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` with zero errors.

## Acceptance criteria
1. `deleteAccount` returns `NOT_CONFIGURED` error when no Supabase client is available.
2. `deleteAccount` returns `NOT_SIGNED_IN` error when caller is unauthenticated (SQLSTATE 42501).
3. `deleteAccount` calls `delete_user_account` RPC and invokes `client.auth.signOut()` upon successful deletion.
4. `deleteAccount` propagates server and network error messages cleanly without throwing.
5. `delete_user_account` RPC removes all groups owned by the user and their associated receipts, items, claims, and memberships.
6. `delete_user_account` RPC removes the user's profile and memberships in other groups while updating their past claims to `guest_name = 'Deleted user'` with `user_id = null`.
