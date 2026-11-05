import { JSX } from "react/jsx-runtime";
import { StyleSheet, Text, View } from "react-native";

import { formatDollars } from "@/lib/format-scan";
import { palette } from "@/lib/palette";
import type { ReceiptCheck } from "@/lib/scan-receipt";

type ReceiptCheckVerdictProps = {
  check: ReceiptCheck;
  currency: string | null;
};

/**
 * Shared receipt total verdict used by the debug screen and review form.
 * @param props Verdict data and the scanned currency
 * @param props.check Receipt total check
 * @param props.currency Scanned currency code
 * @returns JSX element
 */
export function ReceiptCheckVerdict({
  check,
  currency,
}: ReceiptCheckVerdictProps): JSX.Element {
  const message =
    check.difference === null
      ? "⚠️ No printed total found"
      : check.matches
        ? "✅ Totals match"
        : `⚠️ Off by ${formatDollars(Math.abs(check.difference), currency)} ` +
          `(printed is ${check.difference > 0 ? "higher" : "lower"})`;

  return (
    <View
      style={[
        STYLES.verdict,
        { backgroundColor: check.matches ? palette.tiles[0] : palette.accentSoft },
      ]}
    >
      <Text style={STYLES.text}>{message}</Text>
    </View>
  );
}

/** Styles for the verdict banner. */
const STYLES = StyleSheet.create({
  verdict: { borderRadius: 12, padding: 14 },
  text: { color: palette.text, fontSize: 15, fontWeight: "700" },
});
