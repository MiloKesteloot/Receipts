import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JSX } from "react/jsx-runtime";

import { BOTTOM_TAB_CLEARANCE } from "@/components/bottom-tab-bar";
import { PALETTE as palette } from "@/lib/palette";

type Props = {
  title: string;
  description: string;
};

/**
 * Stand-in for tabs that don't have real content yet. Renders placeholder copy
 * styled with the cream-and-orange app palette and room above the tab bubble.
 * @param root0 JSX element props
 * @param root0.title Screen title
 * @param root0.description Placeholder message describing the upcoming screen
 * @returns JSX element
 */
export function PlaceholderScreen({ title, description }: Props): JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={STYLES.screen}
      contentContainerStyle={[
        STYLES.content,
        { paddingTop: Math.max(insets.top + 16, 32) },
      ]}
    >
      <View style={STYLES.header}>
        <Text style={STYLES.title}>{title}</Text>
      </View>

      <View style={STYLES.card}>
        <Text style={STYLES.cardHeading}>{title} placeholder</Text>
        <Text style={STYLES.description}>{description}</Text>
      </View>
    </ScrollView>
  );
}

/**
 * Styles for placeholder tab screens.
 */
const STYLES = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    padding: 24,
    paddingBottom: BOTTOM_TAB_CLEARANCE,
    gap: 20,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: palette.text,
  },
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  cardHeading: {
    fontSize: 17,
    fontWeight: "700",
    color: palette.text,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: palette.muted,
  },
});
