import { LinearGradient } from "expo-linear-gradient";
import { JSX } from "react";
import { Text, View } from "react-native";
import { FadeInDown } from "react-native-reanimated";

import { AnimatedView } from "@/components/animated";
import { ChevronRightIcon } from "@/components/icons";
import { ScalePressable } from "@/components/scale-pressable";
import type { HomeGroupSummary } from "@/lib/home-overview";
import { formatCents } from "@/lib/receipt-form";
import { createThemedStyles, elevation, useTheme } from "@/lib/theme";

type BalanceCardProps = {
  owedToMeCents: number;
  iOweCents: number;
};

type BalanceColumnProps = {
  label: string;
  cents: number;
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
 * @param root0.testID Test identifier for amount text
 * @returns JSX element
 */
function BalanceColumn({ label, cents, testID }: BalanceColumnProps): JSX.Element {
  const styles = useStyles();

  return (
    <View style={styles.balanceColumn}>
      <Text style={styles.balanceLabel}>{label}</Text>
      <Text
        testID={testID}
        style={[styles.balanceAmount, cents === 0 && styles.balanceZero]}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {formatCents(cents)}
      </Text>
    </View>
  );
}

/**
 * Hero card showing what the current user is owed and what they owe, on a
 * warm accent gradient.
 * @param root0 Card props
 * @param root0.owedToMeCents Gross cents owed to the current user
 * @param root0.iOweCents Gross cents the current user owes others
 * @returns JSX element
 */
export function HomeBalanceCard({
  owedToMeCents,
  iOweCents,
}: BalanceCardProps): JSX.Element {
  const styles = useStyles();
  const palette = useTheme();
  const settled = owedToMeCents === 0 && iOweCents === 0;

  return (
    <AnimatedView
      entering={FadeInDown.duration(450).springify().damping(18)}
      style={styles.balanceShadow}
    >
      <LinearGradient
        testID="balance-card"
        colors={palette.heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.balanceCard}
      >
        {/* Soft highlight circles give the gradient some depth. */}
        <View style={[styles.glow, styles.glowLarge]} />
        <View style={[styles.glow, styles.glowSmall]} />

        <Text style={styles.balanceEyebrow}>
          {settled ? "All settled up" : "Your balances"}
        </Text>
        <View style={styles.balanceRow}>
          <BalanceColumn
            label="Owed to me"
            cents={owedToMeCents}
            testID="owed-to-me-amount"
          />
          <View style={styles.divider} />
          <BalanceColumn label="I owe" cents={iOweCents} testID="i-owe-amount" />
        </View>
      </LinearGradient>
    </AnimatedView>
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
  const styles = useStyles();
  const palette = useTheme();
  const latestText = group.latestReceipt
    ? `Latest: ${group.latestReceipt.title} · ${formatCents(group.latestReceipt.totalCents)}`
    : "No receipts yet";

  return (
    <AnimatedView
      entering={FadeInDown.delay(80 + Math.min(index, 8) * 60)
        .duration(400)
        .springify()
        .damping(18)}
    >
      <ScalePressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open ${group.name}`}
        style={styles.groupCard}
      >
        <View
          style={[
            styles.tile,
            { backgroundColor: palette.tiles[index % palette.tiles.length] },
          ]}
        >
          <Text style={styles.tileText}>
            {group.name.trim().charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.groupBody}>
          <Text style={styles.groupName} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={styles.groupMeta} numberOfLines={1}>
            {formatMemberCount(group.memberCount)}
          </Text>
          <Text style={styles.groupReceipt} numberOfLines={1}>
            {latestText}
          </Text>
        </View>

        <View style={styles.chevron}>
          <ChevronRightIcon size={16} color={palette.muted} strokeWidth={2.4} />
        </View>
      </ScalePressable>
    </AnimatedView>
  );
}

/**
 * Styles for Home overview cards matching the warm cream-and-orange palette.
 */
const useStyles = createThemedStyles((palette) => ({
  balanceShadow: {
    borderRadius: 28,
    marginBottom: 10,
    ...elevation(palette, 2),
    shadowColor: palette.accent,
  },
  balanceCard: {
    borderRadius: 28,
    paddingVertical: 22,
    paddingHorizontal: 22,
    gap: 14,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  glowLarge: { width: 220, height: 220, top: -110, right: -60 },
  glowSmall: { width: 120, height: 120, bottom: -70, left: -30 },
  balanceEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.8)",
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  balanceColumn: {
    flex: 1,
    gap: 4,
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.85)",
  },
  balanceAmount: {
    fontSize: 34,
    fontWeight: "800",
    color: palette.onAccent,
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  balanceZero: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  divider: {
    width: 1,
    height: 48,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    marginHorizontal: 18,
  },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    backgroundColor: palette.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    ...elevation(palette),
  },
  tile: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: {
    fontSize: 20,
    fontWeight: "800",
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
    letterSpacing: -0.2,
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
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
}));
