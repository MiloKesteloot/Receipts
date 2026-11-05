 

import { JSX, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { palette } from "@/lib/palette";
import { ReceiptCheckVerdict } from "@/components/receipt-check-verdict";
import {
  computeTotals,
  createEmptyItem,
  formatCents,
  type ReceiptDraft,
  type ReceiptItemDraft,
} from "@/lib/receipt-form";
import type { ReceiptCheck } from "@/lib/scan-receipt";

type SaveHandler = (draft: ReceiptDraft) => Promise<string | null>;

type AddReceiptModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Resolves to an error message, or null when the receipt was saved. */
  onSubmit: SaveHandler;
  /** Resolves to an error message, or null when the draft was saved. */
  onSaveDraft: SaveHandler;
  /** Called after the user confirms Delete. */
  onDelete: () => Promise<void>;
  /** Saved values when editing a draft, or null for a new receipt. */
  initialDraft?: ReceiptDraft | null;
  /** Optional heading override, such as the scanned receipt review heading. */
  title?: string;
  /** Total check to show below a scanned draft's live totals. */
  scanCheck?: { check: ReceiptCheck; currency: string | null } | null;
  /** Overall scan confidence used to highlight fields that need checking. */
  scanConfidence?: number | null;
  /** Scanner notes about fields that need a manual fix. */
  scanNotes?: string[];
};

/**
 * Form for entering a receipt: store, items with prices, tax and tip.
 * Shows a live total and has Submit, Save draft and Delete buttons.
 * Delete asks for a second press before clearing the form.
 * @param props Component props
 * @param props.visible Whether the modal is open
 * @param props.onClose Called when the user closes the modal
 * @param props.onSubmit Called with the entered receipt on Submit
 * @param props.onSaveDraft Called with the entered receipt on Save draft
 * @param props.onDelete Called after the user confirms Delete
 * @param props.initialDraft Saved values when editing a draft
 * @param props.title Optional heading override
 * @param props.scanCheck Optional scanned total verdict
 * @param props.scanConfidence Overall scanner confidence
 * @param props.scanNotes Scanner notes about fields that need a manual fix
 * @returns JSX element
 */
export function AddReceiptModal({
  visible,
  onClose,
  onSubmit,
  onSaveDraft,
  onDelete,
  initialDraft = null,
  title,
  scanCheck = null,
  scanConfidence = null,
  scanNotes = [],
}: AddReceiptModalProps): JSX.Element {
  const initialItems: ReceiptItemDraft[] =
    initialDraft !== null && initialDraft.items.length > 0
      ? initialDraft.items.map((item, i) => ({ ...item, id: `item-${i + 1}` }))
      : [createEmptyItem("item-1")];
  const nextId = useRef(initialItems.length + 1);
  const [store, setStore] = useState(initialDraft?.store ?? "");
  const [items, setItems] = useState<ReceiptItemDraft[]>(initialItems);
  const [tax, setTax] = useState(initialDraft?.tax ?? "");
  const [tip, setTip] = useState(initialDraft?.tip ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const totals = computeTotals({ store, items, tax, tip });
  const lowConfidence = scanConfidence !== null && scanConfidence < 0.8;

  const resetForm = () => {
    nextId.current = 2;
    setStore("");
    setItems([createEmptyItem("item-1")]);
    setTax("");
    setTip("");
    setFormError(null);
    setConfirmingDelete(false);
  };

  const addItem = () => {
    const id = `item-${nextId.current}`;
    nextId.current += 1;
    setItems((prev) => [...prev, createEmptyItem(id)]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: "name" | "price", value: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleClose = () => {
    setConfirmingDelete(false);
    onClose();
  };

  const runSave = async (action: SaveHandler) => {
    if (saving) return;
    setConfirmingDelete(false);
    setFormError(null);
    setSaving(true);
    const message = await action({ store, items, tax, tip });
    setSaving(false);
    if (message === null) resetForm();
    else setFormError(message);
  };

  const handleDelete = async () => {
    if (saving) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    resetForm();
    await onDelete();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={STYLES.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={STYLES.topBar}>
          <Text style={STYLES.heading}>
            {title ?? (initialDraft !== null ? "Edit draft" : "New receipt")}
          </Text>
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Text style={STYLES.closeText}>Close</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={STYLES.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={STYLES.sectionLabel}>Store</Text>
          <TextInput
            value={store}
            onChangeText={setStore}
            accessibilityLabel="Store"
            placeholder="Where was this?"
            placeholderTextColor={palette.muted}
            style={[STYLES.input, lowConfidence && STYLES.lowConfidenceInput]}
          />

          {lowConfidence ? (
            <Text style={STYLES.confidenceWarning}>
              Some scanned fields may need checking.
            </Text>
          ) : null}

          {scanNotes.map((note) => (
            <Text key={note} style={STYLES.confidenceWarning}>
              {note}
            </Text>
          ))}

          <Text style={STYLES.sectionLabel}>Items</Text>
          <View style={STYLES.card}>
            {items.map((item, i) => (
              <View
                key={item.id}
                style={[STYLES.itemRow, i > 0 && STYLES.divider]}
              >
                <TextInput
                  value={item.name}
                  onChangeText={(text) => updateItem(item.id, "name", text)}
                  accessibilityLabel={`Item ${i + 1} name`}
                  placeholder="Item"
                  placeholderTextColor={palette.muted}
                  style={[
                    STYLES.input,
                    STYLES.itemName,
                    lowConfidence && STYLES.lowConfidenceInput,
                  ]}
                />
                <TextInput
                  value={item.price}
                  onChangeText={(text) => updateItem(item.id, "price", text)}
                  accessibilityLabel={`Item ${i + 1} price`}
                  placeholder="0.00"
                  placeholderTextColor={palette.muted}
                  keyboardType="decimal-pad"
                  style={[
                    STYLES.input,
                    STYLES.itemPrice,
                    lowConfidence && STYLES.lowConfidenceInput,
                  ]}
                />
                {items.length > 1 ? (
                  <Pressable
                    onPress={() => removeItem(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove item ${i + 1}`}
                    hitSlop={8}
                  >
                    <Text style={STYLES.removeText}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>

          <Pressable
            onPress={addItem}
            accessibilityRole="button"
            accessibilityLabel="Add item"
            style={({ pressed }) => [
              STYLES.addItemButton,
              pressed && STYLES.pressed,
            ]}
          >
            <Text style={STYLES.addItemText}>+ Add item</Text>
          </Pressable>

          <Text style={STYLES.sectionLabel}>Tax and tip</Text>
          <View style={STYLES.taxRow}>
            <TextInput
              value={tax}
              onChangeText={setTax}
              accessibilityLabel="Tax"
              placeholder="Tax"
              placeholderTextColor={palette.muted}
              keyboardType="decimal-pad"
              style={[STYLES.input, STYLES.taxInput, lowConfidence && STYLES.lowConfidenceInput]}
            />
            <TextInput
              value={tip}
              onChangeText={setTip}
              accessibilityLabel="Tip"
              placeholder="Tip"
              placeholderTextColor={palette.muted}
              keyboardType="decimal-pad"
              style={[STYLES.input, STYLES.taxInput, lowConfidence && STYLES.lowConfidenceInput]}
            />
          </View>

          {totals.invalid ? (
            <Text style={STYLES.error}>
              Check amounts: use numbers like 12.50.
            </Text>
          ) : null}

          <View style={STYLES.card}>
            <View style={STYLES.summaryRow}>
              <Text style={STYLES.summaryLabel}>Subtotal</Text>
              <Text style={STYLES.summaryValue}>
                {formatCents(totals.subtotalCents)}
              </Text>
            </View>
            <View style={[STYLES.summaryRow, STYLES.divider]}>
              <Text style={STYLES.summaryLabel}>Tax</Text>
              <Text style={STYLES.summaryValue}>
                {formatCents(totals.taxCents)}
              </Text>
            </View>
            <View style={[STYLES.summaryRow, STYLES.divider]}>
              <Text style={STYLES.summaryLabel}>Tip</Text>
              <Text style={STYLES.summaryValue}>
                {formatCents(totals.tipCents)}
              </Text>
            </View>
            <View style={[STYLES.summaryRow, STYLES.divider]}>
              <Text style={STYLES.totalLabel}>Total</Text>
              <Text style={STYLES.totalValue} testID="receipt-total">
                {formatCents(totals.totalCents)}
              </Text>
            </View>
          </View>

          {scanCheck ? (
            <ReceiptCheckVerdict
              check={scanCheck.check}
              currency={scanCheck.currency}
            />
          ) : null}
        </ScrollView>

        <View style={STYLES.footer}>
          {confirmingDelete ? (
            <Text style={STYLES.confirmText}>
              Press Confirm delete to discard this receipt.
            </Text>
          ) : null}
          {formError ? <Text style={STYLES.error}>{formError}</Text> : null}
          <View style={STYLES.actionRow}>
            <Pressable
              onPress={handleDelete}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={
                confirmingDelete ? "Confirm delete" : "Delete receipt"
              }
              style={({ pressed }) => [
                STYLES.actionButton,
                STYLES.deleteButton,
                (pressed || saving) && STYLES.pressed,
              ]}
            >
              <Text style={STYLES.deleteText}>
                {confirmingDelete ? "Confirm delete" : "Delete"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => runSave(onSaveDraft)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save draft"
              style={({ pressed }) => [
                STYLES.actionButton,
                STYLES.draftButton,
                (pressed || saving) && STYLES.pressed,
              ]}
            >
              <Text style={STYLES.draftText}>Save draft</Text>
            </Pressable>
            <Pressable
              onPress={() => runSave(onSubmit)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Submit receipt"
              style={({ pressed }) => [
                STYLES.actionButton,
                STYLES.submitButton,
                (pressed || saving) && STYLES.pressed,
              ]}
            >
              <Text style={STYLES.submitText}>Submit</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Stylesheet for the add-receipt modal.
 */
const STYLES = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  heading: { fontSize: 24, fontWeight: "800", color: palette.text },
  closeText: { fontSize: 16, fontWeight: "700", color: palette.accent },
  content: { padding: 24, gap: 10 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.muted,
    marginTop: 12,
  },
  input: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: palette.text,
  },
  lowConfidenceInput: { borderColor: palette.accent },
  confidenceWarning: { color: palette.accent, fontSize: 14, fontWeight: "600" },
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  divider: { borderTopWidth: 1, borderTopColor: palette.border },
  itemName: { flex: 1 },
  itemPrice: { width: 96, textAlign: "right" },
  removeText: { fontSize: 18, color: palette.muted, paddingHorizontal: 4 },
  addItemButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pressed: { opacity: 0.7 },
  addItemText: { fontSize: 13, fontWeight: "700", color: palette.accent },
  taxRow: { flexDirection: "row", gap: 10 },
  taxInput: { flex: 1, textAlign: "right" },
  error: { color: palette.error },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  summaryLabel: { fontSize: 15, color: palette.muted },
  summaryValue: { fontSize: 15, fontWeight: "600", color: palette.text },
  totalLabel: { fontSize: 17, fontWeight: "800", color: palette.text },
  totalValue: { fontSize: 17, fontWeight: "800", color: palette.text },
  footer: {
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.bg,
  },
  confirmText: { color: palette.muted, fontSize: 14 },
  actionRow: { flexDirection: "row", gap: 8 },
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
  deleteButton: { borderWidth: 1, borderColor: palette.error },
  deleteText: { fontSize: 14, fontWeight: "700", color: palette.error },
  draftButton: { backgroundColor: palette.accentSoft },
  draftText: { fontSize: 14, fontWeight: "700", color: palette.accent },
  submitButton: { backgroundColor: palette.accent },
  submitText: { fontSize: 14, fontWeight: "700", color: "white" },
});
