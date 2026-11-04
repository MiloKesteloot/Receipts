import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
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

import { palette } from "@/lib/palette";
import {
  checkReceipt,
  scanReceipt,
  type ScannedReceipt,
} from "@/lib/scan-receipt";
import { supabase } from "@/lib/supabase";

/**
 * Azure's free tier rejects files over 4 MB.
 */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Formats a dollar amount, or a dash when the scanner didn't find it.
 * @param dollars Amount in dollars
 * @returns Formatted currency string
 */
const money = (dollars: number | null): string =>
  dollars === null ? "—" : `$${dollars.toFixed(2)}`;

/**
 * Test screen: take a photo of a receipt and show what Azure read from it.
 * Nothing is saved; results are gone when you leave the screen.
 * @returns JSX element
 */
export default function ScanReceiptScreen(): JSX.Element {
  const [scan, setScan] = useState<ScannedReceipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (source: "camera" | "library") => {
    setError(null);

    if (source === "camera") {
      const perm = await requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError("Camera permission is needed to scan receipts.");
        return;
      }
    }

    const options: ImagePickerOptions = {
      mediaTypes: "images",
      base64: true,
      quality: 0.5,
    };
    const result =
      source === "camera"
        ? await launchCameraAsync(options)
        : await launchImageLibraryAsync(options);
    if (result.canceled) return;

    const base64 = result.assets[0]?.base64;
    if (!base64) {
      setError("Couldn't read the photo.");
      return;
    }
    if (base64.length * 0.75 > MAX_BYTES) {
      setError("Photo is over 4 MB. Try again a little further away.");
      return;
    }

    setLoading(true);
    setScan(null);
    try {
      setScan(await scanReceipt(base64, supabase));
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
          onPress={() => pick("camera")}
          disabled={loading}
          style={[STYLES.button, loading && STYLES.disabled]}
        >
          <Text style={STYLES.buttonText}>Take photo</Text>
        </Pressable>
        <Pressable
          onPress={() => pick("library")}
          disabled={loading}
          style={[STYLES.button, STYLES.buttonSecondary, loading && STYLES.disabled]}
        >
          <Text style={[STYLES.buttonText, STYLES.buttonSecondaryText]}>
            Choose photo
          </Text>
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
              scan.items.map((it, i) => (
                <View key={i} style={[STYLES.row, i > 0 && STYLES.divider]}>
                  <Text style={STYLES.itemName}>
                    {it.quantity !== null && it.quantity !== 1
                      ? `${it.quantity} × `
                      : ""}
                    {it.description}
                  </Text>
                  <Text style={STYLES.amount}>
                    {money(it.totalPrice ?? it.price)}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={STYLES.card}>
            <TotalRow label="Items added up" value={money(check.itemsSum)} />
            <TotalRow label="Subtotal (printed)" value={money(scan.subtotal)} />
            <TotalRow label="Tax" value={money(scan.tax)} />
            <TotalRow label="Tip" value={money(scan.tip)} />
            <TotalRow
              label="Items + tax + tip"
              value={money(check.computedTotal)}
              bold
            />
            <TotalRow label="Total (printed)" value={money(scan.total)} bold />
          </View>

          <View
            style={[
              STYLES.verdict,
              { backgroundColor: check.matches ? palette.tiles[0] : palette.accentSoft },
            ]}
          >
            <Text style={STYLES.verdictText}>
              {check.difference === null
                ? "⚠️ No printed total found"
                : check.matches
                  ? "✅ Totals match"
                  : `⚠️ Off by ${money(Math.abs(check.difference))} ` +
                    `(printed is ${check.difference > 0 ? "higher" : "lower"})`}
            </Text>
          </View>

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
