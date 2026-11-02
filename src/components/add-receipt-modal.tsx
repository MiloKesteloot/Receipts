/* eslint-disable @typescript-eslint/naming-convention */

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
import type { ReceiptItemDraft } from "@/lib/receipt-form";
import {
    computeTotals,
    createEmptyItem,
    formatCents,
} from "@/lib/receipt-form";

type AddReceiptModalProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Form for entering a receipt: store, items with prices, tax and tip.
 * Shows a live subtotal and total. Saving comes in Task 3.
 * @param props Component props
 * @param props.visible Whether the modal is open
 * @param props.onClose Called when the user closes the modal
 * @returns JSX element
 */
export function AddReceiptModal({
  visible,
  onClose,
}: AddReceiptModalProps): JSX.Element {
  const nextId = useRef(2);
  const [store, setStore] = useState("");
  const [items, setItems] = useState<ReceiptItemDraft[]>([
    createEmptyItem("item-1"),
  ]);
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");

  const totals = computeTotals({ store, items, tax, tip });

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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={STYLES.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={STYLES.topBar}>
          <Text style={STYLES.heading}>New receipt</Text>
          <Pressable
            onPress={onClose}
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
            style={STYLES.input}
          />

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
                  style={[STYLES.input, STYLES.itemName]}
                />
                <TextInput
                  value={item.price}
                  onChangeText={(text) => updateItem(item.id, "price", text)}
                  accessibilityLabel={`Item ${i + 1} price`}
                  placeholder="0.00"
                  placeholderTextColor={palette.muted}
                  keyboardType="decimal-pad"
                  style={[STYLES.input, STYLES.itemPrice]}
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
              style={[STYLES.input, STYLES.taxInput]}
            />
            <TextInput
              value={tip}
              onChangeText={setTip}
              accessibilityLabel="Tip"
              placeholder="Tip"
              placeholderTextColor={palette.muted}
              keyboardType="decimal-pad"
              style={[STYLES.input, STYLES.taxInput]}
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
        </ScrollView>
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
});