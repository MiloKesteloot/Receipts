/**
 * User Story 1.2, Task 1.1: the "Create a new group" form, shown inline in
 * Kellar's Add Group modal through its `renderCreateSection` slot. After a
 * group is created, the form is replaced by its invite code card.
 *
 * ============================== PLACEHOLDERS ==============================
 * 1. The "Demo mode" note shows while the team's `USE_MOCK` flag is true,
 *    so fake groups are never mistaken for real ones in a demo. It goes
 *    away by itself when `USE_MOCK` is turned off.
 * 2. Styles are copied from Kellar's Add Group modal (section label, input,
 *    green button) so the create and join halves match. There's no design
 *    system yet; restyle both together later.
 * 3. DARK MODE: colors are fixed for a light background, because Kellar's
 *    modal card is always white. The whole modal (his card, this form and
 *    the invite code card) needs one dark-mode pass later. Not part of
 *    US 1.2.
 * ==========================================================================
 */

import { JSX, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  validateGroupName,
} from "@/lib/create-group";
import { USE_MOCK } from "@/lib/mock";

type Props = {
  onCreated?: (group: CreatedGroup) => void;
  onBusyChange?: (busy: boolean) => void;
};

/**
 * Form where the user names a new group and creates it, then sees its
 * invite code.
 * @param root0 Component props
 * @param root0.onCreated Called once a group has been created
 * @param root0.onBusyChange Told when creating or sharing starts and ends.
 *   The screen uses it to keep the modal open meanwhile, because closing
 *   it while the iOS share sheet is up can freeze the app.
 * @returns JSX element
 */
export function CreateGroupForm({
  onCreated,
  onBusyChange,
}: Props): JSX.Element {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdGroup, setCreatedGroup] = useState<CreatedGroup | null>(null);

  // State updates aren't instant, so a fast double tap could get past a
  // `saving` check. A ref changes immediately and blocks the second tap.
  const submittingRef = useRef(false);

  // Same idea for the share sheet: closing the modal while the share sheet
  // is still on top can leave a frozen blank screen on iOS.
  const sharingRef = useRef(false);

  // Latest callback, so the cleanup below always reaches the screen.
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;

  const canSubmit = validateGroupName(name) === null && !saving;

  // If the modal goes away some other way (e.g. joining a group closes it
  // mid-create), don't leave the screen thinking we're still busy.
  useEffect(() => () => onBusyChangeRef.current?.(false), []);

  /**
   * Tells the screen whether the modal must stay open right now.
   */
  function reportBusy() {
    onBusyChangeRef.current?.(submittingRef.current || sharingRef.current);
  }

  /**
   * Tracks whether the share sheet is open, so the modal waits for it.
   * @param isSharing True while the share sheet is open or closing
   */
  function handleSharingChange(isSharing: boolean) {
    sharingRef.current = isSharing;
    reportBusy();
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
    reportBusy();
    setSaving(true);
    setError(null);

    const result = await createGroup(name);

    submittingRef.current = false;
    reportBusy();
    setSaving(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setCreatedGroup(result.group);
    onCreated?.(result.group);
  }

  return (
    <View style={STYLES.section}>
      <Text style={STYLES.sectionLabel}>
        {createdGroup ? "Group created" : "Create a new group"}
      </Text>

      {USE_MOCK && (
        // PLACEHOLDER #1: disappears when USE_MOCK is switched off.
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
        <>
          <TextInput
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError(null);
            }}
            placeholder="Group name, e.g. Apartment 402"
            placeholderTextColor="#9CA3AF"
            maxLength={MAX_GROUP_NAME_LENGTH}
            editable={!saving}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            style={[STYLES.input, error ? STYLES.inputError : null]}
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
              pressed && STYLES.buttonPressed,
              !canSubmit && STYLES.disabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={STYLES.buttonText}>Create group</Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

/**
 * Styles for the form. PLACEHOLDER #2: copied from Kellar's modal.
 * PLACEHOLDER #3: light colors only.
 */
const STYLES = StyleSheet.create({
  section: {
    width: "100%",
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  demoNote: {
    color: "#8A5A00",
    backgroundColor: "#FFF4D6",
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    overflow: "hidden",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: "#111827",
  },
  inputError: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  counter: {
    alignSelf: "flex-end",
    fontSize: 13,
    color: "#9CA3AF",
  },
  error: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#4F8A5B",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    backgroundColor: "#42774C",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.5,
  },
});
