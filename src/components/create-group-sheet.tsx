/**
 * User Story 1.2, Task 1.1: the "Create group" form, shown as an iOS
 * pop-up sheet so it doesn't need a new route in the shared `_layout.tsx`.
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. (Done in Task 1.2: success view now shows the invite code card.)
 * 2. The "Demo mode" note shows while `USE_MOCK_GROUPS` is true, so fake
 *    groups are never mistaken for real ones in a demo.
 * 3. Colors come from the app theme plus the same blue (#208AEF) as the
 *    existing Home button. There's no design system yet; restyle later.
 * 4. The form resets in `onDismiss`, which runs after the sheet finishes
 *    closing on iOS. Other platforms reset immediately in `handleClose`
 *    instead (untested; we only target iOS).
 * ==========================================================================
 */

import { useTheme } from "expo-router";
import { JSX, useRef, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { InviteCodeCard } from "@/components/invite-code-card";
import {
    CreatedGroup,
    createGroup,
    MAX_GROUP_NAME_LENGTH,
    USE_MOCK_GROUPS,
    validateGroupName,
} from "@/lib/create-group";

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated?: (group: CreatedGroup) => void;
};

/**
 * Sheet where the user names a new group and creates it.
 * @param root0 Component props
 * @param root0.visible Whether the sheet is open
 * @param root0.onClose Called when the user closes the sheet
 * @param root0.onCreated Called once a group has been created
 * @returns JSX element
 */
export function CreateGroupSheet({
  visible,
  onClose,
  onCreated,
}: Props): JSX.Element {
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdGroup, setCreatedGroup] = useState<CreatedGroup | null>(null);
  const [sharing, setSharing] = useState(false);

  // State updates aren't instant, so a fast double tap could get past a
  // `saving` check. A ref changes immediately and blocks the second tap.
  const submittingRef = useRef(false);

  // Same idea for the share sheet: closing this sheet while the share sheet
  // is still on top can leave a frozen blank sheet on iOS.
  const sharingRef = useRef(false);

  const canSubmit = validateGroupName(name) === null && !saving;
  const busy = saving || sharing;

  /**
   * Clears the form so the next time the sheet opens it starts fresh.
   * Runs after the sheet has finished closing, so the content doesn't
   * change (and the keyboard doesn't pop up) mid-animation.
   */
  function reset() {
    setName("");
    setError(null);
    setSaving(false);
    setCreatedGroup(null);
    setSharing(false);
    submittingRef.current = false;
    sharingRef.current = false;
  }

  /**
   * Closes the sheet. Ignored while creating or while the share sheet is open.
   */
  function handleClose() {
    if (submittingRef.current || sharingRef.current) return;
    onClose();
    if (Platform.OS !== "ios") reset(); // PLACEHOLDER #4: iOS resets in onDismiss
  }

  /**
   * Tracks whether the share sheet is open, so Done waits for it.
   * @param isSharing True while the share sheet is open or closing
   */
  function handleSharingChange(isSharing: boolean) {
    sharingRef.current = isSharing;
    setSharing(isSharing);
  }

  /**
   * Validates the name, then creates the group.
   */
  async function handleSubmit() {
    if (submittingRef.current) return;

    const invalid = validateGroupName(name);
    if (invalid) {
      setError(invalid.message);
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setError(null);

    const result = await createGroup(name);

    submittingRef.current = false;
    setSaving(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setCreatedGroup(result.group);
    onCreated?.(result.group);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      onDismiss={reset}
    >
      <View style={[STYLES.container, { backgroundColor: colors.background }]}>
        <View style={STYLES.header}>
          <Text style={[STYLES.title, { color: colors.text }]}>
            {createdGroup ? "Group created" : "New group"}
          </Text>
          <Pressable onPress={handleClose} disabled={busy} hitSlop={12}>
            <Text style={[STYLES.headerButton, busy && STYLES.disabled]}>
              {createdGroup ? "Done" : "Cancel"}
            </Text>
          </Pressable>
        </View>

        {USE_MOCK_GROUPS && (
          // PLACEHOLDER #2: remove when USE_MOCK_GROUPS is switched off.
          <Text style={STYLES.demoNote}>
            Demo mode: groups are fake and disappear when the app reloads.
          </Text>
        )}

        {createdGroup ? (
          <InviteCodeCard
            group={createdGroup}
            onSharingChange={handleSharingChange}
          />
        ) : (
          <View style={STYLES.form}>
            <Text style={[STYLES.label, { color: colors.text }]}>
              Group name
            </Text>
            <TextInput
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (error) setError(null);
              }}
              placeholder="e.g. Apartment 402"
              placeholderTextColor="#8E8E93"
              maxLength={MAX_GROUP_NAME_LENGTH}
              autoFocus
              editable={!saving}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              style={[
                STYLES.input,
                { color: colors.text, borderColor: colors.border },
              ]}
            />
            <Text style={STYLES.counter}>
              {name.length}/{MAX_GROUP_NAME_LENGTH}
            </Text>

            {error && <Text style={STYLES.error}>{error}</Text>}

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                STYLES.button,
                (!canSubmit || pressed) && STYLES.disabled,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={STYLES.buttonText}>Create group</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

/**
 * Styles for the sheet. PLACEHOLDER #3: no design system yet.
 */
const STYLES = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  headerButton: {
    color: "#208AEF",
    fontSize: 17,
  },
  demoNote: {
    color: "#8A5A00",
    backgroundColor: "#FFF4D6",
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    overflow: "hidden",
  },
  form: {
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
  },
  counter: {
    alignSelf: "flex-end",
    fontSize: 13,
    color: "#8E8E93",
  },
  error: {
    color: "#D93025",
  },
  button: {
    backgroundColor: "#208AEF",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "white",
    fontSize: 17,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
});
