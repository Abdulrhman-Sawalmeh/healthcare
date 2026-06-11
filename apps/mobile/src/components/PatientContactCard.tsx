import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { AppIcon } from "./Icon";
import { colors, radii, spacing } from "../theme/tokens";

type PatientContactCardProps = {
  centerName?: string | null;
  phone?: string | null;
};

function normalizeTel(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

export function PatientContactCard({ centerName, phone }: PatientContactCardProps) {
  const cleanPhone = phone?.trim();

  if (!cleanPhone) {
    return null;
  }

  const callCenter = () => {
    void Linking.openURL(`tel:${normalizeTel(cleanPhone)}`).catch(() => undefined);
  };

  return (
    <View style={styles.card}>
      <View style={styles.leftGroup}>
        <Text style={styles.label}>Contact Us</Text>
        <View style={styles.searchBubble}>
          <AppIcon name="search-outline" size={18} color={colors.primary} />
        </View>
      </View>
      <Pressable onPress={callCenter} style={styles.phoneGroup}>
        <View style={styles.phoneBubble}>
          <AppIcon name="call-outline" size={18} color="#fff" />
        </View>
        <View style={styles.phoneTextWrap}>
          <Text style={styles.phone}>{cleanPhone}</Text>
          {centerName ? <Text style={styles.centerName}>{centerName}</Text> : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "space-between",
    padding: spacing.sm
  },
  leftGroup: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.xs
  },
  label: {
    color: colors.text,
    fontWeight: "900"
  },
  searchBubble: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  phoneGroup: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    flexDirection: "row-reverse",
    gap: spacing.xs,
    minHeight: 42,
    paddingHorizontal: spacing.sm
  },
  phoneBubble: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: radii.sm,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  phoneTextWrap: {
    gap: 2
  },
  phone: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "right"
  },
  centerName: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right"
  }
});
