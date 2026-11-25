import { JSX, ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { SpendingOverTimeChart } from "@/components/spending-over-time-chart";
import type { GroupSummary } from "@/lib/group-data";
import type { SpendingPoint } from "@/lib/group-stats";
import { palette } from "@/lib/palette";
import { formatCents } from "@/lib/receipt-form";

type StatsCardProps = {
  title: string;
  subtitle?: string;
  testID?: string;
  children: ReactNode;
};

type GroupSelectorProps = {
  groups: readonly GroupSummary[];
  selectedId: string | null;
  onSelect: (groupId: string) => void;
};

type SpendingOverTimeCardProps = {
  points: readonly SpendingPoint[];
  totalCents: number;
};

/**
 * Shared card shell for every Stats card (US 4.1): a title, an optional
 * subtitle, and the card's content.
 * @param root0 Card props
 * @param root0.title Card heading
 * @param root0.subtitle Optional muted line under the heading
 * @param root0.testID Test identifier for the card
 * @param root0.children Card content
 * @returns JSX element
 */
export function StatsCard({
  title,
  subtitle,
  testID,
  children,
}: StatsCardProps): JSX.Element {
  return (
    <View style={STYLES.card} testID={testID}>
      <View style={STYLES.cardHeader}>
        <Text style={STYLES.cardTitle}>{title}</Text>
        {subtitle ? <Text style={STYLES.cardSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Horizontally scrolling row of chips, one per group; the selected group is
 * filled with the accent color.
 * @param root0 Selector props
 * @param root0.groups Groups the user belongs to
 * @param root0.selectedId Currently selected group id
 * @param root0.onSelect Called with a group id when its chip is pressed
 * @returns JSX element
 */
export function GroupSelector({
  groups,
  selectedId,
  onSelect,
}: GroupSelectorProps): JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={STYLES.chips}
      testID="stats-group-selector"
    >
      {groups.map((group) => {
        const selected = group.id === selectedId;
        return (
          <Pressable
            key={group.id}
            testID={`stats-group-${group.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(group.id)}
            style={[STYLES.chip, selected ? STYLES.chipSelected : null]}
          >
            <Text
              style={[STYLES.chipText, selected ? STYLES.chipTextSelected : null]}
              numberOfLines={1}
            >
              {group.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * "Spending over time" card: the group's total spent and a line graph of
 * money spent per receipt date, or an empty message with no receipts.
 * @param root0 Card props
 * @param root0.points Spending per day, oldest first
 * @param root0.totalCents Total spent across the group's receipts
 * @returns JSX element
 */
export function SpendingOverTimeCard({
  points,
  totalCents,
}: SpendingOverTimeCardProps): JSX.Element {
  return (
    <StatsCard title="Spending over time" testID="spending-over-time-card">
      <View style={STYLES.totalRow}>
        <Text style={STYLES.totalLabel}>Total spent</Text>
        <Text style={STYLES.totalAmount} testID="stats-total-spent">
          {formatCents(totalCents)}
        </Text>
      </View>
      {points.length > 0 ? (
        <SpendingOverTimeChart points={points} />
      ) : (
        <Text style={STYLES.empty}>No receipts yet.</Text>
      )}
    </StatsCard>
  );
}

/**
 * Styles for Stats cards and the group selector.
 */
const STYLES = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  cardHeader: { gap: 2 },
  cardTitle: { fontSize: 17, fontWeight: "700", color: palette.text },
  cardSubtitle: { fontSize: 13, color: palette.muted },
  chips: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    maxWidth: 200,
  },
  chipSelected: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  chipText: { fontSize: 14, fontWeight: "600", color: palette.text },
  chipTextSelected: { color: "white" },
  totalRow: { gap: 2 },
  totalLabel: { fontSize: 13, color: palette.muted },
  totalAmount: { fontSize: 26, fontWeight: "800", color: palette.text },
  empty: { fontSize: 15, color: palette.muted, paddingVertical: 12 },
});
