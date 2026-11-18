/**
 * User Story 3.3 (Finalize and split), Task 3: shows what everyone owes on a
 * finalized receipt. Presentational only; the split comes from
 * `computeFinalSplit` in `src/lib/finalize-split.ts`.
 */

import { StyleSheet, Text, View } from "react-native";
import { JSX } from "react/jsx-runtime";

import type { FinalSplit } from "@/lib/finalize-split";
import { palette } from "@/lib/palette";

export type FinalSplitCardProps = {
  split: FinalSplit;
  /** The receipt's saved total, to flag a split that doesn't match it. */
  receiptTotalCents: number;
  /** The signed-in user, whose row is highlighted. */
  currentUserId: string | undefined;
  /** Display name for a claimant key (member id or guest key). */
  nameFor: (userId: string) => string;
};

/**
 * Formats cents as dollars, e.g. 1950 -> "$19.50".
 * @param cents Amount in cents
 * @returns The formatted amount
 */
export function formatSplitCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Card listing each person's items, tax, tip and total on a finalized receipt.
 * @param props Component props
 * @param props.split The finalized split
 * @param props.receiptTotalCents The receipt's saved total
 * @param props.currentUserId The signed-in user
 * @param props.nameFor Display name for a claimant
 * @returns JSX element
 */
export function FinalSplitCard({
  split,
  receiptTotalCents,
  currentUserId,
  nameFor,
}: FinalSplitCardProps): JSX.Element {
  return (
    <View style={STYLES.card} testID="final-split-card">
      <Text style={STYLES.title}>Final split</Text>
      <Text style={STYLES.subtitle}>
        Tax and tip are split by how much each person ordered.
      </Text>

      {split.people.map((person) => {
        const isMe = person.userId === currentUserId;
        const name = nameFor(person.userId);
        return (
          <View
            key={person.userId}
            style={[STYLES.row, isMe && STYLES.rowMine]}
            accessibilityLabel={`${name} ${isMe ? "owe" : "owes"} ${formatSplitCents(
              person.totalCents
            )}`}
          >
            <View style={STYLES.rowMain}>
              <Text style={STYLES.name}>{name}</Text>
              <Text style={STYLES.breakdown}>
                {`Items ${formatSplitCents(person.itemsCents)} · Tax ${formatSplitCents(
                  person.taxCents
                )} · Tip ${formatSplitCents(person.tipCents)}`}
              </Text>
            </View>
            <Text style={STYLES.amount}>{formatSplitCents(person.totalCents)}</Text>
          </View>
        );
      })}

      <View style={STYLES.footer}>
        <Text style={STYLES.footerDetail}>
          {`Subtotal ${formatSplitCents(split.subtotalCents)} · Tax ${formatSplitCents(
            split.taxCents
          )} · Tip ${formatSplitCents(split.tipCents)}`}
        </Text>
        <Text style={STYLES.footerTotal}>
          {`Total ${formatSplitCents(split.totalCents)}`}
        </Text>
        {split.totalCents !== receiptTotalCents ? (
          <Text style={STYLES.mismatch}>
            {`This doesn't match the receipt total of ${formatSplitCents(
              receiptTotalCents
            )}.`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Styles for the final split card. */
const STYLES = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderWidth: 1.5,
    borderColor: palette.accent,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.text,
  },
  subtitle: {
    fontSize: 13,
    color: palette.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  rowMine: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
  },
  breakdown: {
    fontSize: 12,
    color: palette.muted,
  },
  amount: {
    fontSize: 17,
    fontWeight: "800",
    color: palette.text,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingTop: 10,
    gap: 4,
    alignItems: "flex-end",
  },
  footerDetail: {
    fontSize: 12,
    color: palette.muted,
  },
  footerTotal: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.text,
  },
  mismatch: {
    fontSize: 12,
    color: palette.error,
  },
});
