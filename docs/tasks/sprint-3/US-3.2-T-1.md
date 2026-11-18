---
id: US-3.2-T-1
story: US-3.2
sprint: 3
assignee: Alex Kirkman
estimate_hours: 5
---

# Let group owners remove members from their group

## Description
Serves User Story 3.2 (Remove a member): "As a group owner, I want to remove someone from my group, so that people I no longer split costs with are gone." This task adds an owner-only "Remove members" button to the group screen (`src/app/(app)/(home)/groups/[id].tsx`), a picker that lists the groups the user owns (`src/app/(app)/(home)/remove-members/index.tsx`), and a member checklist where the owner selects members, confirms, and removes them (`src/app/(app)/(home)/remove-members/[groupId].tsx`). Removal goes through the existing `remove_group_member` RPC in `supabase/setup.sql`, which re-checks ownership on the server. The data logic lives in `src/lib/group-members.ts` and the cross-platform confirm dialog in `src/lib/confirm-action.ts`. Leaving or deleting a group (US-2.4), transferring ownership, and deleting a removed member's existing item claims are out of scope.

## Specs
- `isGroupOwner(detail, currentUserId): boolean` in `src/lib/group-members.ts` returns `true` only when the user is known and either their member row has role `"owner"` or `group.created_by` equals their id. Every screen uses it, so the owner rule lives in one place.
- `removableMembers(members, currentUserId)` returns every member except the current user and anyone with role `"owner"`, in their original order.
- `loadOwnedGroups(userId, opts)` queries `groups` with `.select("id, name").eq("created_by", userId).order("name")` and returns `{ status: "ok", groups }` or `{ status: "error", message }`. A missing user returns `SIGNED_OUT_MESSAGE` without sending a query.
- `removeGroupMembers(groupId, userIds, currentUserId, opts)` calls the `remove_group_member` RPC (`p_group_id`, `p_target_user_id`) once per user, sequentially, and never throws. It returns `{ removed: string[], failed: { userId, message }[] }`:
  - The caller's own id and any owner id are never sent to the RPC; they come back in `failed` with `CANNOT_REMOVE_SELF_MESSAGE` / `CANNOT_REMOVE_OWNER_MESSAGE`.
  - An RPC `error`, a reply without `success: true`, or a thrown network error fails only that user and keeps the server's message.
  - It never falls back to deleting from `group_members` directly.
- `confirmAction(title, message, confirmLabel): Promise<boolean>` in `src/lib/confirm-action.ts` uses `Alert.alert` with Cancel / destructive buttons on native and `window.confirm` on web.
- Group screen: owners see a "Remove members" pill in the Members header that opens `remove-members?from=<groupId>`; non-owners never see it. The screen reloads on focus and on pull-to-refresh, and subscribes to `group_members` changes for the group over Supabase Realtime.
- Picker (`remove-members/index.tsx`): one card listing the groups from `loadOwnedGroups`, each a pressable row with an initial tile, name and chevron. The group from the `from` param is listed first with a "Current" pill. Shows a loading state, an error with "Try again", and "You don't own any groups yet." when empty.
- Checklist (`remove-members/[groupId].tsx`): lists every member; the owner row shows an "Owner" pill and no checkbox; every member from `removableMembers` gets a checkbox row (`accessibilityRole="checkbox"`). A "Remove (n)" button is disabled at 0 selected and while a removal is in flight (a ref blocks double taps). Pressing it asks `confirmAction` first; on success it shows "Removed <name>" or "Removed N members" and reloads; on failure it shows an error toast naming who failed and keeps them selected. Non-owners, including someone who opens the URL directly, see "Only the group owner can remove members." and nothing actionable. Shows "No one else is in this group yet." when there is no one to remove.

## Requirements
- Only the group owner can remove members. This is enforced in the UI (button hidden, picker limited to owned groups, checklist locked for non-owners) and on the server (`remove_group_member` checks the caller's owner role; `group_members` delete RLS only allows your own row or rows in a group you created).
- The owner can never select or remove themselves or another owner.
- No new dependencies and no changes to `src/lib/groups.ts`.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` with zero errors.

## Acceptance criteria
1. On the group screen, the owner sees a "Remove members" button that opens the picker for that group; a regular member does not see the button, and it is not shown while the group is loading.
2. The picker lists only groups the user owns, sorted by name, with the current group first; selecting one opens its member checklist.
3. The checklist shows a checkbox next to every member except the owner, and the Remove button is disabled until at least one member is selected.
4. After the owner confirms, every selected member is removed through `remove_group_member` (one call per member) and disappears from the list; cancelling the confirm removes no one.
5. A non-owner (including one who opens the checklist URL directly) sees "Only the group owner can remove members." with no checkboxes or Remove button, and the caller or an owner is never sent to the RPC.
6. If the server refuses a removal, an error toast shows the server's message and the member stays in the list.
7. A removed member loses access to the group on their own device: reopening or refreshing the group shows that they're not a member, and the group no longer appears on their Home list.
