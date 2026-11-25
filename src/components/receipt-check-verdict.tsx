import { JSX } from "react/jsx-runtime";
import { Text, View } from "react-native";

import { formatDollars } from "@/lib/format-scan";
import type { ReceiptCheck } from "@/lib/scan-receipt";
import { createThemedStyles, useTheme } from "@/lib/theme";

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
  const styles = useStyles();
  const palette = useTheme();
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
        styles.verdict,
        { backgroundColor: check.matches ? palette.tiles[0] : palette.accentSoft },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

/** Styles for the verdict banner. */
const useStyles = createThemedStyles((palette) => ({
  verdict: { borderRadius: 12, padding: 14 },
  text: { color: palette.text, fontSize: 15, fontWeight: "700" },
}));
