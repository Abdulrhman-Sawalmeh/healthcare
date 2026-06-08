import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../context/AuthContext";
import { colors, radii, spacing } from "../theme/tokens";

export function ProfileScreen() {
  const { user, logout } = useAuth();
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}><Ionicons name="person-outline" size={36} color="#fff" /></View>
        <Text style={styles.name}>{user?.fullName}</Text>
        <Text style={styles.meta}>{user?.username}</Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.label}>المركز</Text>
        <Text style={styles.value}>{user?.center?.name}</Text>
        <Text style={styles.label}>المدينة</Text>
        <Text style={styles.value}>{user?.center?.city}</Text>
        <Text style={styles.label}>البريد الإلكتروني</Text>
        <Text style={styles.value}>{user?.email || "غير مسجل"}</Text>
      </View>
      <Pressable onPress={() => void logout()} style={styles.logout}>
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  profileCard: { backgroundColor: colors.primary, borderRadius: radii.md, padding: spacing.xl, alignItems: "center", gap: spacing.xs },
  avatar: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  name: { color: "#fff", fontSize: 24, fontWeight: "800", textAlign: "center" },
  meta: { color: "#d9f1e8" },
  panel: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  label: { color: colors.muted, textAlign: "right", marginTop: spacing.sm },
  value: { color: colors.text, fontWeight: "700", textAlign: "right" },
  logout: { minHeight: 52, borderRadius: radii.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  logoutText: { color: colors.danger, fontWeight: "800" }
});
