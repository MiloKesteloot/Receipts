 

import { mockGroupDetails, type MockGroupDetail } from "@/lib/mock";
import {
    buildReceipt,
    validateForDraft,
    validateForSubmit,
    type ReceiptDraft,
    type ReceiptRecord,
    type ReceiptStatus,
} from "@/lib/receipt-form";

export type SaveReceiptResult =
  | { status: "ok"; receipt: ReceiptRecord }
  | { status: "error"; message: string };

/**
 * Source of ids for receipts created in mock mode.
 */
const RECEIPT_COUNTER = { next: 1 };

/**
 * Validates and saves a receipt for a group.
 * In mock mode the receipt is added to the front of the group's list.
 * Server saving is not set up yet.
 * @param groupId The group the receipt belongs to
 * @param draft The receipt as entered in the form
 * @param status Save as a draft or submit
 * @param options Save options
 * @param options.useMock True to save into the local mock data
 * @returns The saved receipt, or an error message
 */
export async function saveReceipt(
  groupId: string,
  draft: ReceiptDraft,
  status: ReceiptStatus,
  options: { useMock: boolean }
): Promise<SaveReceiptResult> {
  const problem =
    status === "submitted" ? validateForSubmit(draft) : validateForDraft(draft);
  if (problem !== null) return { status: "error", message: problem };

  if (!options.useMock) {
    return {
      status: "error",
      message: "Saving receipts to the server is not set up yet.",
    };
  }

  const detail: MockGroupDetail | undefined = mockGroupDetails[groupId];
  if (!detail) return { status: "error", message: "Group not found." };

  const receipt = buildReceipt(
    `mock-receipt-${RECEIPT_COUNTER.next}`,
    draft,
    status,
    new Date().toISOString()
  );
  RECEIPT_COUNTER.next += 1;
  detail.receipts.unshift(receipt);

  return { status: "ok", receipt };
}