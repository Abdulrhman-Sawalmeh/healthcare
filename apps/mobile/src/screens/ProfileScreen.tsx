import { StyleSheet, Text, View } from "react-native";

import { AppIcon } from "../components/Icon";
import { AppButton, Card, DetailRow, HeaderCard, Screen } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { roleLabels } from "../lib/arabic";
import { colors, radii, spacing } from "../theme/tokens";

export function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <Screen>
      <HeaderCard eyebrow="الحساب" icon="person-circle-outline" title={user?.fullName ?? "الحساب"} subtitle={user ? roleLabels[user.role] : undefined} />

      <Card style={styles.profileCard}>
        <View style={styles.avatar}>
          <AppIcon name="person-outline" size={36} color="#fff" />
        </View>
        <Text style={styles.name}>{user?.fullName}</Text>
        <Text style={styles.meta}>{user?.username}</Text>
      </Card>

      <Card>
        <DetailRow label="الدور" value={user ? roleLabels[user.role] : undefined} />
        <DetailRow label="المركز" value={user?.center?.name} />
        <DetailRow label="رمز المركز" value={user?.center?.code} />
        <DetailRow label="المدينة" value={user?.center?.city} />
        <DetailRow label="البريد الإلكتروني" value={user?.email || "غير مسجل"} />
        <DetailRow label="الهاتف" value={user?.phone || "غير مسجل"} />
      </Card>

      <AppButton icon="log-out-outline" label="تسجيل الخروج" onPress={() => void logout()} tone="danger" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    alignItems: "center"
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs
  },
  name: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center"
  },
  meta: {
    color: colors.muted,
    textAlign: "center"
  }
});
