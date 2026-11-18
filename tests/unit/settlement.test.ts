/// <reference types="node" />
/**
 * User Story 3.4, Task 1: settlement status for finalized receipts.
 * Pure functions only, so no Supabase client is needed.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { guestClaimKey } from "@/lib/claims";
import type { FinalSplit, PersonShare } from "@/lib/finalize-split";
import {
  computeSettlement,
  shareActions,
  type PaymentRecord,
  type PaymentState,
  type SettlementPerson,
  type ShareStatus,
} from "@/lib/settlement";

/** The uploader in these tests. */
const UPLOADER = "u-alex";

/** A guest's claim key. */
const CASEY = guestClaimKey("Casey");

/**
 * Builds a person's share where everything is in `totalCents`.
 * @param userId The person's key
 * @param totalCents What they owe
 * @param guestName The guest's name, for guests
 * @returns The share
 */
function person(userId: string, totalCents: number, guestName?: string): PersonShare {
  const share: PersonShare = {
    userId,
    itemsCents: totalCents,
    taxCents: 0,
    tipCents: 0,
    totalCents,
  };
  if (guestName !== undefined) share.guestName = guestName;
  return share;
}

/**
 * Builds a split from people's shares.
 * @param people The shares
 * @returns The split
 */
function split(people: PersonShare[]): FinalSplit {
  const total = people.reduce((sum, p) => sum + p.totalCents, 0);
  return { subtotalCents: total, taxCents: 0, tipCents: 0, totalCents: total, people };
}

/**
 * Builds a payment record.
 * @param payerKey Who it's for
 * @param state Its state
 * @returns The record
 */
function payment(payerKey: string, state: PaymentState): PaymentRecord {
  return { payerKey, state, markedPaidAt: null, respondedAt: null };
}

/**
 * Builds a settlement person.
 * @param userId Their key
 * @param status Their status
 * @param owesCents What they owe
 * @returns The person
 */
function share(userId: string, status: ShareStatus, owesCents = 1000): SettlementPerson {
  return { userId, status, owesCents };
}

/** Alex (uploader) $10, Blake $15, Casey (guest) $5, Dana $0. */
const SPLIT = split([
  person("u-blake", 1500),
  person(UPLOADER, 1000),
  person("u-dana", 0),
  person(CASEY, 500, "Casey"),
]);

describe("computeSettlement", () => {
  test("US-3.4-T-1: each person gets a status from the uploader, $0 shares, or their payment", () => {
    const result = computeSettlement(SPLIT, [payment("u-blake", "paid")], UPLOADER);
    assert.deepEqual(result.people, [
      { userId: "u-blake", owesCents: 1500, status: "paid" },
      { userId: UPLOADER, owesCents: 1000, status: "uploader" },
      { userId: "u-dana", owesCents: 0, status: "nothing_owed" },
      { userId: CASEY, guestName: "Casey", owesCents: 500, status: "unpaid" },
    ]);

    const rejected = computeSettlement(SPLIT, [payment("u-blake", "not_received")], UPLOADER);
    assert.equal(rejected.people[0].status, "not_received");
  });

  test("US-3.4-T-1: settled only once every other share is confirmed", () => {
    const none = computeSettlement(SPLIT, [], UPLOADER);
    assert.equal(none.settled, false);
    assert.equal(none.outstandingCount, 2);
    assert.equal(none.outstandingCents, 2000);

    const partly = computeSettlement(
      SPLIT,
      [payment("u-blake", "confirmed"), payment(CASEY, "not_received")],
      UPLOADER
    );
    assert.equal(partly.settled, false);
    assert.equal(partly.outstandingCount, 1);
    assert.equal(partly.outstandingCents, 500);

    const paidNotConfirmed = computeSettlement(
      SPLIT,
      [payment("u-blake", "confirmed"), payment(CASEY, "paid")],
      UPLOADER
    );
    assert.equal(paidNotConfirmed.settled, false);

    const all = computeSettlement(
      SPLIT,
      [payment("u-blake", "confirmed"), payment(CASEY, "confirmed")],
      UPLOADER
    );
    assert.equal(all.settled, true);
    assert.equal(all.outstandingCount, 0);
    assert.equal(all.outstandingCents, 0);
  });

  test("US-3.4-T-1: a receipt with only the uploader's share is settled", () => {
    const result = computeSettlement(split([person(UPLOADER, 2600)]), [], UPLOADER);
    assert.equal(result.settled, true);
    assert.deepEqual(result.people, [{ userId: UPLOADER, owesCents: 2600, status: "uploader" }]);
  });

  test("US-3.4-T-1: unknown payers are ignored, duplicates use the last record, guests match by key", () => {
    const result = computeSettlement(
      SPLIT,
      [
        payment("u-stranger", "confirmed"),
        payment("u-blake", "paid"),
        payment("u-blake", "confirmed"),
        payment(guestClaimKey(" CASEY "), "confirmed"),
        // A record for the uploader doesn't change their status.
        payment(UPLOADER, "paid"),
      ],
      UPLOADER
    );
    assert.equal(result.people.length, 4);
    assert.equal(result.people[0].status, "confirmed");
    assert.equal(result.people[1].status, "uploader");
    assert.equal(result.people[3].status, "confirmed");
    assert.equal(result.settled, true);
  });
});

describe("shareActions", () => {
  const blake = { userId: "u-blake", isUploader: false };
  const alex = { userId: UPLOADER, isUploader: true };

  test("US-3.4-T-1: a member can mark only their own unpaid or not-received share as paid", () => {
    assert.deepEqual(shareActions(share("u-blake", "unpaid"), blake), {
      markPaid: true,
      confirm: false,
      notReceived: false,
    });
    assert.equal(shareActions(share("u-blake", "not_received"), blake).markPaid, true);
    assert.equal(shareActions(share("u-blake", "paid"), blake).markPaid, false);
    assert.equal(shareActions(share("u-blake", "confirmed"), blake).markPaid, false);
    // Someone else's share.
    assert.equal(shareActions(share("u-dana", "unpaid"), blake).markPaid, false);
    // Signed out.
    assert.equal(
      shareActions(share("u-blake", "unpaid"), { userId: undefined, isUploader: false }).markPaid,
      false
    );
  });

  test("US-3.4-T-1: the uploader never marks their own share", () => {
    assert.deepEqual(shareActions(share(UPLOADER, "uploader"), alex), {
      markPaid: false,
      confirm: false,
      notReceived: false,
    });
    // Even if the status were somehow outstanding.
    assert.equal(shareActions(share(UPLOADER, "unpaid"), alex).markPaid, false);
  });

  test("US-3.4-T-1: the uploader can confirm or reject a paid share and confirm guests directly", () => {
    assert.deepEqual(shareActions(share("u-blake", "paid"), alex), {
      markPaid: false,
      confirm: true,
      notReceived: true,
    });
    // A member who hasn't marked paid yet: nothing to respond to.
    assert.deepEqual(shareActions(share("u-blake", "unpaid"), alex), {
      markPaid: false,
      confirm: false,
      notReceived: false,
    });
    assert.deepEqual(shareActions(share(CASEY, "unpaid"), alex), {
      markPaid: false,
      confirm: true,
      notReceived: false,
    });
    assert.equal(shareActions(share(CASEY, "not_received"), alex).confirm, true);
  });

  test("US-3.4-T-1: no actions on confirmed or $0 shares, or for other members", () => {
    const none = { markPaid: false, confirm: false, notReceived: false };
    assert.deepEqual(shareActions(share("u-blake", "confirmed"), alex), none);
    assert.deepEqual(shareActions(share("u-dana", "nothing_owed", 0), alex), none);
    assert.deepEqual(shareActions(share("u-dana", "nothing_owed", 0), { userId: "u-dana", isUploader: false }), none);
    assert.deepEqual(shareActions(share("u-dana", "paid"), blake), none);
    assert.deepEqual(shareActions(share(CASEY, "unpaid"), blake), none);
  });
});
