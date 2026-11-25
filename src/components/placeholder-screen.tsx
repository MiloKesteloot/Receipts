
import { ScrollView, Text, View } from "react-native";
import { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JSX } from "react/jsx-runtime";

import { AnimatedView } from "@/components/animated";
import { BOTTOM_TAB_CLEARANCE } from "@/components/bottom-tab-bar";
import {
  CreditCardIcon,
  GearIcon,
  type IconProps,
  LineGraphIcon,
  ReceiptIcon,
} from "@/components/icons";
import { createThemedStyles, elevation, useTheme } from "@/lib/theme";

type Props = {
  title: string;
  description: string;
};

/** Featured icon for each placeholder tab, by lowercased title. */
const ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  stats: LineGraphIcon,
  payments: CreditCardIcon,
  settings: GearIcon,
};

/**
 * Stand-in for tabs that don't have real content yet. Shows the tab's icon,
 * placeholder copy, and faded preview rows hinting at what will live here.
 * @param root0 JSX element props
 * @param root0.title Screen title
 * @param root0.description Placeholder message describing the upcoming screen
 * @returns JSX element
 */
export function PlaceholderScreen({ title, description }: Props): JSX.Element {
  const styles = useStyles();
  const palette = useTheme();
  const insets = useSafeAreaInsets();
  const featured = { icon: ICONS[title.toLowerCase()] ?? ReceiptIcon };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top + 24, 32) },
      ]}
    >
      <Text style={styles.title}>{title}</Text>

      <AnimatedView
        entering={FadeInDown.duration(450).springify().damping(18)}
        style={styles.card}
      >
        <View style={styles.iconCircle}>
          <featured.icon size={30} color={palette.accent} strokeWidth={1.8} />
        </View>
        <Text style={styles.cardHeading}>{title} placeholder</Text>
        <Text style={styles.description}>{description}</Text>
      </AnimatedView>

      {/* Faded preview rows hint at the content this tab will hold. */}
      <View style={styles.preview} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0.7, 0.45, 0.25].map((opacity) => (
          <View key={opacity} style={[styles.previewRow, { opacity }]}>
            <View style={styles.previewTile} />
            <View style={styles.previewLines}>
              <View style={[styles.previewLine, { width: "55%" }]} />
              <View style={[styles.previewLine, { width: "35%" }]} />
            </View>
            <View style={styles.previewAmount} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/**
 * Styles for placeholder tab screens.
 */
const useStyles = createThemedStyles((palette) => ({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    padding: 20,
    paddingBottom: BOTTOM_TAB_CLEARANCE,
    gap: 18,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.8,
  },
  card: {
    alignItems: "center",
    backgroundColor: palette.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
    ...elevation(palette),
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accentSoft,
    marginBottom: 8,
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
    textAlign: "center",
  },
  preview: {
    gap: 10,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: palette.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
  },
  previewTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: palette.surface,
  },
  previewLines: {
    flex: 1,
    gap: 8,
  },
  previewLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.surface,
  },
  previewAmount: {
    width: 52,
    height: 14,
    borderRadius: 7,
    backgroundColor: palette.accentSoft,
  },
}));
