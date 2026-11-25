/**
 * User Story 3.4 (Mark paid and confirm), Task 3: where each person's share of
 * a finalized receipt stands, with Mark as paid / Confirm / Not received.
 * Presentational only; the statuses come from `computeSettlement` and the
 * buttons from `shareActions` in `src/lib/settlement.ts`.
 */

import { ActivityIndicator, Text, View } from "react-native";
import { JSX } from "react/jsx-runtime";

import { formatSplitCents } from "@/components/final-split-card";
import { ScalePressable } from "@/components/scale-pressable";
import {
  shareActions,
  type Settlement,
  type SettlementViewer,
  type ShareStatus,
} from "@/lib/settlement";
import { createThemedStyles, elevation, useTheme } from "@/lib/theme";

export type PaymentsCardProps = {
  settlement: Settlement;
  viewer: SettlementViewer;
  /** Display name for a claimant key (member id or guest key). */
  nameFor: (userId: string) => string;
  /** The payer key whose action is in flight, if any. */
  busyKey: string | null;
  onMarkPaid: () => void;
  onConfirm: (payerKey: string) => void;
  onNotReceived: (payerKey: string) => void;
};

/** What each status says on its row. */
export const SHARE_STATUS_LABELS: Record<ShareStatus, string> = {
  uploader: "Paid the bill",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  nothing_owed: "Nothing to pay",
  unpaid: "Not paid yet",
  paid: "Marked paid, waiting for confirmation",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  not_received: "Not received",
  confirmed: "Confirmed",
};

/**
 * The line under the card's title.
 * @param settlement The receipt's settlement
 * @returns E.g. "2 shares left to settle ($12.00)"
 */
export function settlementSummary(settlement: Settlement): string {
  if (settlement.settled) return "Everyone has paid. This receipt is settled.";
  const count = settlement.outstandingCount;
  return `${count} ${count === 1 ? "share" : "shares"} left to settle (${formatSplitCents(
    settlement.outstandingCents
  )})`;
}

/**
 * Card listing each person's payment status and the actions the viewer can take.
 * @param props Component props
 * @param props.settlement The receipt's settlement
 * @param props.viewer Who is looking
 * @param props.nameFor Display name for a claimant
 * @param props.busyKey The share whose action is in flight
 * @param props.onMarkPaid Called when the viewer taps Mark as paid
 * @param props.onConfirm Called when the uploader taps Confirm
 * @param props.onNotReceived Called when the uploader taps Not received
 * @returns JSX element
 */
export function PaymentsCard({
  settlement,
  viewer,
  nameFor,
  busyKey,
  onMarkPaid,
  onConfirm,
  onNotReceived,
}: PaymentsCardProps): JSX.Element {
  const styles = useStyles();
  const palette = useTheme();
  return (
    <View style={styles.card} testID="payments-card">
      <Text style={styles.title}>Payments</Text>
      <Text style={[styles.subtitle, settlement.settled && styles.subtitleSettled]}>
        {settlementSummary(settlement)}
      </Text>

      {settlement.people.map((person) => {
        const name = nameFor(person.userId);
        const actions = shareActions(person, viewer);
        const busy = busyKey === person.userId;
        const anyBusy = busyKey !== null;
        const hasActions = actions.markPaid || actions.confirm || actions.notReceived;
        const statusLabel = SHARE_STATUS_LABELS[person.status];
        return (
          <View
            key={person.userId}
            style={styles.row}
            testID={`payment-row-${person.userId}`}
            accessibilityLabel={`${name}: ${statusLabel}`}
          >
            <View style={styles.rowTop}>
              <View style={styles.rowMain}>
                <Text style={styles.name}>{name}</Text>
                <Text
                  style={[
                    styles.status,
                    person.status === "confirmed" && styles.statusConfirmed,
                    person.status === "not_received" && styles.statusRejected,
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
              <Text style={styles.amount}>{formatSplitCents(person.owesCents)}</Text>
            </View>

            {hasActions ? (
              <View style={styles.actions}>
                {busy ? <ActivityIndicator color={palette.accent} size="small" /> : null}
                {actions.notReceived ? (
                  <ActionButton
                    label="Not received"
                    variant="secondary"
                    disabled={anyBusy}
                    onPress={() => onNotReceived(person.userId)}
                  />
                ) : null}
                {actions.confirm ? (
                  <ActionButton
                    label="Confirm"
                    disabled={anyBusy}
                    onPress={() => onConfirm(person.userId)}
                  />
                ) : null}
                {actions.markPaid ? (
                  <ActionButton label="Mark as paid" disabled={anyBusy} onPress={onMarkPaid} />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * A small button on a payment row.
 * @param props Component props
 * @param props.label Button text
 * @param props.onPress Called on press
 * @param props.disabled True while another action is in flight
 * @param props.variant "primary" (filled) or "secondary" (outlined)
 * @returns JSX element
 */
function ActionButton({
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  variant?: "primary" | "secondary";
}): JSX.Element {
  const styles = useStyles();
  return (
    <ScalePressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.button, variant === "primary" ? styles.buttonPrimary : styles.buttonSecondary, disabled && styles.buttonDisabled]}
    >
      <Text
        style={variant === "primary" ? styles.buttonPrimaryText : styles.buttonSecondaryText}
      >
        {label}
      </Text>
    </ScalePressable>
  );
}

/** Styles for the payments card. */
const useStyles = createThemedStyles((palette) => ({
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    padding: 18,
    gap: 10,
    ...elevation(palette),
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: palette.text,
  },
  subtitle: {
    fontSize: 13,
    color: palette.muted,
  },
  subtitleSettled: {
    color: palette.accent,
    fontWeight: "700",
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
  },
  status: {
    fontSize: 12,
    color: palette.muted,
  },
  statusConfirmed: {
    color: palette.accent,
    fontWeight: "700",
  },
  statusRejected: {
    color: palette.error,
    fontWeight: "700",
  },
  amount: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.text,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  button: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  buttonPrimary: {
    backgroundColor: palette.accent,
  },
  buttonSecondary: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPrimaryText: {
    color: palette.onAccent,
    fontSize: 14,
    fontWeight: "700",
  },
  buttonSecondaryText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.75,
  },
}));
