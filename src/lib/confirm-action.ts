import { Alert, Platform } from "react-native";

/**
 * Asks the user to confirm a destructive action. Alert.alert has no buttons
 * on web (react-native-web ignores them), so web uses window.confirm.
 *
 * Same signature and behavior as the helper in the US 2.4 branch's group
 * screen, so the two can be merged into this file later.
 * @param title Dialog title
 * @param message Dialog body
 * @param confirmLabel Label of the destructive button
 * @returns True when the user confirmed
 */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string
): Promise<boolean> {
  if (Platform.OS === "web") {
    const confirmFn = (globalThis as { confirm?: (text: string) => boolean })
      .confirm;
    return Promise.resolve(
      confirmFn ? confirmFn(`${title}\n\n${message}`) : false
    );
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
