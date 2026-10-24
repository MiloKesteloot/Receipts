/// <reference types="node" />
// Supabase's API uses snake_case fields (access_token, full_name).
/* eslint-disable @typescript-eslint/naming-convention */
import assert from "node:assert/strict";
import test, { beforeEach, describe } from "node:test";
import type { Session } from "@supabase/supabase-js";

import {
  completeOAuthRedirect,
  isSignedIn,
  MIN_PASSWORD_LENGTH,
  parseAuthCallbackUrl,
  signInWithAppleNative,
  signInWithEmail,
  signInWithOAuthProvider,
  signOut,
  signUpWithEmail,
  toAuthFailure,
  validateCredentials,
  watchSession,
  type AuthClient,
  type OpenAuthSession,
} from "../../src/lib/auth";
import { SESSION_STORAGE } from "../../src/lib/session-storage";

/**
 * A signed-in session as Supabase would return it (only the fields we read).
 */
const SESSION = { user: { id: "user-1", email: "a@b.co" } } as unknown as Session;

/**
 * Deep link the app asks providers to redirect back to.
 */
const REDIRECT = "receipts://sign-in";

type Call = { method: string; args: unknown[] };

/**
 * Fake `supabase.auth` that records calls. Each method returns `responses[method]`,
 * or throws it when it is an Error.
 */
class FakeAuth {
  calls: Call[] = [];
  responses: Record<string, unknown> = {};
  listener: ((event: string, session: Session | null) => void) | null = null;
  unsubscribed = false;

  /**
   * Records a call and returns (or throws) its canned response.
   * @param method Method name
   * @param args Call arguments
   * @returns The canned response
   */
  private respond(method: string, args: unknown[]): Promise<unknown> {
    this.calls.push({ method, args });
    const response = this.responses[method];
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve(response ?? { data: { session: SESSION, user: SESSION.user }, error: null });
  }

  /**
   * Names of the methods called, in order.
   * @returns Method names
   */
  methods(): string[] {
    return this.calls.map((c) => c.method);
  }

  /**
   * First argument of the first call to `method`.
   * @param method Method name
   * @returns The argument
   */
  argOf(method: string): unknown {
    return this.calls.find((c) => c.method === method)?.args[0];
  }

  /**
   * Typed view of this fake as the real client.
   * @returns This, as an AuthClient
   */
  asClient(): AuthClient {
    const respond = this.respond.bind(this);
    return {
      signInWithPassword: (...args: unknown[]) => respond("signInWithPassword", args),
      signUp: (...args: unknown[]) => respond("signUp", args),
      signInWithOAuth: (...args: unknown[]) => respond("signInWithOAuth", args),
      signInWithIdToken: (...args: unknown[]) => respond("signInWithIdToken", args),
      exchangeCodeForSession: (...args: unknown[]) => respond("exchangeCodeForSession", args),
      setSession: (...args: unknown[]) => respond("setSession", args),
      updateUser: (...args: unknown[]) => respond("updateUser", args),
      signOut: (...args: unknown[]) => respond("signOut", args),
      onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
        this.listener = callback;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                this.unsubscribed = true;
              },
            },
          },
        };
      },
    } as unknown as AuthClient;
  }
}

/**
 * Builds a Supabase-style error response.
 * @param code Supabase error code
 * @param message Error message
 * @returns `{ data, error }` with the error set
 */
function errorResponse(code: string, message = code): unknown {
  return { data: { session: null, user: null, url: null }, error: { code, message } };
}

describe("User Story 1.1: Authentication", () => {
  let fake: FakeAuth;
  let client: AuthClient;

  beforeEach(() => {
    fake = new FakeAuth();
    client = fake.asClient();
  });

  describe("route guard: isSignedIn", () => {
    test("is false with no session, so groups pages stay hidden", () => {
      assert.equal(isSignedIn(null), false);
      assert.equal(isSignedIn(undefined), false);
    });

    test("is false for a session without a user", () => {
      assert.equal(isSignedIn({} as Session), false);
    });

    test("is true for a signed-in session", () => {
      assert.equal(isSignedIn(SESSION), true);
    });
  });

  describe("validateCredentials", () => {
    test("rejects a malformed email", () => {
      const result = validateCredentials("not-an-email", "secret123", "sign-in");
      assert.equal(result?.error, "INVALID_EMAIL");
    });

    test("rejects an empty email", () => {
      assert.equal(validateCredentials("   ", "secret123", "sign-in")?.error, "INVALID_EMAIL");
    });

    test("rejects an empty password", () => {
      const result = validateCredentials("a@b.co", "", "sign-in");
      assert.equal(result?.error, "INVALID_PASSWORD");
      assert.match(result?.message ?? "", /enter your password/i);
    });

    test("requires the minimum length when creating an account", () => {
      const short = "x".repeat(MIN_PASSWORD_LENGTH - 1);
      const result = validateCredentials("a@b.co", short, "sign-up");
      assert.equal(result?.error, "INVALID_PASSWORD");
      assert.match(result?.message ?? "", new RegExp(`${MIN_PASSWORD_LENGTH} characters`));
    });

    test("does not enforce length when signing in to an existing account", () => {
      assert.equal(validateCredentials("a@b.co", "abc", "sign-in"), null);
    });

    test("accepts valid input, ignoring surrounding spaces in the email", () => {
      assert.equal(validateCredentials("  a@b.co ", "secret123", "sign-up"), null);
    });
  });

  describe("toAuthFailure", () => {
    const cases: [string, string, RegExp][] = [
      ["invalid_credentials", "INVALID_CREDENTIALS", /incorrect email or password/i],
      ["email_not_confirmed", "EMAIL_NOT_CONFIRMED", /confirm your email/i],
      ["user_already_exists", "USER_EXISTS", /already exists/i],
      ["email_exists", "USER_EXISTS", /already exists/i],
      ["weak_password", "INVALID_PASSWORD", /stronger password/i],
    ];
    for (const [code, error, message] of cases) {
      test(`maps "${code}" to ${error}`, () => {
        const result = toAuthFailure({ code, message: "raw" });
        assert.equal(result.error, error);
        assert.match(result.message, message);
      });
    }

    test("keeps the message of unknown errors", () => {
      const result = toAuthFailure(new Error("Network request failed"));
      assert.equal(result.error, "AUTH_ERROR");
      assert.equal(result.message, "Network request failed");
    });

    test("falls back to a generic message", () => {
      for (const value of [null, undefined, "boom", {}, new Error("")]) {
        const result = toAuthFailure(value);
        assert.equal(result.error, "AUTH_ERROR");
        assert.match(result.message, /something went wrong/i);
      }
    });
  });

  describe("sign in with email/password", () => {
    test("signs in and returns the session", async () => {
      const result = await signInWithEmail(client, "  a@b.co ", "secret123");
      assert.deepEqual(result, { success: true, session: SESSION });
      assert.deepEqual(fake.argOf("signInWithPassword"), {
        email: "a@b.co",
        password: "secret123",
      });
    });

    test("does not contact Supabase when the input is invalid", async () => {
      const result = await signInWithEmail(client, "bad", "secret123");
      assert.equal(result.success, false);
      assert.deepEqual(fake.calls, []);
    });

    test("reports wrong credentials", async () => {
      fake.responses.signInWithPassword = errorResponse("invalid_credentials");
      const result = await signInWithEmail(client, "a@b.co", "wrong");
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "INVALID_CREDENTIALS");
    });

    test("reports thrown network errors", async () => {
      fake.responses.signInWithPassword = new Error("offline");
      const result = await signInWithEmail(client, "a@b.co", "secret123");
      assert.deepEqual(result, { success: false, error: "AUTH_ERROR", message: "offline" });
    });

    test("fails cleanly when Supabase is not configured", async () => {
      const result = await signInWithEmail(null, "a@b.co", "secret123");
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "NOT_CONFIGURED");
    });
  });

  describe("create account with email/password", () => {
    test("returns the session when no confirmation is required", async () => {
      const result = await signUpWithEmail(client, "a@b.co", "secret123", REDIRECT);
      assert.deepEqual(result, { success: true, session: SESSION });
      assert.deepEqual(fake.argOf("signUp"), {
        email: "a@b.co",
        password: "secret123",
        options: { emailRedirectTo: REDIRECT },
      });
    });

    test("asks the user to confirm their email when there is no session yet", async () => {
      fake.responses.signUp = { data: { session: null, user: { id: "u" } }, error: null };
      const result = await signUpWithEmail(client, "a@b.co", "secret123");
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.session, null);
        assert.match(result.message ?? "", /check your email/i);
      }
      assert.deepEqual(fake.argOf("signUp"), {
        email: "a@b.co",
        password: "secret123",
        options: undefined,
      });
    });

    test("rejects short passwords before contacting Supabase", async () => {
      const result = await signUpWithEmail(client, "a@b.co", "123");
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "INVALID_PASSWORD");
      assert.deepEqual(fake.calls, []);
    });

    test("reports an existing account", async () => {
      fake.responses.signUp = errorResponse("user_already_exists");
      const result = await signUpWithEmail(client, "a@b.co", "secret123");
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "USER_EXISTS");
    });

    test("reports thrown errors", async () => {
      fake.responses.signUp = new Error("offline");
      const result = await signUpWithEmail(client, "a@b.co", "secret123");
      assert.equal(result.success, false);
    });

    test("fails cleanly when Supabase is not configured", async () => {
      const result = await signUpWithEmail(null, "a@b.co", "secret123");
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "NOT_CONFIGURED");
    });
  });

  describe("parseAuthCallbackUrl", () => {
    test("reads a PKCE code from the query", () => {
      assert.deepEqual(parseAuthCallbackUrl("receipts://sign-in?code=abc123"), {
        kind: "code",
        code: "abc123",
      });
    });

    test("reads tokens from the fragment", () => {
      assert.deepEqual(
        parseAuthCallbackUrl("receipts://sign-in#access_token=AT&refresh_token=RT&type=bearer"),
        { kind: "tokens", accessToken: "AT", refreshToken: "RT" }
      );
    });

    test("works with Expo Go deep links", () => {
      assert.deepEqual(parseAuthCallbackUrl("exp://192.168.1.2:8081/--/sign-in?code=xyz"), {
        kind: "code",
        code: "xyz",
      });
    });

    test("prefers the provider's error description", () => {
      assert.deepEqual(
        parseAuthCallbackUrl(
          "receipts://sign-in?error=access_denied&error_description=User%20denied%20access"
        ),
        { kind: "error", message: "User denied access" }
      );
    });

    test("falls back to the error code", () => {
      assert.deepEqual(parseAuthCallbackUrl("receipts://sign-in#error=server_error"), {
        kind: "error",
        message: "server_error",
      });
    });

    test("ignores a lone access token without a refresh token", () => {
      assert.equal(parseAuthCallbackUrl("receipts://sign-in#access_token=AT"), null);
    });

    test("returns null for URLs without auth data or that don't parse", () => {
      assert.equal(parseAuthCallbackUrl("receipts://sign-in"), null);
      assert.equal(parseAuthCallbackUrl("not a url"), null);
    });
  });

  describe("completeOAuthRedirect", () => {
    test("exchanges a PKCE code for a session", async () => {
      const result = await completeOAuthRedirect(client, "receipts://sign-in?code=abc");
      assert.deepEqual(result, { success: true, session: SESSION });
      assert.deepEqual(fake.methods(), ["exchangeCodeForSession"]);
      assert.equal(fake.argOf("exchangeCodeForSession"), "abc");
    });

    test("stores implicit-flow tokens as the session", async () => {
      const result = await completeOAuthRedirect(
        client,
        "receipts://sign-in#access_token=AT&refresh_token=RT"
      );
      assert.equal(result.success, true);
      assert.deepEqual(fake.argOf("setSession"), { access_token: "AT", refresh_token: "RT" });
    });

    test("reports provider errors without contacting Supabase", async () => {
      const result = await completeOAuthRedirect(client, "receipts://sign-in?error=access_denied");
      assert.deepEqual(result, { success: false, error: "AUTH_ERROR", message: "access_denied" });
      assert.deepEqual(fake.calls, []);
    });

    test("reports a redirect that carried no session", async () => {
      const result = await completeOAuthRedirect(client, "receipts://sign-in");
      assert.equal(result.success, false);
      if (!result.success) assert.match(result.message, /did not return a session/i);
    });

    test("reports a failed code exchange", async () => {
      fake.responses.exchangeCodeForSession = errorResponse("bad_code_verifier", "Invalid code");
      const result = await completeOAuthRedirect(client, "receipts://sign-in?code=abc");
      assert.deepEqual(result, { success: false, error: "AUTH_ERROR", message: "Invalid code" });
    });

    test("reports a thrown exchange error", async () => {
      fake.responses.exchangeCodeForSession = new Error("offline");
      const result = await completeOAuthRedirect(client, "receipts://sign-in?code=abc");
      assert.equal(result.success, false);
    });

    test("fails cleanly when Supabase is not configured", async () => {
      const result = await completeOAuthRedirect(null, "receipts://sign-in?code=abc");
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "NOT_CONFIGURED");
    });
  });

  describe("sign in with Google (browser OAuth)", () => {
    let opened: [string, string][];
    let browserResult: Awaited<ReturnType<OpenAuthSession>>;

    /**
     * Fake browser that records what it opened.
     * @param url Page to open
     * @param redirectUrl Deep link that ends the session
     * @returns The canned browser result
     */
    const openAuthSession: OpenAuthSession = async (url, redirectUrl) => {
      opened.push([url, redirectUrl]);
      return browserResult;
    };

    beforeEach(() => {
      opened = [];
      browserResult = { type: "success", url: `${REDIRECT}?code=google-code` };
      fake.responses.signInWithOAuth = {
        data: { provider: "google", url: "https://auth.example/google" },
        error: null,
      };
    });

    test("opens Google's page and exchanges the returned code", async () => {
      const result = await signInWithOAuthProvider(client, "google", REDIRECT, openAuthSession);

      assert.deepEqual(result, { success: true, session: SESSION });
      assert.deepEqual(fake.argOf("signInWithOAuth"), {
        provider: "google",
        options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
      });
      assert.deepEqual(opened, [["https://auth.example/google", REDIRECT]]);
      assert.equal(fake.argOf("exchangeCodeForSession"), "google-code");
    });

    test("treats closing the browser as a cancel", async () => {
      for (const type of ["cancel", "dismiss"]) {
        browserResult = { type };
        const result = await signInWithOAuthProvider(client, "google", REDIRECT, openAuthSession);
        assert.equal(result.success, false);
        if (!result.success) assert.equal(result.error, "CANCELLED");
      }
      assert.equal(fake.methods().includes("exchangeCodeForSession"), false);
    });

    test("reports a provider that is not enabled", async () => {
      fake.responses.signInWithOAuth = errorResponse(
        "validation_failed",
        "Unsupported provider: provider is not enabled"
      );
      const result = await signInWithOAuthProvider(client, "google", REDIRECT, openAuthSession);
      assert.equal(result.success, false);
      if (!result.success) assert.match(result.message, /not enabled/);
      assert.deepEqual(opened, []);
    });

    test("reports a missing sign-in URL", async () => {
      fake.responses.signInWithOAuth = { data: { provider: "google", url: "" }, error: null };
      const result = await signInWithOAuthProvider(client, "google", REDIRECT, openAuthSession);
      assert.equal(result.success, false);
      if (!result.success) assert.match(result.message, /could not start/i);
    });

    test("reports a browser that fails to open", async () => {
      const result = await signInWithOAuthProvider(client, "google", REDIRECT, async () => {
        throw new Error("No browser available");
      });
      assert.deepEqual(result, {
        success: false,
        error: "AUTH_ERROR",
        message: "No browser available",
      });
    });

    test("uses the same flow for Apple on Android and web", async () => {
      await signInWithOAuthProvider(client, "apple", REDIRECT, openAuthSession);
      assert.equal((fake.argOf("signInWithOAuth") as { provider: string }).provider, "apple");
    });

    test("fails cleanly when Supabase is not configured", async () => {
      const result = await signInWithOAuthProvider(null, "google", REDIRECT, openAuthSession);
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "NOT_CONFIGURED");
      assert.deepEqual(opened, []);
    });
  });

  describe("sign in with Apple (native iOS)", () => {
    test("sends Apple's identity token to Supabase", async () => {
      const result = await signInWithAppleNative(client, async () => ({
        identityToken: "apple-jwt",
        fullName: null,
      }));

      assert.deepEqual(result, { success: true, session: SESSION });
      assert.deepEqual(fake.argOf("signInWithIdToken"), {
        provider: "apple",
        token: "apple-jwt",
      });
      assert.deepEqual(fake.methods(), ["signInWithIdToken"]);
    });

    test("saves the name Apple shares on first sign-in", async () => {
      await signInWithAppleNative(client, async () => ({
        identityToken: "apple-jwt",
        fullName: { givenName: "Ada", familyName: "Lovelace" },
      }));
      assert.deepEqual(fake.argOf("updateUser"), { data: { full_name: "Ada Lovelace" } });
    });

    test("saves a partial name", async () => {
      await signInWithAppleNative(client, async () => ({
        identityToken: "apple-jwt",
        fullName: { givenName: "Ada", familyName: null },
      }));
      assert.deepEqual(fake.argOf("updateUser"), { data: { full_name: "Ada" } });
    });

    test("treats dismissing the Apple sheet as a cancel", async () => {
      const result = await signInWithAppleNative(client, async () => {
        throw Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" });
      });
      assert.deepEqual(result, { success: false, error: "CANCELLED", message: "Sign-in cancelled" });
      assert.deepEqual(fake.calls, []);
    });

    test("reports other Apple errors", async () => {
      const result = await signInWithAppleNative(client, async () => {
        throw Object.assign(new Error("Apple sign-in failed"), { code: "ERR_REQUEST_FAILED" });
      });
      assert.deepEqual(result, {
        success: false,
        error: "AUTH_ERROR",
        message: "Apple sign-in failed",
      });
    });

    test("reports a missing identity token", async () => {
      const result = await signInWithAppleNative(client, async () => ({ identityToken: null }));
      assert.equal(result.success, false);
      if (!result.success) assert.match(result.message, /identity token/i);
      assert.deepEqual(fake.calls, []);
    });

    test("reports Supabase rejecting the token and skips saving the name", async () => {
      fake.responses.signInWithIdToken = errorResponse("bad_jwt", "Invalid audience");
      const result = await signInWithAppleNative(client, async () => ({
        identityToken: "apple-jwt",
        fullName: { givenName: "Ada", familyName: "Lovelace" },
      }));
      assert.deepEqual(result, { success: false, error: "AUTH_ERROR", message: "Invalid audience" });
      assert.equal(fake.methods().includes("updateUser"), false);
    });

    test("fails cleanly when Supabase is not configured", async () => {
      let asked = false;
      const result = await signInWithAppleNative(null, async () => {
        asked = true;
        return { identityToken: "apple-jwt" };
      });
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "NOT_CONFIGURED");
      assert.equal(asked, false);
    });
  });

  describe("sign out", () => {
    test("signs out and returns no session", async () => {
      fake.responses.signOut = { error: null };
      const result = await signOut(client);
      assert.deepEqual(result, { success: true, session: null });
      assert.deepEqual(fake.methods(), ["signOut"]);
    });

    test("reports a failed sign-out", async () => {
      fake.responses.signOut = { error: { message: "Session not found" } };
      const result = await signOut(client);
      assert.deepEqual(result, { success: false, error: "AUTH_ERROR", message: "Session not found" });
    });

    test("reports a thrown sign-out error", async () => {
      fake.responses.signOut = new Error("offline");
      const result = await signOut(client);
      assert.equal(result.success, false);
    });

    test("fails cleanly when Supabase is not configured", async () => {
      const result = await signOut(null);
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "NOT_CONFIGURED");
    });
  });

  describe("watchSession", () => {
    test("reports the stored session, sign-out, and stops on unsubscribe", () => {
      const seen: (Session | null)[] = [];
      const stop = watchSession(client, (session) => seen.push(session));

      fake.listener?.("INITIAL_SESSION", SESSION);
      fake.listener?.("SIGNED_OUT", null);
      assert.deepEqual(seen, [SESSION, null]);

      assert.equal(fake.unsubscribed, false);
      stop();
      assert.equal(fake.unsubscribed, true);
    });

    test("reports signed out straight away when Supabase is not configured", () => {
      const seen: (Session | null)[] = [];
      const stop = watchSession(null, (session) => seen.push(session));
      assert.deepEqual(seen, [null]);
      stop();
    });
  });

  describe("session storage", () => {
    test("web/Node defer to Supabase's default storage", () => {
      assert.equal(SESSION_STORAGE, undefined);
    });
  });
});
