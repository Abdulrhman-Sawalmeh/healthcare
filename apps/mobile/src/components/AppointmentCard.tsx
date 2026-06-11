import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { AppointmentItem } from "../types";
import { colors, radii, spacing } from "../theme/tokens";

interface AppointmentCardProps {
  appointment: AppointmentItem;
  actionLabel?: string;
  onPressAction?: () => void;
}

export function AppointmentCard({ appointment, actionLabel, onPressAction }: AppointmentCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.status}>{toArabicLabel(appointment.status)}</Text>
        <View style={styles.headerText}>
          <Text style={styles.type}>{toArabicLabel(appointment.type)}</Text>
          <Text style={styles.title}>{appointment.reason}</Text>
        </View>
      </View>

      <Text style={styles.meta}>{formatDateTime(appointment.scheduledAt)}</Text>
      <Text style={styles.meta}>
        {appointment.doctor.fullName} | {appointment.department.name}
      </Text>

      {actionLabel && onPressAction ? (
        <Pressable style={styles.actionButton} onPress={onPressAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    alignItems: "flex-start"
  },
  headerText: {
    flex: 1
  },
  type: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right"
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
    textAlign: "right",
    lineHeight: 22
  },
  status: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "900",
    backgroundColor: "#fff3df",
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "right",
    lineHeight: 20
  },
  actionButton: {
    marginTop: spacing.xs,
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center"
  },
  actionText: {
    color: "#fff",
    fontWeight: "900"
  }
});
