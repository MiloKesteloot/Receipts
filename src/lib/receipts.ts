 

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

export type DeleteReceiptResult =
  | { status: "ok" }
  | { status: "error"; message: string };

/**
 * Source of ids for receipts created in mock mode.
 */
const RECEIPT_COUNTER = { next: 1 };

/**
 * Validates and saves a receipt for a group.
 * In mock mode a new receipt goes to the front of the group's list, and an
 * edited draft replaces the original in place. The list is always replaced
 * with a new array instead of being changed in place.
 * Server saving is not set up yet.
 * @param groupId The group the receipt belongs to
 * @param draft The receipt as entered in the form
 * @param status Save as a draft or submit
 * @param options Save options
 * @param options.useMock True to save into the local mock data
 * @param options.existingId Id of the saved draft being edited, if any
 * @returns The saved receipt, or an error message
 */
export async function saveReceipt(
  groupId: string,
  draft: ReceiptDraft,
  status: ReceiptStatus,
  options: { useMock: boolean; existingId?: string }
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

  if (options.existingId !== undefined) {
    const existing = detail.receipts.find((r) => r.id === options.existingId);
    if (!existing) return { status: "error", message: "Receipt not found." };
    if (existing.status !== "draft") {
      return { status: "error", message: "Only drafts can be edited." };
    }
    const updated = buildReceipt(
      existing.id,
      draft,
      status,
      existing.created_at
    );
    detail.receipts = detail.receipts.map((r) =>
      r.id === existing.id ? updated : r
    );
    return { status: "ok", receipt: updated };
  }

  const receipt = buildReceipt(
    `mock-receipt-${RECEIPT_COUNTER.next}`,
    draft,
    status,
    new Date().toISOString()
  );
  RECEIPT_COUNTER.next += 1;
  detail.receipts = [receipt, ...detail.receipts];

  return { status: "ok", receipt };
}

/**
 * Deletes a saved draft from a group. Submitted receipts cannot be deleted.
 * Server deleting is not set up yet.
 * @param groupId The group the draft belongs to
 * @param receiptId The draft to delete
 * @param options Delete options
 * @param options.useMock True to delete from the local mock data
 * @returns Ok, or an error message
 */
export async function deleteReceipt(
  groupId: string,
  receiptId: string,
  options: { useMock: boolean }
): Promise<DeleteReceiptResult> {
  if (!options.useMock) {
    return {
      status: "error",
      message: "Deleting receipts on the server is not set up yet.",
    };
  }

  const detail: MockGroupDetail | undefined = mockGroupDetails[groupId];
  if (!detail) return { status: "error", message: "Group not found." };

  const existing = detail.receipts.find((r) => r.id === receiptId);
  if (!existing) return { status: "error", message: "Receipt not found." };
  if (existing.status !== "draft") {
    return { status: "error", message: "Only drafts can be deleted." };
  }

  detail.receipts = detail.receipts.filter((r) => r.id !== receiptId);
  return { status: "ok" };
}