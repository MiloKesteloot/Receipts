import { Stack } from "expo-router";
import { JSX } from "react/jsx-runtime";

/**
 * Home tab stack: the group list plus group detail screens.
 * @returns JSX element
 */
export default function HomeLayout(): JSX.Element {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="groups/[id]"
        options={{ title: "Group", headerBackTitle: "Home" }}
      />
    </Stack>
  );
}