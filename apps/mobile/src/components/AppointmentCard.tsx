import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppointmentItem } from "../types";
import { colors, radii, spacing } from "../theme/tokens";

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

interface AppointmentCardProps {
  appointment: AppointmentItem;
  actionLabel?: string;
  onPressAction?: () => void;
}

export function AppointmentCard({
  appointment,
  actionLabel,
  onPressAction
}: AppointmentCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.type}>{appointment.type}</Text>
          <Text style={styles.title}>{appointment.reason}</Text>
        </View>
        <Text style={styles.status}>{appointment.status.replaceAll("_", " ")}</Text>
      </View>

      <Text style={styles.meta}>{dateFormatter.format(new Date(appointment.scheduledAt))}</Text>
      <Text style={styles.meta}>
        {appointment.doctor.fullName} / {appointment.department.name}
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
    gap: spacing.sm
  },
  type: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 4
  },
  status: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  meta: {
    color: colors.muted,
    fontSize: 14
  },
  actionButton: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 10
  },
  actionText: {
    color: "#fff",
    fontWeight: "700"
  }
});
