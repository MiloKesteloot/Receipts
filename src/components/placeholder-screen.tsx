import { useTheme } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";
import { JSX } from "react/jsx-runtime";

type Props = {
  title: string;
  description: string;
};

/**
 * Stand-in for tabs that don't have real content yet. It scrolls so the
 * tab bar's minimize-on-scroll and glass effects have something to show.
 * @param root0 JSX element props
 * @param root0.title "title" prop
 * @param root0.description "description" prop
 * @returns JSX element
 */
export function PlaceholderScreen({ title, description }: Props): JSX.Element {
  const { colors } = useTheme();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={STYLES.content}
    >
      <Text style={[STYLES.title, { color: colors.text }]}>{title}</Text>
      <Text style={[STYLES.description, { color: colors.text }]}>
        {description}
      </Text>
    </ScrollView>
  );
}

/**
 * TODO Write description
 */
const STYLES = StyleSheet.create({
  content: {
    padding: 24,
    paddingTop: 32,
    gap: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
  },
  description: {
    fontSize: 17,
    opacity: 0.6,
  }
});
