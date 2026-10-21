import { Stack } from "expo-router";
import { JSX } from "react/jsx-runtime";

/**
 * Layout for the groups stack navigator. Outer header handles back navigation.
 * @returns JSX element
 */
export default function GroupsLayout(): JSX.Element {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}