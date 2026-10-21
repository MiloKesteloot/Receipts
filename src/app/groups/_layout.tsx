import { Stack } from "expo-router";

// The outer header already shows the back arrow, so this stack hides its own.
export default function GroupsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}