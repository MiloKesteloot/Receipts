import {
  launchImageLibraryAsync,
  type ImagePickerOptions,
} from "expo-image-picker";

import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from "react-native";

import { JSX } from "react/jsx-runtime";

import { ScalePressable } from "@/components/scale-pressable";
import { cleanItemName, formatDollars } from "@/lib/format-scan";
import { ReceiptCheckVerdict } from "@/components/receipt-check-verdict";
import {
  checkReceipt,
  itemCents,
  type ScannedReceipt,
} from "@/lib/scan-receipt";
import { scanReceiptPhoto } from "@/lib/scan-flow";
import { supabase } from "@/lib/supabase";
import { createThemedStyles, elevation, useTheme } from "@/lib/theme";

/**
 * Azure's free tier rejects files over 4 MB.
 */
/**
 * Debug screen: choose a receipt photo and show what Azure read from it.
 * Nothing is saved; results are gone when you leave the screen.
 * @returns JSX element
 */
export default function ScanReceiptScreen(): JSX.Element {
  const styles = useStyles();
  const palette = useTheme();
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Test</Text>
        <Text style={styles.title}>Scan a receipt</Text>
        <Text style={styles.subtitle}>
          Results aren&apos;t saved. They disappear when you leave.
        </Text>
      </View>

      <View style={styles.buttonRow}>
        <ScalePressable
          onPress={pick}
          disabled={loading}
          style={[styles.button, loading && styles.disabled]}
        >
          <Text style={styles.buttonText}>Choose photo</Text>
        </ScalePressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.accent} />
          <Text style={styles.subtitle}>Reading receipt…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {scan && check ? (
        <>
          <Text style={styles.sectionLabel}>
            {scan.merchant ?? "Unknown merchant"}
            {scan.date ? ` · ${scan.date}` : ""}
          </Text>
          <View style={styles.card}>
            {scan.items.length === 0 ? (
              <Text style={styles.emptyText}>No line items found.</Text>
            ) : (
              scan.items.map((it, i) => {
                const itemAmount =
                  it.totalPrice === null && it.price === null
                    ? null
                    : itemCents(it) / 100;
                return (
                  <View key={i} style={[styles.row, i > 0 && styles.divider]}>
                    <Text style={styles.itemName}>
                      {cleanItemName(it.description, it.quantity) || "Unnamed item"}
                    </Text>
                    <Text style={styles.amount}>
                      {formatDollars(itemAmount, scan.currency)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.card}>
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
            <Text style={styles.subtitle}>
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
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={[styles.itemName, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.amount, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

/**
 * Stylesheet for the Scan Receipt test screen.
 */
const useStyles = createThemedStyles((palette) => ({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 24, paddingBottom: 128, gap: 10 },
  header: { gap: 6, marginBottom: 8 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: palette.accent,
  },
  title: { fontSize: 34, fontWeight: "800", color: palette.text },
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
  buttonText: { color: palette.onAccent, fontSize: 16, fontWeight: "700" },
  buttonSecondaryText: { color: palette.text },
  disabled: { opacity: 0.5 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10 },
  error: { color: palette.error },
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    ...elevation(palette),
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
}));
