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
      <Text numberOfLines={2} style={styles.label}>
        {label}
      </Text>
      <Text numberOfLines={1} style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    padding: spacing.md,
    width: 154,
    minHeight: 108,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "space-between"
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
    fontWeight: "800",
    textAlign: "right",
    lineHeight: 19
  },
  value: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    textAlign: "right"
  }
});
