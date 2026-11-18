import { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { HomeGroupSummary } from "@/lib/home-overview";
import { palette } from "@/lib/palette";
import { formatCents } from "@/lib/receipt-form";

/** Color used when others owe the current user money. */
const OWED_TO_ME_COLOR = "#1F6E4A";

type BalanceCardProps = {
  owedToMeCents: number;
  iOweCents: number;
};

type BalanceColumnProps = {
  label: string;
  cents: number;
  positiveColor: string;
  testID: string;
};

type GroupCardProps = {
  group: HomeGroupSummary;
  index: number;
  onPress: () => void;
};

/**
 * Formats a group member count with singular/plural grammar.
 * @param count Number of members in the group
 * @returns Human-readable member count label
 */
export function formatMemberCount(count: number): string {
  return count === 1 ? "1 member" : `${count} members`;
}

/**
 * Single column inside `HomeBalanceCard`.
 * @param root0 Column props
 * @param root0.label Metric heading
 * @param root0.cents Amount in whole cents
 * @param root0.positiveColor Text color applied when `cents > 0`
 * @param root0.testID Test identifier for amount text
 * @returns JSX element
 */
function BalanceColumn({
  label,
  cents,
  positiveColor,
  testID,
}: BalanceColumnProps): JSX.Element {
  return (
    <View style={STYLES.balanceColumn}>
      <Text style={STYLES.balanceLabel}>{label}</Text>
      <Text
        testID={testID}
        style={[
          STYLES.balanceAmount,
          cents > 0 ? { color: positiveColor } : null,
        ]}
      >
        {formatCents(cents)}
      </Text>
    </View>
  );
}

/**
 * Summary card showing what the current user is owed and what they owe.
 * @param root0 Card props
 * @param root0.owedToMeCents Gross cents owed to the current user
 * @param root0.iOweCents Gross cents the current user owes others
 * @returns JSX element
 */
export function HomeBalanceCard({
  owedToMeCents,
  iOweCents,
}: BalanceCardProps): JSX.Element {
  return (
    <View testID="balance-card" style={STYLES.balanceCard}>
      <BalanceColumn
        label="Owed to me"
        cents={owedToMeCents}
        positiveColor={OWED_TO_ME_COLOR}
        testID="owed-to-me-amount"
      />
      <View style={STYLES.divider} />
      <BalanceColumn
        label="I owe"
        cents={iOweCents}
        positiveColor={palette.accent}
        testID="i-owe-amount"
      />
    </View>
  );
}

/**
 * Pressable group summary card displaying member count and latest submitted receipt.
 * @param root0 Card props
 * @param root0.group Group overview summary model
 * @param root0.index Zero-based position for cycling tile colors
 * @param root0.onPress Press callback to open the group detail screen
 * @returns JSX element
 */
export function HomeGroupCard({
  group,
  index,
  onPress,
}: GroupCardProps): JSX.Element {
  const latestText = group.latestReceipt
    ? `Latest: ${group.latestReceipt.title} · ${formatCents(group.latestReceipt.totalCents)}`
    : "No receipts yet";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${group.name}`}
      style={({ pressed }) => [STYLES.groupCard, pressed && STYLES.pressed]}
    >
      <View
        style={[
          STYLES.tile,
          { backgroundColor: palette.tiles[index % palette.tiles.length] },
        ]}
      >
        <Text style={STYLES.tileText}>
          {group.name.trim().charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={STYLES.groupBody}>
        <Text style={STYLES.groupName} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={STYLES.groupMeta} numberOfLines={1}>
          {formatMemberCount(group.memberCount)}
        </Text>
        <Text style={STYLES.groupReceipt} numberOfLines={1}>
          {latestText}
        </Text>
      </View>

      <Text style={STYLES.chevron}>›</Text>
    </Pressable>
  );
}

/**
 * Styles for Home overview cards matching the warm cream-and-orange palette.
 */
const STYLES = StyleSheet.create({
  balanceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  balanceColumn: {
    flex: 1,
    gap: 4,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.muted,
  },
  balanceAmount: {
    fontSize: 22,
    fontWeight: "800",
    color: palette.text,
    fontVariant: ["tabular-nums"],
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: palette.border,
    marginHorizontal: 16,
  },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  tile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: {
    fontSize: 20,
    fontWeight: "700",
    color: palette.text,
  },
  groupBody: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    fontSize: 17,
    fontWeight: "700",
    color: palette.text,
  },
  groupMeta: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.muted,
  },
  groupReceipt: {
    fontSize: 13,
    color: palette.muted,
  },
  chevron: {
    fontSize: 26,
    color: palette.muted,
  },
});

