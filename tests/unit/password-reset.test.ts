/// <reference types="node" />
/**
 * User Story 4.10, Task 1: Forgot password. Requesting a reset email,
 * checking and saving a new password, and keeping the user on the
 * new-password screen while a reset link is being used.
 *
 * Run with:
 *   node --experimental-strip-types --import ./tests/register-aliases.ts --test tests/unit/password-reset.test.ts
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import {
  authRouteGuards,
  isPasswordRecovery,
  MIN_PASSWORD_LENGTH,
  requestPasswordReset,
  RESET_EMAIL_SENT_MESSAGE,
  toAuthFailure,
  updatePassword,
  validateNewPassword,
  watchSession,
  type AuthClient,
} from "@/lib/auth";

/** Deep link the reset email opens (same as sign-up confirmation). */
const REDIRECT = "receipts://sign-in";

/** A session from opening a reset link (only the fields the app reads). */
const SESSION = { user: { id: "user-1", email: "a@b.co" } } as unknown as Session;

type Call = { method: string; args: unknown[] };

/**
 * A fake `supabase.auth` that records calls and answers each method with
 * `answers[method]`, throwing it when it is an Error.
 * @param answers Canned answers by method name
 * @returns The client, its calls, and a way to fire auth events
 */
function fakeAuth(answers: Record<string, unknown> = {}): {
  client: AuthClient;
  calls: Call[];
  fire: (event: AuthChangeEvent, session: Session | null) => void;
} {
  const calls: Call[] = [];
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;
  const respond = (method: string) => async (...args: unknown[]) => {
    calls.push({ method, args });
    const answer = answers[method];
    if (answer instanceof Error) throw answer;
    return answer ?? { data: {}, error: null };
  };
  const client = {
    resetPasswordForEmail: respond("resetPasswordForEmail"),
    updateUser: respond("updateUser"),
    onAuthStateChange: (callback: typeof listener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
  } as unknown as AuthClient;
  return {
    client,
    calls,
    fire: (event, session) => listener?.(event, session),
  };
}

describe("User Story 4.10 Task 1: Forgot password", () => {
  test("US-4.10-T-1: AC1 requesting a reset emails a link with the trimmed email and the app's redirect", async () => {
    const { client, calls } = fakeAuth();
    const result = await requestPasswordReset(client, "  a@b.co ", REDIRECT);

    assert.deepEqual(calls, [
      { method: "resetPasswordForEmail", args: ["a@b.co", { redirectTo: REDIRECT }] },
    ]);
    assert.deepEqual(result, { success: true, session: null, message: RESET_EMAIL_SENT_MESSAGE });
    // Doesn't say whether the account exists, and says to use this device.
    assert.match(RESET_EMAIL_SENT_MESSAGE, /If there's an account/);
    assert.match(RESET_EMAIL_SENT_MESSAGE, /this device/);
  });

  test("US-4.10-T-1: AC2 a malformed email is rejected before contacting Supabase", async () => {
    for (const email of ["", "   ", "not-an-email", "a@b"]) {
      const { client, calls } = fakeAuth();
      const result = await requestPasswordReset(client, email, REDIRECT);
      assert.deepEqual(result, {
        success: false,
        error: "INVALID_EMAIL",
        message: "Enter a valid email address",
      });
      assert.equal(calls.length, 0, email);
    }
  });

  test("US-4.10-T-1: AC2 Supabase errors such as the email rate limit show a readable message", async () => {
    const limited = fakeAuth({
      resetPasswordForEmail: {
        data: null,
        error: { code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
      },
    });
    assert.deepEqual(await requestPasswordReset(limited.client, "a@b.co", REDIRECT), {
      success: false,
      error: "AUTH_ERROR",
      message: "Too many emails sent. Wait a few minutes and try again",
    });

    const offline = fakeAuth({ resetPasswordForEmail: new Error("Network request failed") });
    assert.deepEqual(await requestPasswordReset(offline.client, "a@b.co", REDIRECT), {
      success: false,
      error: "AUTH_ERROR",
      message: "Network request failed",
    });

    assert.equal((await requestPasswordReset(null, "a@b.co", REDIRECT)).success, false);
  });

  test("US-4.10-T-1: AC3 opening a reset link is detected from the PASSWORD_RECOVERY event", () => {
    const { client, fire } = fakeAuth();
    const seen: [Session | null, AuthChangeEvent | undefined][] = [];
    const stop = watchSession(client, (session, event) => seen.push([session, event]));

    fire("INITIAL_SESSION", null);
    fire("PASSWORD_RECOVERY", SESSION);
    stop();

    assert.deepEqual(seen, [
      [null, "INITIAL_SESSION"],
      [SESSION, "PASSWORD_RECOVERY"],
    ]);
    assert.equal(isPasswordRecovery("PASSWORD_RECOVERY"), true);
    for (const event of ["SIGNED_IN", "INITIAL_SESSION", "USER_UPDATED", "SIGNED_OUT"] as const) {
      assert.equal(isPasswordRecovery(event), false, event);
    }
    assert.equal(isPasswordRecovery(undefined), false);
  });

  test("US-4.10-T-1: AC3 while recovering, only the new-password screen is open", () => {
    assert.deepEqual(authRouteGuards(true, true), {
      app: false,
      signIn: false,
      resetPassword: true,
    });
    // Normal states are unchanged.
    assert.deepEqual(authRouteGuards(true, false), {
      app: true,
      signIn: false,
      resetPassword: false,
    });
    assert.deepEqual(authRouteGuards(false, false), {
      app: false,
      signIn: true,
      resetPassword: false,
    });
    // Signed out always means sign-in, even if a reset flag were left over.
    assert.deepEqual(authRouteGuards(false, true), {
      app: false,
      signIn: true,
      resetPassword: false,
    });
  });

  test("US-4.10-T-1: AC4 empty, short, or mismatched new passwords are rejected before contacting Supabase", async () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const cases: [string, string, string][] = [
      ["", "", "Enter a new password"],
      [short, short, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`],
      ["secret123", "secret124", "Passwords don't match"],
    ];
    for (const [password, confirmation, message] of cases) {
      assert.deepEqual(validateNewPassword(password, confirmation), {
        success: false,
        error: "INVALID_PASSWORD",
        message,
      });
      const { client, calls } = fakeAuth();
      assert.equal((await updatePassword(client, password, confirmation)).success, false);
      assert.equal(calls.length, 0);
    }
    assert.equal(validateNewPassword("secret123", "secret123"), null);
  });

  test("US-4.10-T-1: AC4 reusing the old password asks for a different one", async () => {
    assert.deepEqual(toAuthFailure({ code: "same_password", message: "New password should be different" }), {
      success: false,
      error: "INVALID_PASSWORD",
      message: "Choose a password different from your old one",
    });
    const { client } = fakeAuth({
      updateUser: { data: { user: null }, error: { code: "same_password", message: "same" } },
    });
    assert.deepEqual(await updatePassword(client, "secret123", "secret123"), {
      success: false,
      error: "INVALID_PASSWORD",
      message: "Choose a password different from your old one",
    });
  });

  test("US-4.10-T-1: AC5 a valid new password is saved with updateUser", async () => {
    const { client, calls } = fakeAuth({ updateUser: { data: { user: SESSION.user }, error: null } });
    assert.deepEqual(await updatePassword(client, "secret123", "secret123"), {
      success: true,
      session: null,
      message: "Password updated",
    });
    assert.deepEqual(calls, [{ method: "updateUser", args: [{ password: "secret123" }] }]);

    const offline = fakeAuth({ updateUser: new Error("Network request failed") });
    assert.equal((await updatePassword(offline.client, "secret123", "secret123")).success, false);
    assert.equal((await updatePassword(null, "secret123", "secret123")).success, false);
  });
});
