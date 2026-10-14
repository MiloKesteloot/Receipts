import { useTheme } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";

type Props = {
  title: string;
  description: string;
};

// Stand-in for tabs that don't have real content yet. It scrolls so the
// tab bar's minimize-on-scroll and glass effects have something to show.
export function PlaceholderScreen({ title, description }: Props) {
  const { colors } = useTheme();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.text }]}>
        {description}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  },
});
