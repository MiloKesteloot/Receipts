---
id: US-4.2-T-1
story: US-4.2
sprint: 4
assignee: Neko
estimate_hours: 6
---

# Make Google sign-in work and explain when it is turned off

## Description
Serves User Story 4.2 (Sign in with Google): "As a user, I want to be able to sign in with Google so I don't need to remember a password." The "Continue with Google" button from US-1.1 opens Supabase's OAuth page in a browser sheet, but the Google provider was never turned on in the Supabase project. The sheet showed raw JSON (`{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`), and once the user closed it the app treated it as a cancel and said nothing. `signInWithOAuth` with `skipBrowserRedirect` only builds a URL and never contacts the server, so the app could not see this error. This task turns Google on in the Supabase project, makes the app check that a provider is enabled before opening the browser, and shows a clear message when it is not. A native Google account picker (`@react-native-google-signin/google-signin`) and setting up the Apple provider are out of scope.

## Specs
- `isOAuthProviderEnabled(settings: unknown, provider: OAuthProvider): boolean | null` in `src/lib/auth.ts` reads `settings.external[provider]` from Supabase's `GET /auth/v1/settings` response. It returns `true` or `false`, or `null` when the response does not have that shape.
- `fetchOAuthProviderEnabled(fetchImpl, supabaseUrl, apiKey, provider): Promise<boolean | null>` in `src/lib/auth.ts` sends `GET <supabaseUrl>/auth/v1/settings` with the `apikey` header and passes the body to `isOAuthProviderEnabled`. It returns `null` when the request throws, the status is not 2xx, or the body is not JSON.
- `signInWithOAuthProvider(client, provider, redirectUrl, openAuthSession, checkProvider?)` takes an optional `CheckOAuthProvider = (provider: OAuthProvider) => Promise<boolean | null>`:
  - When it resolves `false`, the function returns `{ success: false, error: "PROVIDER_DISABLED", message: "<Provider> sign-in isn't turned on yet. Sign in with email for now." }` (`<Provider>` is "Google" or "Apple") and does not call `signInWithOAuth` or open the browser.
  - When it resolves `true` or `null`, or throws, sign-in continues as before.
- `AuthErrorCode` gains `"PROVIDER_DISABLED"`. `toAuthFailure` maps any error whose message contains "provider is not enabled" to `PROVIDER_DISABLED` with a provider-neutral message: "This sign-in method isn't turned on yet. Sign in with email for now."
- `src/lib/supabase.ts` exports `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. `AuthProvider` (`src/lib/auth-provider.tsx`) passes a checker built from them with the global `fetch` to Google sign-in and to Apple's web sign-in. No checker is passed when Supabase is not configured.
- The sign-in screen shows the failure message in its existing error text. Its layout does not change.
- Supabase project configuration:
  - Google Cloud: an OAuth consent screen and an OAuth client of type "Web application" with the authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
  - Supabase → Authentication → Sign In / Providers → Google: turned on, with that client's ID and secret.
  - Supabase → Authentication → URL Configuration → Redirect URLs: `receipts://**`, `exp://**` and `http://localhost:8081/**`.
- The README "Sign-in" section lists these steps, and "Troubleshooting" explains the "provider is not enabled" error.

## Requirements
- Add no new dependencies and no native code. The existing browser flow (`expo-web-browser` and PKCE code exchange) stays the same.
- The provider check must never block sign-in. If the settings request fails for any reason, the browser opens as before.
- The Google client secret lives only in the Supabase dashboard. It must never appear in `.env`, `app.json` or the repo.
- New Google users get a profile named from Google's `full_name` / `name` through the existing `handle_new_user` trigger. No migration is needed.
- Must pass `npx expo lint`, `npx tsc --noEmit`, and `npm test` with zero errors.

## Acceptance criteria
1. When the Google provider is turned off, tapping "Continue with Google" shows "Google sign-in isn't turned on yet. Sign in with email for now." and does not open a browser.
2. When the Google provider is turned on, "Continue with Google" opens Google's sign-in page, and returning to the app with a code signs the user in.
3. If the provider check fails (offline, server error, or unexpected response), "Continue with Google" still opens Google's sign-in page.
4. If Supabase reports "provider is not enabled" as an error, the user sees a clear message instead of the raw Supabase error.
5. Closing Google's sign-in page without finishing shows no error and leaves the user on the sign-in screen.
