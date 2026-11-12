 

import {
  computeTotals,
  parseCents,
  validateForDraft,
  validateForSubmit,
  type ReceiptDraft,
  type ReceiptRecord,
  type ReceiptStatus,
} from "@/lib/receipt-form";
import { SUPABASE } from "@/lib/supabase";

export type SaveReceiptResult =
  | { status: "ok"; receipt: ReceiptRecord }
  | { status: "error"; message: string };

export type DeleteReceiptResult =
  | { status: "ok" }
  | { status: "error"; message: string };

/**
 * Validates and saves a receipt for a group.
 * @param groupId The group the receipt belongs to
 * @param draft The receipt as entered in the form
 * @param status Save as a draft or submit
 * @param options Save options
 * @param options.existingId Id of the saved draft being edited, if any
 * @returns The saved receipt, or an error message
 */
export async function saveReceipt(
  groupId: string,
  draft: ReceiptDraft,
  status: ReceiptStatus,
  options?: {
    existingId?: string;
  }
): Promise<SaveReceiptResult> {
  const problem =
    status === "submitted" ? validateForSubmit(draft) : validateForDraft(draft);
  if (problem !== null) return { status: "error", message: problem };

  if (!SUPABASE) {
      return {
        status: "error",
        message: "Supabase client is not configured.",
      };
    }

    try {
      const {
        data: { user },
      } = await SUPABASE.auth.getUser();
      if (!user) {
        return {
          status: "error",
          message: "Please sign in to save a receipt.",
        };
      }

      const totalCents = computeTotals(draft).totalCents;

      if (options?.existingId !== undefined) {
        const existingId = options.existingId;
        const updatePayload: Record<string, unknown> = {
          title: draft.store.trim(),
          // eslint-disable-next-line @typescript-eslint/naming-convention
          total_cents: totalCents,
          status,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          draft_data: status === "draft" ? draft : null,
        };

        const { data: updatedReceipt, error: updateError } = await SUPABASE
          .from("receipts")
          .update(updatePayload)
          .eq("id", existingId)
          .eq("group_id", groupId)
          .select("id, title, total_cents, status, created_at, draft_data")
          .single();

        if (updateError || !updatedReceipt) {
          return {
            status: "error",
            message: updateError?.message || "Failed to update receipt.",
          };
        }

        if (status === "submitted") {
          const validItems = draft.items
            .filter((i) => i.name.trim() && i.price.trim())
            .map((i) => ({
              // eslint-disable-next-line @typescript-eslint/naming-convention
              receipt_id: existingId,
              name: i.name.trim(),
              // eslint-disable-next-line @typescript-eslint/naming-convention
              amount_cents: parseCents(i.price) ?? 0,
            }));

          if (validItems.length > 0) {
            await SUPABASE.from("receipt_items").insert(validItems);
          }
        }

        return {
          status: "ok",
          receipt: {
            id: updatedReceipt.id,
            title: updatedReceipt.title,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            total_cents: updatedReceipt.total_cents,
            status: updatedReceipt.status as ReceiptStatus,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            created_at: updatedReceipt.created_at,
            draft: (updatedReceipt.draft_data as ReceiptDraft) || undefined,
          },
        };
      }

      // Insert new receipt
      const { data: newReceipt, error: insertError } = await SUPABASE
        .from("receipts")
        .insert({
          // eslint-disable-next-line @typescript-eslint/naming-convention
          group_id: groupId,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          created_by: user.id,
          title: draft.store.trim(),
          // eslint-disable-next-line @typescript-eslint/naming-convention
          total_cents: totalCents,
          status,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          draft_data: status === "draft" ? draft : null,
        })
        .select("id, title, total_cents, status, created_at, draft_data")
        .single();

      if (insertError || !newReceipt) {
        return {
          status: "error",
          message: insertError?.message || "Failed to save receipt.",
        };
      }

      if (status === "submitted") {
        const validItems = draft.items
          .filter((i) => i.name.trim() && i.price.trim())
          .map((i) => ({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            receipt_id: newReceipt.id,
            name: i.name.trim(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            amount_cents: parseCents(i.price) ?? 0,
          }));

        if (validItems.length > 0) {
          await SUPABASE.from("receipt_items").insert(validItems);
        }
      }

      return {
        status: "ok",
        receipt: {
          id: newReceipt.id,
          title: newReceipt.title,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          total_cents: newReceipt.total_cents,
          status: newReceipt.status as ReceiptStatus,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          created_at: newReceipt.created_at,
          draft: (newReceipt.draft_data as ReceiptDraft) || undefined,
        },
      };
    } catch (err: unknown) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : "Network error occurred.",
      };
    }
}

/**
 * Deletes a saved draft from a group. Submitted receipts cannot be deleted.
 * @param groupId The group the draft belongs to
 * @param receiptId The draft to delete
 * @returns Ok, or an error message
 */
export async function deleteReceipt(
  groupId: string,
  receiptId: string
): Promise<DeleteReceiptResult> {
  if (!SUPABASE) {
    return {
      status: "error",
      message: "Supabase client is not configured.",
    };
  }
  try {
    const { error } = await SUPABASE
      .from("receipts")
      .delete()
      .eq("id", receiptId)
      .eq("group_id", groupId)
      .eq("status", "draft");

    if (error) {
      return {
        status: "error",
        message: error.message || "Failed to delete receipt draft.",
      };
    }
    return { status: "ok" };
  } catch (err: unknown) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Network error occurred.",
    };
  }
}