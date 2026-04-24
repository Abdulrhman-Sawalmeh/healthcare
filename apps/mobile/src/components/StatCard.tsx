import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing } from "../theme/tokens";

interface StatCardProps {
  label: string;
  value: string | number;
  tone?: "primary" | "secondary";
}

export function StatCard({ label, value, tone = "primary" }: StatCardProps) {
  return (
    <View style={[styles.card, tone === "secondary" ? styles.secondary : styles.primary]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    padding: spacing.md,
    minWidth: 148
  },
  primary: {
    backgroundColor: colors.surface
  },
  secondary: {
    backgroundColor: colors.surfaceMuted
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  value: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
    marginTop: spacing.sm
  }
});
