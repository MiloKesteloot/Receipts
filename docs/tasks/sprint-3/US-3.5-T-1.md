---
id: US-3.5-T-1
story: US-3.5
sprint: 3
assignee: Milo Kesteloot
estimate_hours: 12
---

# Send Pay me push notifications to members who haven't paid, at most once an hour

## Description
Serves User Story 3.5 (Push and Pay me). On a finalized receipt, the uploader can tap "Pay me" to send a push notification to every member who still owes them. A receipt can be nudged at most once an hour: a second tap within the hour sends nothing and shows a countdown instead. "Already paid" uses US 3.4's payment states: members whose share is marked paid or confirmed get nothing, and neither do the uploader, guests, or members whose share is $0. This task covers registering each device's Expo push token, the one-hour cooldown and sending on the server (`send-pay-me` Edge Function), the Pay me card and countdown on the receipt screen, and opening the receipt when the notification is tapped. Recording and confirming payments (US 3.4), reminders on a schedule, and nudging guests are out of scope.

## Specs
- Migration `supabase/migrations/20261119_pay_me.sql` (mirrored in `supabase/setup.sql`, safe to run more than once, run after `20261118_receipt_payments.sql`):
  - `push_tokens` (`token text primary key`, `user_id uuid` → `auth.users`, `platform text` `'ios'` or `'android'`, `updated_at timestamptz`). RLS: users can read only their own rows; no direct writes.
  - `pay_me_nudges` (`receipt_id uuid primary key`, `last_sent_at timestamptz`). RLS: members of the receipt's group can read; no direct writes.
  - `register_push_token(p_token text, p_platform text)` and `unregister_push_token(p_token text)` (security definer, `authenticated`). Registering a token that belongs to another account moves it to the caller, so a shared phone only gets the signed-in user's pushes.
  - `start_pay_me(p_receipt_id text, p_user_id uuid)` (security definer, executable only by `service_role`):
    - Checks the receipt exists, the user is a member of its group and its uploader, and the receipt is finalized.
    - Works out who still owes: current group members with a member claim on an item over $0, minus the uploader and anyone whose `receipt_payments` row (US 3.4) is `'paid'` or `'confirmed'`. Shares marked `'not_received'` still owe.
    - With nobody owing it returns `NOBODY_OWES` without starting a cooldown.
    - Otherwise it claims the cooldown atomically (`insert ... on conflict do update ... where last_sent_at <= now() - interval '1 hour'`). If the last Pay me was under an hour ago it returns `COOLDOWN` with `retry_after_seconds`.
    - On success it returns `{ success: true, receipt_title, uploader_name, owing_count, recipients: [{ user_id, tokens }] }`.
- Edge Function `supabase/functions/send-pay-me` (`index.ts` wiring plus pure, testable logic in `pay-me.ts`), body `{ receiptId }`:
  - Verifies the caller's JWT, then calls `start_pay_me` with the service role.
  - Sends one Expo push per registered device (`https://exp.host/--/api/v2/push/send`, batches of at most 100):
    - title `"<uploader> says: Pay me"`
    - body `Settle up for "<receipt title>".`
    - `channelId: "pay-me"`, `sound: "default"`, and `data: { receiptId, url: "/receipts/<id>" }`
  - Deletes tokens whose ticket says `DeviceNotRegistered`. If Expo can't be reached at all, clears the cooldown so the uploader can try again.
  - Returns `{ status: "sent", notifiedCount, owingCount }`, `{ status: "cooldown", retryAfterSeconds }`, `{ status: "nobody_owes" }`, or `{ status: "error", error, message }`.
- `src/lib/pay-me.ts`:
  - `sendPayMe(receiptId, options?)` invokes `send-pay-me` and returns a `PayMeResult` matching the function's answers. Request failures and malformed answers return `NETWORK_ERROR`. It never throws.
  - `loadLastPayMe(receiptId, options?)` reads when the receipt's last Pay me went out.
  - `countNudgeable(settlement)` counts member shares (not guests) whose US 3.4 status is `"unpaid"` or `"not_received"`.
  - `cooldownSecondsLeft(lastSentAt, now)` and `formatCooldown(seconds)` (e.g. `3725` → `"1:02:05"`, `95` → `"1:35"`).
- `src/lib/push-registration.ts` has the injectable registration logic. `src/lib/push-notifications.native.ts` wires it to `expo-notifications` and `expo-device`; `src/lib/push-notifications.ts` is the web no-op.
  - `usePushNotifications(userId)`, used in `src/app/(app)/_layout.tsx`, works like this on a physical device:
    - Creates the Android `pay-me` channel before asking permission.
    - Requests permission and registers the Expo push token for the signed-in user.
    - Simulators, web, a denied permission, or a missing EAS `projectId` skip registration without an error.
  - Tapping a notification with `data.receiptId` opens `/receipts/<id>`. This includes the notification that launched the app.
  - Signing out unregisters this device's token first.
- `app.json` adds the `expo-notifications` config plugin. `expo-notifications` is installed with `npx expo install`.
- Receipt screen (`src/app/(app)/(home)/receipts/[id].tsx`): on a finalized receipt that isn't settled, the uploader sees a new `PayMeCard` (`src/components/pay-me-card.tsx`) below `PaymentsCard`.
  - The card shows a "Pay me" button and how many people still owe.
  - A sent Pay me shows a toast like `"Sent a Pay me to 2 people."`, or says that none of them have notifications turned on.
  - Within an hour of the last Pay me, the button is replaced by a ticking `"Pay me again in 59:12"` countdown, and the button returns when it reaches zero. This applies whether the last Pay me was known when the screen loaded or came back as a `cooldown` answer.
  - When nobody can be nudged (everyone left has marked their share paid, or is a guest), the card says so and has no button.
  - Other members, and settled receipts, show no Pay me card.

## Requirements
- Enforce every rule (uploader only, finalized only, who owes, one Pay me per receipt per hour) on the server, not just in the client. Push tokens are never returned to app clients.
- Reuse US 3.4's `receipt_payments` table and settlement statuses for "already paid"; don't add a second record of who has paid.
- Expo Go and web must keep working: push registration is skipped where it isn't supported, and receiving remote pushes needs a development build.
- Network code takes an injected client so unit tests run without network access, matching `src/lib/payments.ts`.
- Must pass `npx expo lint`, `npx eslint .` (the GitHub lint job), `npx tsc --noEmit`, and `npm test` with zero errors.

## Acceptance criteria
1. On a physical iOS or Android device, a signed-in user is asked for notification permission and their Expo push token is registered. On Android the `pay-me` channel is created first. Simulators, web, denied permission and a missing project id skip registration without an error, and signing out unregisters the token.
2. On a finalized, unsettled receipt, the uploader sees a "Pay me" button and other members do not. Tapping it calls `send-pay-me` with the receipt id and shows how many people were notified.
3. `send-pay-me` sends a push to every registered device of members who still owe. It sends nothing to the uploader, to members whose share is marked paid or confirmed, or to guests. Tokens Expo reports as `DeviceNotRegistered` are deleted.
4. A second Pay me within an hour sends nothing and returns `retryAfterSeconds`. The receipt screen then shows a ticking "Pay me again in m:ss" countdown instead of the button, and the button comes back when it reaches zero.
5. When every member share left is marked paid or confirmed, the uploader's Pay me card says nobody can be nudged and has no button, and a settled receipt shows no Pay me card.
6. Tapping a Pay me notification opens that receipt's screen.
7. The migration defines the push token and cooldown tables with RLS, `start_pay_me` with uploader, finalized and already-paid checks and the atomic one-hour cooldown, and allows only `service_role` to run `start_pay_me`.
