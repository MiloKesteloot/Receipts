/**
 * User Story 3.4 (Mark paid and confirm), Task 1: who has paid on a finalized
 * receipt, what each person can do next, and whether the receipt is settled.
 *
 * Pure: takes the split from `computeFinalSplit` (US 3.3) and the stored
 * payment records, and never touches the network.
 */

import { isGuestClaimKey } from "@/lib/claims";
import type { FinalSplit } from "@/lib/finalize-split";

/** What is stored for one person's share. */
export type PaymentState = "paid" | "confirmed" | "not_received";

/** One stored payment record. */
export type PaymentRecord = {
  /** A member's user id, or `guestClaimKey(name)` for a guest. */
  payerKey: string;
  state: PaymentState;
  /** When the payer marked it paid, if they did. */
  markedPaidAt: string | null;
  /** When the uploader confirmed it or said it wasn't received. */
  respondedAt: string | null;
};

/** Where one person's share stands. */
export type ShareStatus =
  /** The uploader paid the bill, so their own share is never owed. */
  | "uploader"
  /** A $0 share: nothing to pay. */
  | "nothing_owed"
  | "unpaid"
  /** Marked paid, waiting for the uploader. */
  | "paid"
  /** The uploader said they didn't get it. */
  | "not_received"
  | "confirmed";

/** One person's share and its status. */
export type SettlementPerson = {
  userId: string;
  /** Set only for guests. */
  guestName?: string;
  owesCents: number;
  status: ShareStatus;
};

/** Where the whole receipt stands. */
export type Settlement = {
  /** One entry per person in the split, in the split's order. */
  people: SettlementPerson[];
  /** True once nothing is outstanding. */
  settled: boolean;
  /** How many shares are unpaid, marked paid, or not received. */
  outstandingCount: number;
  /** The total of those shares, in cents. */
  outstandingCents: number;
};

/** What the viewer can do with one share. */
export type ShareActions = {
  markPaid: boolean;
  confirm: boolean;
  notReceived: boolean;
};

/** Who is looking at the receipt. */
export type SettlementViewer = {
  userId: string | undefined;
  isUploader: boolean;
};

/** Statuses that still need something to happen. */
const OUTSTANDING: readonly ShareStatus[] = ["unpaid", "paid", "not_received"];

/** No actions at all. */
const NO_ACTIONS: ShareActions = { markPaid: false, confirm: false, notReceived: false };

/**
 * Whether a share still needs paying or confirming.
 * @param status The share's status
 * @returns True if the share is outstanding
 */
export function isOutstanding(status: ShareStatus): boolean {
  return OUTSTANDING.includes(status);
}

/**
 * Works out each person's payment status on a finalized receipt and whether
 * the receipt is settled.
 * @param split The receipt's final split
 * @param payments Stored payment records for the receipt
 * @param uploaderId The user who uploaded (and paid for) the receipt
 * @returns Everyone's status, what's outstanding, and whether it's settled
 */
export function computeSettlement(
  split: FinalSplit,
  payments: PaymentRecord[],
  uploaderId: string
): Settlement {
  // Later records replace earlier ones for the same payer.
  const stateByPayer = new Map<string, PaymentState>();
  for (const payment of payments) stateByPayer.set(payment.payerKey, payment.state);

  let outstandingCount = 0;
  let outstandingCents = 0;
  const people = split.people.map((person): SettlementPerson => {
    let status: ShareStatus;
    if (person.userId === uploaderId) status = "uploader";
    else if (person.totalCents === 0) status = "nothing_owed";
    else status = stateByPayer.get(person.userId) ?? "unpaid";

    if (isOutstanding(status)) {
      outstandingCount += 1;
      outstandingCents += person.totalCents;
    }

    const entry: SettlementPerson = {
      userId: person.userId,
      owesCents: person.totalCents,
      status,
    };
    if (person.guestName !== undefined) entry.guestName = person.guestName;
    return entry;
  });

  return {
    people,
    settled: outstandingCount === 0,
    outstandingCount,
    outstandingCents,
  };
}

/**
 * What the viewer can do with one person's share: the payer can mark it paid,
 * and the uploader can confirm it or say it wasn't received. Guests can't mark
 * paid in the app, so the uploader can confirm a guest's share directly.
 * @param person The share
 * @param viewer Who is looking
 * @returns Which actions to offer
 */
export function shareActions(
  person: SettlementPerson,
  viewer: SettlementViewer
): ShareActions {
  if (!isOutstanding(person.status) || viewer.userId === undefined) {
    return NO_ACTIONS;
  }

  if (person.userId === viewer.userId) {
    // The uploader's own share is "uploader", so isn't outstanding; this
    // guards against a viewer flagged as uploader some other way.
    if (viewer.isUploader) return NO_ACTIONS;
    return {
      ...NO_ACTIONS,
      markPaid: person.status === "unpaid" || person.status === "not_received",
    };
  }

  if (!viewer.isUploader) return NO_ACTIONS;

  if (person.status === "paid") {
    return { markPaid: false, confirm: true, notReceived: true };
  }
  if (isGuestClaimKey(person.userId)) {
    return { ...NO_ACTIONS, confirm: true };
  }
  return NO_ACTIONS;
}
