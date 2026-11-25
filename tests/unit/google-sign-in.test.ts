/// <reference types="node" />
import assert from "node:assert/strict";
import test, { beforeEach, describe } from "node:test";
import type { Session } from "@supabase/supabase-js";

import {
  fetchOAuthProviderEnabled,
  isOAuthProviderEnabled,
  signInWithOAuthProvider,
  toAuthFailure,
  type AuthClient,
  type CheckOAuthProvider,
  type FetchLike,
  type OpenAuthSession,
} from "../../src/lib/auth";

/**
 * A signed-in session as Supabase would return it (only the fields we read).
 */
const SESSION = { user: { id: "user-1", email: "a@gmail.com" } } as unknown as Session;

/**
 * Deep link the app asks Google to redirect back to.
 */
const REDIRECT = "receipts://sign-in";

/**
 * Supabase project URL used by the provider check tests.
 */
const PROJECT_URL = "https://project.supabase.co";

/**
 * Message shown when Google is turned off in Supabase.
 */
const GOOGLE_OFF = "Google sign-in isn't turned on yet. Sign in with email for now.";

/**
 * Builds a fake Supabase auth client that records the methods called.
 * @param calls Receives each method name as it is called
 * @returns Fake client
 */
function fakeClient(calls: string[]): AuthClient {
  return {
    signInWithOAuth: async () => {
      calls.push("signInWithOAuth");
      return { data: { provider: "google", url: "https://auth.example/google" }, error: null };
    },
    exchangeCodeForSession: async () => {
      calls.push("exchangeCodeForSession");
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    },
  } as unknown as AuthClient;
}

/**
 * Builds a fake `fetch` for the settings endpoint.
 * @param respond Returns the response, or throws to simulate being offline
 * @param requests Receives each URL and headers requested
 * @returns Fake fetch
 */
function fakeFetch(
  respond: () => { ok: boolean; body: unknown },
  requests: { url: string; headers: Record<string, string> }[] = []
): FetchLike {
  return async (url, init) => {
    requests.push({ url, headers: init.headers });
    const { ok, body } = respond();
    return {
      ok,
      json: async () => {
        if (body instanceof Error) throw body;
        return body;
      },
    };
  };
}

describe("User Story 4.2: Sign in with Google", () => {
  let calls: string[];
  let opened: string[];
  let client: AuthClient;
  let browserResult: Awaited<ReturnType<OpenAuthSession>>;

  /**
   * Fake browser that records what it opened.
   * @param url Page to open
   * @returns The canned browser result
   */
  const openAuthSession: OpenAuthSession = async (url) => {
    opened.push(url);
    return browserResult;
  };

  beforeEach(() => {
    calls = [];
    opened = [];
    client = fakeClient(calls);
    browserResult = { type: "success", url: `${REDIRECT}?code=google-code` };
  });

  test("US-4.2-T-1: shows a clear message and opens no browser when Google is turned off", async () => {
    const checkProvider: CheckOAuthProvider = async () => false;
    const result = await signInWithOAuthProvider(
      client,
      "google",
      REDIRECT,
      openAuthSession,
      checkProvider
    );

    assert.deepEqual(result, { success: false, error: "PROVIDER_DISABLED", message: GOOGLE_OFF });
    assert.deepEqual(opened, []);
    assert.deepEqual(calls, []);
  });

  test("US-4.2-T-1: reads a turned-off Google from Supabase's settings", async () => {
    const requests: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = fakeFetch(
      () => ({ ok: true, body: { external: { email: true, google: false, apple: false } } }),
      requests
    );

    const enabled = await fetchOAuthProviderEnabled(fetchImpl, `${PROJECT_URL}/`, "pk", "google");

    assert.equal(enabled, false);
    assert.deepEqual(requests, [
      { url: `${PROJECT_URL}/auth/v1/settings`, headers: { apikey: "pk" } },
    ]);
  });

  test("US-4.2-T-1: names Apple in the message when Apple's web sign-in is turned off", async () => {
    const result = await signInWithOAuthProvider(
      client,
      "apple",
      REDIRECT,
      openAuthSession,
      async () => false
    );
    assert.equal(result.success, false);
    if (!result.success) assert.match(result.message, /^Apple sign-in isn't turned on yet/);
  });

  test("US-4.2-T-1: opens Google's page and signs in when Google is turned on", async () => {
    const result = await signInWithOAuthProvider(
      client,
      "google",
      REDIRECT,
      openAuthSession,
      async () => true
    );

    assert.deepEqual(result, { success: true, session: SESSION });
    assert.deepEqual(opened, ["https://auth.example/google"]);
    assert.deepEqual(calls, ["signInWithOAuth", "exchangeCodeForSession"]);
  });

  test("US-4.2-T-1: reads a turned-on Google from Supabase's settings", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: true, body: { external: { google: true } } }));
    assert.equal(await fetchOAuthProviderEnabled(fetchImpl, PROJECT_URL, "pk", "google"), true);
  });

  test("US-4.2-T-1: still opens Google's page when the provider check can't tell", async () => {
    const unknownChecks: CheckOAuthProvider[] = [
      async () => null,
      async () => {
        throw new Error("offline");
      },
      () => {
        throw new Error("thrown before a promise");
      },
    ];
    for (const checkProvider of unknownChecks) {
      opened = [];
      const result = await signInWithOAuthProvider(
        client,
        "google",
        REDIRECT,
        openAuthSession,
        checkProvider
      );
      assert.equal(result.success, true);
      assert.deepEqual(opened, ["https://auth.example/google"]);
    }
  });

  test("US-4.2-T-1: the settings check returns null when offline, on a server error, or on an odd response", async () => {
    const offline: FetchLike = async () => {
      throw new TypeError("Network request failed");
    };
    const cases: FetchLike[] = [
      offline,
      fakeFetch(() => ({ ok: false, body: { external: { google: false } } })),
      fakeFetch(() => ({ ok: true, body: new Error("not JSON") })),
      fakeFetch(() => ({ ok: true, body: { external: { google: "yes" } } })),
      fakeFetch(() => ({ ok: true, body: null })),
    ];
    for (const fetchImpl of cases) {
      assert.equal(await fetchOAuthProviderEnabled(fetchImpl, PROJECT_URL, "pk", "google"), null);
    }
  });

  test("US-4.2-T-1: isOAuthProviderEnabled only trusts a boolean under external", () => {
    assert.equal(isOAuthProviderEnabled({ external: { google: true } }, "google"), true);
    assert.equal(isOAuthProviderEnabled({ external: { google: false } }, "google"), false);
    assert.equal(isOAuthProviderEnabled({ external: {} }, "google"), null);
    assert.equal(isOAuthProviderEnabled({}, "google"), null);
    assert.equal(isOAuthProviderEnabled("oops", "google"), null);
  });

  test("US-4.2-T-1: turns Supabase's 'provider is not enabled' error into a clear message", () => {
    const failure = toAuthFailure({
      code: "validation_failed",
      message: "Unsupported provider: provider is not enabled",
    });

    assert.equal(failure.error, "PROVIDER_DISABLED");
    assert.equal(failure.message, "This sign-in method isn't turned on yet. Sign in with email for now.");
    assert.doesNotMatch(failure.message, /Unsupported provider/);
  });

  test("US-4.2-T-1: closing Google's page is a quiet cancel, not an error", async () => {
    for (const type of ["cancel", "dismiss"]) {
      browserResult = { type };
      const result = await signInWithOAuthProvider(
        client,
        "google",
        REDIRECT,
        openAuthSession,
        async () => true
      );
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.error, "CANCELLED");
    }
    assert.equal(calls.includes("exchangeCodeForSession"), false);
  });
});
