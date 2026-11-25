 

import { JSX, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { CloseIcon } from "@/components/icons";
import { ReceiptCheckVerdict } from "@/components/receipt-check-verdict";
import { ScalePressable } from "@/components/scale-pressable";
import {
  computeTotals,
  createEmptyItem,
  formatCents,
  type ReceiptDraft,
  type ReceiptItemDraft,
} from "@/lib/receipt-form";
import type { ReceiptCheck } from "@/lib/scan-receipt";
import { createThemedStyles, useTheme } from "@/lib/theme";

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
  const styles = useStyles();
  const palette = useTheme();
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
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.topBar}>
          <Text style={styles.heading}>
            {title ?? (initialDraft !== null ? "Edit draft" : "New receipt")}
          </Text>
          <ScalePressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Text style={styles.closeText}>Close</Text>
          </ScalePressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>Store</Text>
          <TextInput
            value={store}
            onChangeText={setStore}
            accessibilityLabel="Store"
            placeholder="Where was this?"
            placeholderTextColor={palette.placeholder}
            style={[styles.input, lowConfidence && styles.lowConfidenceInput]}
          />

          {lowConfidence ? (
            <Text style={styles.confidenceWarning}>
              Some scanned fields may need checking.
            </Text>
          ) : null}

          {scanNotes.map((note) => (
            <Text key={note} style={styles.confidenceWarning}>
              {note}
            </Text>
          ))}

          <Text style={styles.sectionLabel}>Items</Text>
          <View style={styles.card}>
            {items.map((item, i) => (
              <View
                key={item.id}
                style={[styles.itemRow, i > 0 && styles.divider]}
              >
                <TextInput
                  value={item.name}
                  onChangeText={(text) => updateItem(item.id, "name", text)}
                  accessibilityLabel={`Item ${i + 1} name`}
                  placeholder="Item"
                  placeholderTextColor={palette.placeholder}
                  style={[
                    styles.input,
                    styles.itemName,
                    lowConfidence && styles.lowConfidenceInput,
                  ]}
                />
                <TextInput
                  value={item.price}
                  onChangeText={(text) => updateItem(item.id, "price", text)}
                  accessibilityLabel={`Item ${i + 1} price`}
                  placeholder="0.00"
                  placeholderTextColor={palette.placeholder}
                  keyboardType="decimal-pad"
                  style={[
                    styles.input,
                    styles.itemPrice,
                    lowConfidence && styles.lowConfidenceInput,
                  ]}
                />
                {items.length > 1 ? (
                  <ScalePressable
                    onPress={() => removeItem(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove item ${i + 1}`}
                    hitSlop={8}
                  >
                    <CloseIcon size={16} color={palette.muted} strokeWidth={2.2} />
                  </ScalePressable>
                ) : null}
              </View>
            ))}
          </View>

          <ScalePressable
            onPress={addItem}
            accessibilityRole="button"
            accessibilityLabel="Add item"
            style={styles.addItemButton}
          >
            <Text style={styles.addItemText}>+ Add item</Text>
          </ScalePressable>

          <Text style={styles.sectionLabel}>Tax and tip</Text>
          <View style={styles.taxRow}>
            <TextInput
              value={tax}
              onChangeText={setTax}
              accessibilityLabel="Tax"
              placeholder="Tax"
              placeholderTextColor={palette.placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, styles.taxInput, lowConfidence && styles.lowConfidenceInput]}
            />
            <TextInput
              value={tip}
              onChangeText={setTip}
              accessibilityLabel="Tip"
              placeholder="Tip"
              placeholderTextColor={palette.placeholder}
              keyboardType="decimal-pad"
              style={[styles.input, styles.taxInput, lowConfidence && styles.lowConfidenceInput]}
            />
          </View>

          {totals.invalid ? (
            <Text style={styles.error}>
              Check amounts: use numbers like 12.50.
            </Text>
          ) : null}

          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>
                {formatCents(totals.subtotalCents)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.divider]}>
              <Text style={styles.summaryLabel}>Tax</Text>
              <Text style={styles.summaryValue}>
                {formatCents(totals.taxCents)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.divider]}>
              <Text style={styles.summaryLabel}>Tip</Text>
              <Text style={styles.summaryValue}>
                {formatCents(totals.tipCents)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.divider]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue} testID="receipt-total">
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

        <View style={styles.footer}>
          {confirmingDelete ? (
            <Text style={styles.confirmText}>
              Press Confirm delete to discard this receipt.
            </Text>
          ) : null}
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          <View style={styles.actionRow}>
            <ScalePressable
              onPress={handleDelete}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={
                confirmingDelete ? "Confirm delete" : "Delete receipt"
              }
              style={[styles.actionButton, styles.deleteButton, saving && styles.pressed]}
            >
              <Text style={styles.deleteText}>
                {confirmingDelete ? "Confirm delete" : "Delete"}
              </Text>
            </ScalePressable>
            <ScalePressable
              onPress={() => runSave(onSaveDraft)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save draft"
              style={[styles.actionButton, styles.draftButton, saving && styles.pressed]}
            >
              <Text style={styles.draftText}>Save draft</Text>
            </ScalePressable>
            <ScalePressable
              onPress={() => runSave(onSubmit)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Submit receipt"
              style={[styles.actionButton, styles.submitButton, saving && styles.pressed]}
            >
              <Text style={styles.submitText}>Submit</Text>
            </ScalePressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Stylesheet for the add-receipt modal.
 */
const useStyles = createThemedStyles((palette) => ({
  container: { flex: 1, backgroundColor: palette.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  heading: { fontSize: 22, fontWeight: "800", color: palette.text },
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
    borderRadius: 20,
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
  submitText: { fontSize: 14, fontWeight: "700", color: palette.onAccent },
}));
