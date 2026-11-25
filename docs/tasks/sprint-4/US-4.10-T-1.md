---
id: US-4.10-T-1
story: US-4.10
sprint: 4
assignee: Milo Kesteloot
estimate_hours: 4
---

# Add Forgot password: email a reset link and choose a new password

## Description
Serves User Story 4.10 (Forgot password). On the sign-in screen, a user who forgot their password taps "Forgot password?", enters their email, and Supabase Auth emails them a password reset link. Opening the link on the same device signs them in for the reset and shows a "Choose a new password" screen. Saving a new password takes them into the app; cancelling signs them out. This task covers the whole story: the reset request, detecting the recovery link, the new-password screen, and the route guard change that keeps the user on that screen until they finish. Custom email templates, a custom SMTP provider, and changing the password from the Account tab are out of scope.

## Specs
- `src/lib/auth.ts`:
  - `AuthClient` also picks `resetPasswordForEmail`.
  - `requestPasswordReset(client, email, redirectTo)`:
    - Checks the email shape first (`INVALID_EMAIL`), then calls `resetPasswordForEmail(trimmedEmail, { redirectTo })`.
    - On success it returns `{ success: true, session: null, message }`. The message tells the user to check their email and open the link on this device. It never says whether an account exists for that email.
  - `validateNewPassword(password, confirmation)` returns `INVALID_PASSWORD` failures for an empty password, one shorter than `MIN_PASSWORD_LENGTH`, or a confirmation that doesn't match. Otherwise it returns `null`.
  - `updatePassword(client, password, confirmation)` validates with `validateNewPassword` before contacting Supabase. It then calls `updateUser({ password })` and returns `{ success: true, session: null, message: "Password updated" }`.
  - `toAuthFailure` maps two more Supabase codes:
    - `same_password` → `INVALID_PASSWORD`, "Choose a password different from your old one".
    - `over_email_send_rate_limit` → `AUTH_ERROR`, "Too many emails sent. Wait a few minutes and try again".
  - `watchSession(client, onChange)` also passes the Supabase auth event to `onChange(session, event)`.
  - `isPasswordRecovery(event)` is true only for `"PASSWORD_RECOVERY"`.
  - `authRouteGuards(signedIn, recoveringPassword)` returns which routes are open: `{ app, signIn, resetPassword }`.
    - The app is open only when signed in and not recovering.
    - Sign-in is open only when signed out.
    - The reset screen is open only when signed in and recovering.
- `src/lib/auth-provider.tsx`:
  - Tracks `isRecoveringPassword`. It is set by the `PASSWORD_RECOVERY` event, which Supabase sends when the reset link's code is exchanged, and cleared on sign-out or after the password is updated.
  - Exposes `requestPasswordReset(email)`, `updatePassword(password, confirmation)` and `cancelPasswordReset()`. Cancelling signs out.
  - The reset link uses the same `redirectUrl()` deep link as sign-up confirmation, so no new Supabase redirect URL is needed.
- `src/app/_layout.tsx` uses `authRouteGuards` for the `(app)`, `sign-in` and new `reset-password` routes.
- `src/app/sign-in.tsx`: in sign-in mode, a "Forgot password?" link switches the card to a reset form.
  - The form has the email field (keeping what was typed), a "Send reset link" button, and "Back to sign in".
  - Success shows the check-your-email notice; failures show the error.
- `src/app/reset-password.tsx` (new) is the "Choose a new password" screen:
  - It has New password and Confirm new password fields with a show/hide toggle, a "Save new password" button, and "Cancel".
  - Errors from validation or Supabase show inline. Success leaves the screen, because the guard opens the app.

## Requirements
- Use Supabase Auth's built-in reset (`resetPasswordForEmail` and `updateUser`); no database changes or Edge Functions.
- Keep the PKCE flow the app already uses. The link must be opened on the device that requested it, and the notice says so.
- Network code takes an injected client so unit tests run without network access, matching the rest of `src/lib/auth.ts`.
- Must pass `npx expo lint`, `npx eslint .` (the GitHub lint job), `npx tsc --noEmit`, and `npm test` with zero errors.

## Acceptance criteria
1. On the sign-in screen, "Forgot password?" opens a reset form with the typed email kept. "Send reset link" calls `resetPasswordForEmail` with the trimmed email and the app's redirect URL and shows the check-your-email notice. "Back to sign in" returns to the sign-in form.
2. A malformed email is rejected before contacting Supabase, and Supabase errors such as the email rate limit show a readable message.
3. Opening the reset link (the `PASSWORD_RECOVERY` event) shows only the "Choose a new password" screen, not the app, until the user saves a new password or cancels.
4. A new password that is empty, too short, or doesn't match its confirmation is rejected before contacting Supabase. Reusing the old password shows "Choose a password different from your old one".
5. Saving a valid new password calls `updateUser({ password })` and then opens the app. Cancelling signs the user out and returns to sign-in.
