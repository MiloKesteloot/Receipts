import type { JSX } from "react";
import { Text, View } from "react-native";

import {
  ClaimantGuestIcon,
  ClaimantVerifiedIcon,
  type IconProps,
} from "@/components/icons";
import {
  createThemedStyles,
  type Palette,
  useIsDark,
  useTheme,
} from "@/lib/theme";

/** Whether a receipt claimant is the current user, a group member, or a guest. */
export type ClaimantRole = "you" | "member" | "guest";

export interface ClaimantBadgeProps {
  role: ClaimantRole;
  label: string;
}

/** Visual styling and accessible role label for one claimant badge type. */
type RoleMeta = {
  bg: string;
  border: string;
  text: string;
  roleName: string;
  icon: (props: IconProps) => JSX.Element;
};

/**
 * Badge colors and role label for each claimant type in the active theme.
 * @param palette Active palette
 * @param isDark Whether dark mode is on
 * @returns Styling keyed by claimant role
 */
function roleMeta(
  palette: Palette,
  isDark: boolean
): Record<ClaimantRole, RoleMeta> {
  return {
    you: {
      bg: palette.accent,
      border: palette.accent,
      text: palette.onAccent,
      roleName: "You",
      icon: ClaimantVerifiedIcon,
    },
    member: {
      bg: isDark ? "#1D2A38" : "#E8F1F8",
      border: isDark ? "#2E4660" : "#BDD5EA",
      text: isDark ? "#9CC3EA" : "#1E568A",
      roleName: "Member",
      icon: ClaimantVerifiedIcon,
    },
    guest: {
      bg: palette.warningSoft,
      border: isDark ? "#5A4622" : "#F2D28B",
      text: palette.warning,
      roleName: "Guest",
      icon: ClaimantGuestIcon,
    },
  };
}

/**
 * Renders a color-coded pill badge with a role SVG icon for a receipt claimant.
 * @param props Claimant role and formatted display label
 * @returns Rendered claimant pill badge
 */
export function ClaimantBadge(props: ClaimantBadgeProps): JSX.Element {
  const styles = useStyles();
  const palette = useTheme();
  const isDark = useIsDark();
  const { role, label } = props;
  const meta = roleMeta(palette, isDark)[role];

  return (
    <View
      testID={`claimant-badge-${role}`}
      accessibilityLabel={`${label} (${meta.roleName})`}
      style={[
        styles.badge,
        { backgroundColor: meta.bg, borderColor: meta.border },
      ]}
    >
      <meta.icon size={13} color={meta.text} strokeWidth={2.2} />
      <Text style={[styles.label, { color: meta.text }]}>{label}</Text>
    </View>
  );
}

/** Stylesheet for claimant pill badges. */
const useStyles = createThemedStyles(() => ({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
}));
