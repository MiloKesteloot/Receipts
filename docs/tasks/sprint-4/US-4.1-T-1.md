---
id: US-4.1-T-1
story: US-4.1
sprint: 4
assignee: Daniel Klos
estimate_hours: 5
---

# Add the Stats tab with a group selector and a spending-over-time graph

## Description
Serves User Story 4.1 (Group Spending Analytics): "As a member, I want to see where my group's money goes, so that I can track spending and identify purchasing trends." The Stats tab (`src/app/(app)/stats.tsx`) is currently a placeholder. This task replaces it with a real screen: a group selector, a card layout, and one shared backend fetch of the chosen group's receipt data (`src/lib/group-stats.ts`), plus the first card, a line graph of money spent over time. Receipts have no separate purchase date, so a receipt's date is its `created_at`. The spending-trends and most-purchased cards (`US-4.1-T-2`) and the category and store cards (`US-4.1-T-3`) are out of scope, but they will reuse the fetch from this task.

## Specs
- The Stats tab loads the signed-in user's groups (`loadGroupList` from `src/lib/group-data.ts`) and shows them as a row of selectable chips. The first group (by name) is selected by default; tapping another chip selects it and loads that group's data.
  - With no groups, the screen shows `"Join or create a group to see its stats."` instead of the chips and cards.
  - If the group list fails to load, the screen shows the error and a `"Try again"` button.
- `loadGroupStats(groupId, { client })` in `src/lib/group-stats.ts` reads the group's receipts (`id, title, total_cents, tax_cents, tip_cents, status, created_at`) and their `receipt_items` (`id, receipt_id, name, amount_cents`) from Supabase, and returns `{ status: "ok", stats }` or `{ status: "error", message }`. Only `submitted` and `finalized` receipts count; drafts are left out. A missing Supabase client returns the `NOT_CONFIGURED` message.
- `buildSpendingOverTime(receipts)` adds up receipt totals per calendar day (local time) and returns the points sorted oldest first.
- The `"Spending over time"` card shows a line graph (drawn with `react-native-svg`) with one point per receipt date. The y-axis is labeled `"money spent"` and the x-axis is labeled `"receipt date"`. The card shows the group's total spent, and tapping a point shows that date and amount above the graph.
  - With no posted receipts, the card shows `"No receipts yet."` instead of the graph.
  - While the group's data loads, the card area shows a spinner; if it fails, it shows the error with a `"Try again"` button.
- The data reloads when the Stats tab comes back into focus.

## Requirements
- Keep data loading and the per-day math in `src/lib/group-stats.ts`, with an injectable client so it can be unit tested without Supabase.
- Keep the chart and card components presentational and outside `src/app/`.
- Use the app palette (`src/lib/palette.ts`) and leave room for the bottom tab bar (`BOTTOM_TAB_CLEARANCE`).
- Do not add a charting dependency; draw the graph with the existing `react-native-svg`.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` (both `test:unit` and `test:ui`) with zero errors.

## Acceptance criteria
1. The Stats tab lists the user's groups as chips with the first one selected, and selecting another group loads that group's stats; a user with no groups sees the empty message.
2. `loadGroupStats` returns the chosen group's submitted and finalized receipts with their items, leaves out drafts, and returns an error message when Supabase fails or is not configured.
3. `buildSpendingOverTime` returns one point per receipt date, oldest first, with same-day receipts added together.
4. The spending-over-time card shows a graph with the y-axis labeled "money spent" and the x-axis labeled "receipt date", plus the group's total spent; a group with no receipts shows "No receipts yet."
