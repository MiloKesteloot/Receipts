import type { Provider, Session, SupabaseClient } from "@supabase/supabase-js";

/**
 * The parts of `supabase.auth` this app uses. Kept narrow so tests can pass a fake.
 */
export type AuthClient = Pick<
  SupabaseClient["auth"],
  | "onAuthStateChange"
  | "signInWithPassword"
  | "signUp"
  | "signInWithOAuth"
  | "signInWithIdToken"
  | "exchangeCodeForSession"
  | "setSession"
  | "updateUser"
  | "signOut"
>;

export type AuthErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_EMAIL"
  | "INVALID_PASSWORD"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_CONFIRMED"
  | "USER_EXISTS"
  | "CANCELLED"
  | "AUTH_ERROR";

export type AuthResult =
  | {
      success: true;
      // Null after sign-up when the project requires email confirmation first.
      session: Session | null;
      message?: string;
    }
  | {
      success: false;
      error: AuthErrorCode;
      message: string;
    };

export type AuthFailure = Extract<AuthResult, { success: false }>;

export type OAuthProvider = Extract<Provider, "google" | "apple">;

export type EmailMode = "sign-in" | "sign-up";

/**
 * Opens the provider's sign-in page and resolves once it redirects back
 * (`WebBrowser.openAuthSessionAsync` in the app).
 */
export type OpenAuthSession = (
  url: string,
  redirectUrl: string
) => Promise<{ type: string; url?: string }>;

/**
 * Shows the native Sign in with Apple sheet (`AppleAuthentication.signInAsync` in the app).
 */
export type RequestAppleCredential = () => Promise<{
  identityToken: string | null;
  fullName?: { givenName?: string | null; familyName?: string | null } | null;
}>;

export type AuthCallback =
  | { kind: "code"; code: string }
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string };

/**
 * Supabase's default minimum password length.
 */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Loose email shape check; Supabase does the real validation.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returned by every action when `.env` has no Supabase keys.
 */
const NOT_CONFIGURED: AuthFailure = {
  success: false,
  error: "NOT_CONFIGURED",
  message: "Add your Supabase URL and key to .env",
};

/**
 * Whether there is a signed-in user. Drives the route guards.
 * @param session Current session, if any
 * @returns True when signed in
 */
export function isSignedIn(session: Session | null | undefined): boolean {
  return Boolean(session?.user);
}

/**
 * Checks the email/password form before contacting Supabase.
 * @param email Email as typed
 * @param password Password as typed
 * @param mode Signing in or creating an account
 * @returns A failure to show, or null when the input looks valid
 */
export function validateCredentials(
  email: string,
  password: string,
  mode: EmailMode
): AuthFailure | null {
  if (!EMAIL_PATTERN.test(email.trim())) {
    return {
      success: false,
      error: "INVALID_EMAIL",
      message: "Enter a valid email address",
    };
  }
  if (!password) {
    return {
      success: false,
      error: "INVALID_PASSWORD",
      message: "Enter your password",
    };
  }
  if (mode === "sign-up" && password.length < MIN_PASSWORD_LENGTH) {
    return {
      success: false,
      error: "INVALID_PASSWORD",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }
  return null;
}

/**
 * Turns a Supabase (or unexpected) error into a message for the user.
 * @param error Error thrown or returned by Supabase
 * @returns Failure result
 */
export function toAuthFailure(error: unknown): AuthFailure {
  const { code, message } =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown; message?: unknown })
      : {};
  switch (code) {
    case "invalid_credentials":
      return {
        success: false,
        error: "INVALID_CREDENTIALS",
        message: "Incorrect email or password",
      };
    case "email_not_confirmed":
      return {
        success: false,
        error: "EMAIL_NOT_CONFIRMED",
        message: "Confirm your email, then sign in",
      };
    case "user_already_exists":
    case "email_exists":
      return {
        success: false,
        error: "USER_EXISTS",
        message: "An account with that email already exists",
      };
    case "weak_password":
      return {
        success: false,
        error: "INVALID_PASSWORD",
        message: "Choose a stronger password",
      };
  }
  return {
    success: false,
    error: "AUTH_ERROR",
    message:
      typeof message === "string" && message
        ? message
        : "Something went wrong. Please try again.",
  };
}

/**
 * Signs in with an existing email/password account.
 * @param client Supabase auth client
 * @param email Email address
 * @param password Password
 * @returns Result with the new session
 */
export async function signInWithEmail(
  client: AuthClient | null,
  email: string,
  password: string
): Promise<AuthResult> {
  if (!client) return NOT_CONFIGURED;
  const invalid = validateCredentials(email, password, "sign-in");
  if (invalid) return invalid;

  try {
    const { data, error } = await client.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return toAuthFailure(error);
    return { success: true, session: data.session };
  } catch (error) {
    return toAuthFailure(error);
  }
}

/**
 * Creates an email/password account.
 * @param client Supabase auth client
 * @param email Email address
 * @param password Password
 * @param emailRedirectTo Where the confirmation email link should open
 * @returns Result; session is null when the email must be confirmed first
 */
export async function signUpWithEmail(
  client: AuthClient | null,
  email: string,
  password: string,
  emailRedirectTo?: string
): Promise<AuthResult> {
  if (!client) return NOT_CONFIGURED;
  const invalid = validateCredentials(email, password, "sign-up");
  if (invalid) return invalid;

  try {
    const { data, error } = await client.signUp({
      email: email.trim(),
      password,
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    });
    if (error) return toAuthFailure(error);
    if (!data.session) {
      return {
        success: true,
        session: null,
        message: "Check your email to confirm your account",
      };
    }
    return { success: true, session: data.session };
  } catch (error) {
    return toAuthFailure(error);
  }
}

/**
 * Reads the result of an OAuth redirect. PKCE returns `?code=`; the implicit
 * flow returns tokens in the `#` fragment; failures return `error_description`.
 * @param url URL the provider redirected back to
 * @returns What the URL carried, or null if it is not an auth callback
 */
export function parseAuthCallbackUrl(url: string): AuthCallback | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const params = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.replace(/^#/, "")).forEach((value, key) => {
    params.set(key, value);
  });

  const errorMessage = params.get("error_description") ?? params.get("error");
  if (errorMessage) return { kind: "error", message: errorMessage };

  const code = params.get("code");
  if (code) return { kind: "code", code };

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "tokens", accessToken, refreshToken };
  }
  return null;
}

/**
 * Finishes an OAuth sign-in from the URL the provider redirected back to.
 * @param client Supabase auth client
 * @param url Redirect URL
 * @returns Result with the new session
 */
export async function completeOAuthRedirect(
  client: AuthClient | null,
  url: string
): Promise<AuthResult> {
  if (!client) return NOT_CONFIGURED;
  const callback = parseAuthCallbackUrl(url);
  if (!callback) {
    return {
      success: false,
      error: "AUTH_ERROR",
      message: "Sign-in did not return a session",
    };
  }
  if (callback.kind === "error") {
    return { success: false, error: "AUTH_ERROR", message: callback.message };
  }

  try {
    const { data, error } =
      callback.kind === "code"
        ? await client.exchangeCodeForSession(callback.code)
        : await client.setSession({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            access_token: callback.accessToken,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            refresh_token: callback.refreshToken,
          });
    if (error) return toAuthFailure(error);
    return { success: true, session: data.session };
  } catch (error) {
    return toAuthFailure(error);
  }
}

/**
 * Signs in through the provider's web page (Google everywhere, Apple off iOS).
 * @param client Supabase auth client
 * @param provider "google" or "apple"
 * @param redirectUrl Deep link back into the app; must be allow-listed in Supabase
 * @param openAuthSession Opens the browser and waits for the redirect
 * @returns Result with the new session
 */
export async function signInWithOAuthProvider(
  client: AuthClient | null,
  provider: OAuthProvider,
  redirectUrl: string,
  openAuthSession: OpenAuthSession
): Promise<AuthResult> {
  if (!client) return NOT_CONFIGURED;

  try {
    const { data, error } = await client.signInWithOAuth({
      provider,
      options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
    });
    if (error) return toAuthFailure(error);
    if (!data.url) {
      return {
        success: false,
        error: "AUTH_ERROR",
        message: "Could not start sign-in",
      };
    }

    const result = await openAuthSession(data.url, redirectUrl);
    if (result.type !== "success" || !result.url) {
      return { success: false, error: "CANCELLED", message: "Sign-in cancelled" };
    }
    return completeOAuthRedirect(client, result.url);
  } catch (error) {
    return toAuthFailure(error);
  }
}

/**
 * Signs in with the native Sign in with Apple sheet (iOS).
 * @param client Supabase auth client
 * @param requestCredential Shows the Apple sheet and returns its credential
 * @returns Result with the new session
 */
export async function signInWithAppleNative(
  client: AuthClient | null,
  requestCredential: RequestAppleCredential
): Promise<AuthResult> {
  if (!client) return NOT_CONFIGURED;

  let credential: Awaited<ReturnType<RequestAppleCredential>>;
  try {
    credential = await requestCredential();
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "ERR_REQUEST_CANCELED") {
      return { success: false, error: "CANCELLED", message: "Sign-in cancelled" };
    }
    return toAuthFailure(error);
  }
  if (!credential.identityToken) {
    return {
      success: false,
      error: "AUTH_ERROR",
      message: "Apple did not return an identity token",
    };
  }

  try {
    const { data, error } = await client.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error) return toAuthFailure(error);

    // Apple only shares the name on the first sign-in, and never inside the
    // token, so save it to the account ourselves.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(" ");
    if (fullName) {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      await client.updateUser({ data: { full_name: fullName } });
    }
    return { success: true, session: data.session };
  } catch (error) {
    return toAuthFailure(error);
  }
}

/**
 * Signs out and clears the stored session.
 * @param client Supabase auth client
 * @returns Result with a null session
 */
export async function signOut(client: AuthClient | null): Promise<AuthResult> {
  if (!client) return NOT_CONFIGURED;
  try {
    const { error } = await client.signOut();
    if (error) return toAuthFailure(error);
    return { success: true, session: null };
  } catch (error) {
    return toAuthFailure(error);
  }
}

/**
 * Calls `onChange` with the current session now and whenever it changes
 * (sign-in, sign-out, token refresh).
 * @param client Supabase auth client
 * @param onChange Receives the latest session
 * @returns Function that stops listening
 */
export function watchSession(
  client: AuthClient | null,
  onChange: (session: Session | null) => void
): () => void {
  if (!client) {
    onChange(null);
    return () => {};
  }
  // Supabase fires INITIAL_SESSION straight away with the stored session.
  const { data } = client.onAuthStateChange((_event, session) => {
    onChange(session);
  });
  return () => data.subscription.unsubscribe();
}
