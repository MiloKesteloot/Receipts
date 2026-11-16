---
id: US-3.1-T-2
story: US-3.1
sprint: 3
assignee: Kellar McLaughlin
estimate_hours: 5
---

# Render Home overview greeting, balance summary card, and enriched group cards

## Description
Serves User Story 3.1 (Home overview). This task wires `loadHomeOverview` from `src/lib/home-overview.ts` into the Home screen (`src/app/(app)/(home)/index.tsx`) and adds reusable overview UI cards (`src/components/home-overview-cards.tsx`) showing a personalized name greeting, a balance summary card ("Owed to me" and "I owe"), and per-group cards displaying member counts and latest submitted receipts. Data-loading and balance calculation internals (`US-3.1-T-1`) are out of scope.

## Specs
- `HomeBalanceCard` in `src/components/home-overview-cards.tsx` displays two currency totals formatted with `formatCents`: `"Owed to me"` (`owedToMeCents`) and `"I owe"` (`iOweCents`).
- `HomeGroupCard` in `src/components/home-overview-cards.tsx` renders the group's pastel initial tile, name, member count label (`"1 member"` vs `"N members"`), latest submitted receipt summary (`title` and formatted amount) or `"No receipts yet"` when `latestReceipt` is `null`, and navigates to `/groups/[id]` on press.
- `Index` in `src/app/(app)/(home)/index.tsx` calls `loadHomeOverview` on initial mount, focus, pull-to-refresh, and post-create/join refresh instead of querying `groups` directly or reading `mockGroups`:
  - Renders `"Hi, <displayName>"` using the resolved `overview.displayName` in the screen header alongside `NewGroupButton`.
  - Renders `HomeBalanceCard` above the groups list, even when the user belongs to zero groups (keeping `"You're not in any groups yet."` as the empty group list state).
  - Shows a loading indicator on initial fetch, an error message with `"Try again"` retry button on `{ status: "error" }`, and preserves `JoinGroupModal`, `CreateGroupForm`, toast notifications, and `removedGroupId` immediate filtering.

## Requirements
- Keep presentational card components (`HomeBalanceCard`, `HomeGroupCard`, `formatMemberCount`) in `src/components/home-overview-cards.tsx` outside `src/app/`.
- Reuse `formatCents` from `src/lib/receipt-form.ts`, `PALETTE` / `palette` from `src/lib/palette.ts`, and `BOTTOM_TAB_CLEARANCE` from `src/components/bottom-tab-bar.tsx`.
- Do not rely on `src/lib/mock.ts` or add new `USE_MOCK` branches in the Home overview UI.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` (both `test:unit` and `test:ui`) with zero errors.

## Acceptance criteria
1. Home displays a personalized greeting (`"Hi, <displayName>"`) using the display name returned by `loadHomeOverview`.
2. Home displays a balance summary card showing formatted `"Owed to me"` and `"I owe"` amounts in dollars and cents.
3. Each group card displays the group name, singular/plural member count, and the latest submitted receipt's title and formatted amount (or `"No receipts yet"` when absent).
4. When the user has no groups, Home still shows the greeting and `$0.00` balance card alongside the empty groups state, and pressing a populated group card navigates to `/groups/[id]`.
5. On load failure, Home shows the error message and retries `loadHomeOverview` when pressing `"Try again"`, and creating or joining a group triggers an overview refresh without overwriting state with mock data.
