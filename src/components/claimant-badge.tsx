import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ClaimantGuestIcon,
  ClaimantVerifiedIcon,
  type IconProps,
} from "@/components/icons";
import { PALETTE } from "@/lib/palette";

/** Whether a receipt claimant is the current user, a group member, or a guest. */
export type ClaimantRole = "you" | "member" | "guest";

export interface ClaimantBadgeProps {
  role: ClaimantRole;
  label: string;
}

/** Visual styling and accessible role label for each claimant badge type. */
const ROLE_META: Record<
  ClaimantRole,
  {
    bg: string;
    border: string;
    text: string;
    roleName: string;
    icon: (props: IconProps) => JSX.Element;
  }
> = {
  you: {
    bg: PALETTE.accent,
    border: PALETTE.accent,
    text: "#FFFFFF",
    roleName: "You",
    icon: ClaimantVerifiedIcon,
  },
  member: {
    bg: "#E8F1F8",
    border: "#BDD5EA",
    text: "#1E568A",
    roleName: "Member",
    icon: ClaimantVerifiedIcon,
  },
  guest: {
    bg: "#FDF2D6",
    border: "#F2D28B",
    text: "#8A5300",
    roleName: "Guest",
    icon: ClaimantGuestIcon,
  },
};

/**
 * Renders a color-coded pill badge with a role SVG icon for a receipt claimant.
 * @param props Claimant role and formatted display label
 * @returns Rendered claimant pill badge
 */
export function ClaimantBadge(props: ClaimantBadgeProps): JSX.Element {
  const { role, label } = props;
  const meta = ROLE_META[role];

  return (
    <View
      testID={`claimant-badge-${role}`}
      accessibilityLabel={`${label} (${meta.roleName})`}
      style={[
        STYLES.badge,
        { backgroundColor: meta.bg, borderColor: meta.border },
      ]}
    >
      <meta.icon size={13} color={meta.text} strokeWidth={2.2} />
      <Text style={[STYLES.label, { color: meta.text }]}>{label}</Text>
    </View>
  );
}

/** Stylesheet for claimant pill badges. */
const STYLES = StyleSheet.create({
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
});
