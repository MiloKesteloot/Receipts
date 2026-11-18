/// <reference types="node" />
/* eslint-disable @typescript-eslint/naming-convention -- RPC argument names */
/**
 * User Story 3.5, Task 1: registering a device for Pay me pushes, removing it
 * on sign-out, and opening the receipt when a notification is tapped.
 *
 * Run with:
 *   node --experimental-strip-types --import ./tests/register-aliases.ts --test tests/unit/push-registration.test.ts
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  receiptRouteForTap,
  registerForPushNotifications,
  removePushToken,
  savePushToken,
  type PushRegistrationDeps,
  type PushTokenClient,
} from "@/lib/push-registration";

/** A well-formed Expo push token. */
const TOKEN = "ExponentPushToken[abc123]";
/** expo-notifications' DEFAULT_ACTION_IDENTIFIER (a plain tap). */
const TAP = "expo.modules.notifications.actions.DEFAULT";

type RpcAnswer = { data: unknown; error: { message: string } | null };

/**
 * Fake device whose steps are recorded in order.
 * @param overrides Changes from a physical Android phone that grants permission
 * @returns The deps and the steps taken
 */
function fakeDevice(overrides: Partial<PushRegistrationDeps> = {}): {
  deps: PushRegistrationDeps;
  steps: string[];
} {
  const steps: string[] = [];
  const deps: PushRegistrationDeps = {
    platform: "android",
    isDevice: true,
    projectId: "project-1",
    createAndroidChannel: async () => {
      steps.push("channel");
    },
    hasPermission: async () => {
      steps.push("check");
      return false;
    },
    requestPermission: async () => {
      steps.push("ask");
      return true;
    },
    getExpoPushToken: async (projectId) => {
      steps.push(`token:${projectId}`);
      return TOKEN;
    },
    saveToken: async (token, platform) => {
      steps.push(`save:${token}:${platform}`);
      return { ok: true };
    },
    ...overrides,
  };
  return { deps, steps };
}

/**
 * A fake client whose rpc records calls.
 * @param answer What every rpc answers
 * @returns The client and its calls
 */
function fakeRpc(answer: RpcAnswer): {
  client: PushTokenClient;
  calls: [string, Record<string, unknown>][];
} {
  const calls: [string, Record<string, unknown>][] = [];
  return {
    calls,
    client: {
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        return answer;
      },
    },
  };
}

describe("User Story 3.5 Task 1: push registration", () => {
  test("US-3.5-T-1: AC1 a physical Android phone creates the channel, asks permission, then registers its token", async () => {
    const { deps, steps } = fakeDevice();
    assert.deepEqual(await registerForPushNotifications(deps), {
      status: "registered",
      token: TOKEN,
    });
    assert.deepEqual(steps, ["channel", "check", "ask", "token:project-1", `save:${TOKEN}:android`]);
  });

  test("US-3.5-T-1: AC1 iOS skips the channel and doesn't re-ask once permission is granted", async () => {
    const { deps, steps } = fakeDevice({
      platform: "ios",
      hasPermission: async () => true,
    });
    assert.equal((await registerForPushNotifications(deps)).status, "registered");
    assert.ok(!steps.includes("channel"));
    assert.ok(!steps.includes("ask"));
    assert.deepEqual(steps.at(-1), `save:${TOKEN}:ios`);
  });

  test("US-3.5-T-1: AC1 web, simulators, denied permission and a missing project id skip without error", async () => {
    const web = fakeDevice({ platform: "web" });
    assert.deepEqual(await registerForPushNotifications(web.deps), {
      status: "skipped",
      reason: "unsupported_platform",
    });
    assert.deepEqual(web.steps, []);

    const simulator = fakeDevice({ isDevice: false });
    assert.deepEqual(await registerForPushNotifications(simulator.deps), {
      status: "skipped",
      reason: "not_device",
    });

    const denied = fakeDevice({ requestPermission: async () => false });
    assert.deepEqual(await registerForPushNotifications(denied.deps), {
      status: "skipped",
      reason: "permission_denied",
    });
    assert.ok(!denied.steps.some((s) => s.startsWith("save")));

    const noProject = fakeDevice({ projectId: undefined });
    assert.deepEqual(await registerForPushNotifications(noProject.deps), {
      status: "skipped",
      reason: "no_project_id",
    });

    const offline = fakeDevice({
      getExpoPushToken: async () => Promise.reject(new Error("offline")),
    });
    assert.deepEqual(await registerForPushNotifications(offline.deps), {
      status: "error",
      message: "offline",
    });
  });

  test("US-3.5-T-1: AC1 the token is saved with register_push_token and removed on sign-out", async () => {
    const saved = fakeRpc({ data: { success: true }, error: null });
    assert.deepEqual(await savePushToken(TOKEN, "ios", saved.client), { ok: true });
    assert.deepEqual(saved.calls, [["register_push_token", { p_token: TOKEN, p_platform: "ios" }]]);

    const rejected = fakeRpc({ data: { success: false, message: "bad token" }, error: null });
    assert.deepEqual(await savePushToken(TOKEN, "ios", rejected.client), {
      ok: false,
      message: "bad token",
    });

    const removed = fakeRpc({ data: { success: true }, error: null });
    assert.equal(await removePushToken(TOKEN, removed.client), true);
    assert.deepEqual(removed.calls, [["unregister_push_token", { p_token: TOKEN }]]);

    const never = fakeRpc({ data: null, error: null });
    assert.equal(await removePushToken(null, never.client), false);
    assert.deepEqual(never.calls, []);
  });

  test("US-3.5-T-1: AC6 tapping a Pay me notification opens its receipt", () => {
    const receiptId = "11111111-1111-1111-1111-111111111111";
    const tapped = (data: unknown, actionIdentifier = TAP) => ({
      actionIdentifier,
      notification: { request: { content: { data } } },
    });

    assert.equal(
      receiptRouteForTap(tapped({ receiptId, url: `/receipts/${receiptId}` }), TAP),
      `/(app)/(home)/receipts/${receiptId}`
    );
    assert.equal(receiptRouteForTap(tapped({ receiptId }, "some-other-action"), TAP), null);
    assert.equal(receiptRouteForTap(tapped({}), TAP), null);
    assert.equal(receiptRouteForTap(tapped({ receiptId: "../../evil" }), TAP), null);
    assert.equal(receiptRouteForTap(tapped(null), TAP), null);
    assert.equal(receiptRouteForTap(null, TAP), null);
  });
});
