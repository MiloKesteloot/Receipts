import {
  launchImageLibraryAsync,
  type ImagePickerOptions,
} from "expo-image-picker";

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { JSX } from "react/jsx-runtime";

import { cleanItemName, formatDollars } from "@/lib/format-scan";
import { ReceiptCheckVerdict } from "@/components/receipt-check-verdict";
import { palette } from "@/lib/palette";
import {
  checkReceipt,
  itemCents,
  type ScannedReceipt,
} from "@/lib/scan-receipt";
import { scanReceiptPhoto } from "@/lib/scan-flow";
import { supabase } from "@/lib/supabase";

/**
 * Azure's free tier rejects files over 4 MB.
 */
/**
 * Debug screen: choose a receipt photo and show what Azure read from it.
 * Nothing is saved; results are gone when you leave the screen.
 * @returns JSX element
 */
export default function ScanReceiptScreen(): JSX.Element {
  const [scan, setScan] = useState<ScannedReceipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);

    const options: ImagePickerOptions = {
      mediaTypes: "images",
      base64: true,
      quality: 0.8,
    };
    const result = await launchImageLibraryAsync(options);
    if (result.canceled) return;

    const base64 = result.assets[0]?.base64;
    setLoading(true);
    setScan(null);
    try {
      setScan(await scanReceiptPhoto(base64, supabase));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const check = scan ? checkReceipt(scan) : null;

  return (
    <ScrollView style={STYLES.screen} contentContainerStyle={STYLES.content}>
      <View style={STYLES.header}>
        <Text style={STYLES.eyebrow}>Test</Text>
        <Text style={STYLES.title}>Scan a receipt</Text>
        <Text style={STYLES.subtitle}>
          Results aren&apos;t saved. They disappear when you leave.
        </Text>
      </View>

      <View style={STYLES.buttonRow}>
        <Pressable
          onPress={pick}
          disabled={loading}
          style={[STYLES.button, loading && STYLES.disabled]}
        >
          <Text style={STYLES.buttonText}>Choose photo</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={STYLES.loading}>
          <ActivityIndicator color={palette.accent} />
          <Text style={STYLES.subtitle}>Reading receipt…</Text>
        </View>
      ) : null}

      {error ? <Text style={STYLES.error}>{error}</Text> : null}

      {scan && check ? (
        <>
          <Text style={STYLES.sectionLabel}>
            {scan.merchant ?? "Unknown merchant"}
            {scan.date ? ` · ${scan.date}` : ""}
          </Text>
          <View style={STYLES.card}>
            {scan.items.length === 0 ? (
              <Text style={STYLES.emptyText}>No line items found.</Text>
            ) : (
              scan.items.map((it, i) => {
                const itemAmount =
                  it.totalPrice === null && it.price === null
                    ? null
                    : itemCents(it) / 100;
                return (
                  <View key={i} style={[STYLES.row, i > 0 && STYLES.divider]}>
                    <Text style={STYLES.itemName}>
                      {cleanItemName(it.description, it.quantity) || "Unnamed item"}
                    </Text>
                    <Text style={STYLES.amount}>
                      {formatDollars(itemAmount, scan.currency)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          <View style={STYLES.card}>
            <TotalRow
              label="Items added up"
              value={formatDollars(check.itemsSum, scan.currency)}
            />
            <TotalRow
              label="Subtotal (printed)"
              value={formatDollars(scan.subtotal, scan.currency)}
            />
            <TotalRow label="Tax" value={formatDollars(scan.tax, scan.currency)} />
            <TotalRow label="Tip" value={formatDollars(scan.tip, scan.currency)} />
            <TotalRow
              label="Items + tax + tip"
              value={formatDollars(check.computedTotal, scan.currency)}
              bold
            />
            <TotalRow
              label="Total (printed)"
              value={formatDollars(scan.total, scan.currency)}
              bold
            />
          </View>

          <ReceiptCheckVerdict check={check} currency={scan.currency} />

          {scan.confidence !== null ? (
            <Text style={STYLES.subtitle}>
              Azure confidence: {Math.round(scan.confidence * 100)}%
            </Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

/**
 * One label/amount row in the totals card.
 * @param props Label, formatted value, and whether to bold it
 * @param props.label Row label
 * @param props.value Formatted amount
 * @param props.bold Emphasize the row
 * @returns JSX element
 */
function TotalRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}): JSX.Element {
  return (
    <View style={STYLES.row}>
      <Text style={[STYLES.itemName, bold && STYLES.bold]}>{label}</Text>
      <Text style={[STYLES.amount, bold && STYLES.bold]}>{value}</Text>
    </View>
  );
}

/**
 * Stylesheet for the Scan Receipt test screen.
 */
const STYLES = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 24, gap: 10 },
  header: { gap: 6, marginBottom: 8 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.accent,
  },
  title: { fontSize: 30, fontWeight: "800", color: palette.text },
  subtitle: { fontSize: 15, color: palette.muted },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.muted,
    marginTop: 12,
  },
  buttonRow: { flexDirection: "row", gap: 10 },
  button: {
    flex: 1,
    alignItems: "center",
    backgroundColor: palette.accent,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonSecondary: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "700" },
  buttonSecondaryText: { color: palette.text },
  disabled: { opacity: 0.5 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10 },
  error: { color: palette.error },
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
  },
  divider: { borderTopWidth: 1, borderTopColor: palette.border },
  itemName: { flex: 1, fontSize: 15, color: palette.text },
  amount: { fontSize: 15, fontWeight: "600", color: palette.text },
  bold: { fontWeight: "800" },
  emptyText: { paddingVertical: 16, color: palette.muted, fontSize: 15 },
  verdict: { borderRadius: 12, padding: 14 },
  verdictText: { fontSize: 16, fontWeight: "700", color: palette.text },
});
