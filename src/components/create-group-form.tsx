/**
 * User Story 1.2, Task 1.1: the "Create a new group" form, shown inline in
 * Kellar's Add Group modal through its `renderCreateSection` slot. Once a
 * group is created, `onCreated` receives the new group so the screen can close
 * the modal, show a toast, and navigate directly to the group page.
 *
 * ============================== NOTES ====================================
 * 1. Styles are aligned with the Add Group modal (section label, input,
 *    green button) so the create and join halves match.
 * 2. DARK MODE: colors are styled for modal card backgrounds.
 * ==========================================================================
 */

import { JSX, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScalePressable } from "@/components/scale-pressable";
import {
  CreatedGroup,
  createGroup,
  MAX_GROUP_NAME_LENGTH,
  validateGroupName,
} from "@/lib/create-group";
import { createThemedStyles, useTheme } from "@/lib/theme";

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
  const palette = useTheme();
  const styles = useStyles();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State updates aren't instant, so a fast double tap could get past a
  // `saving` check. A ref changes immediately and blocks the second tap.
  const submittingRef = useRef(false);

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
    onBusyChangeRef.current?.(submittingRef.current);
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

    setName("");
    setError(null);
    onCreated?.(result.group);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Create a new group</Text>

      <TextInput
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (error) setError(null);
        }}
        placeholder="Group name, e.g. Apartment 402"
        placeholderTextColor={palette.placeholder}
        maxLength={MAX_GROUP_NAME_LENGTH}
        editable={!saving}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        style={[styles.input, error ? styles.inputError : null]}
      />
      <Text style={styles.counter}>
        {name.length}/{MAX_GROUP_NAME_LENGTH}
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <ScalePressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={[styles.button, !canSubmit && styles.disabled]}
      >
        {saving ? (
          <ActivityIndicator color={palette.onAccent} size="small" />
        ) : (
          <Text style={styles.buttonText}>Create group</Text>
        )}
      </ScalePressable>
    </View>
  );
}

/**
 * Styles for the form. PLACEHOLDER #2: copied from Kellar's modal.
 * PLACEHOLDER #3: light colors only.
 */
const useStyles = createThemedStyles((palette) => ({
  section: {
    width: "100%",
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.text,
  },
  demoNote: {
    color: palette.warning,
    backgroundColor: palette.warningSoft,
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    overflow: "hidden",
  },
  input: {
    backgroundColor: palette.card,
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: palette.text,
  },
  inputError: {
    borderColor: palette.error,
    backgroundColor: palette.errorSoft,
  },
  counter: {
    alignSelf: "flex-end",
    fontSize: 13,
    color: palette.placeholder,
  },
  error: {
    color: palette.error,
    fontSize: 13,
    fontWeight: "600",
  },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    backgroundColor: palette.accent,
  },
  buttonText: {
    color: palette.onAccent,
    fontSize: 15,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.5,
  },
}));
