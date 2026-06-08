import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Role } from "../types";
import { colors, radii, spacing } from "../theme/tokens";

export type TabKey = "home" | "workflow" | "appointments" | "messages" | "profile";

interface TabBarProps {
  activeTab: TabKey;
  role: Role;
  onChange: (tab: TabKey) => void;
}

const employeeRoles: Role[] = ["CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "LAB_TECH", "PHARMACIST", "NURSE"];

export function TabBar({ activeTab, role, onChange }: TabBarProps) {
  const tabs = role === "PATIENT"
    ? [
        { key: "home" as const, label: "الرئيسية", icon: "home-outline" as const },
        { key: "appointments" as const, label: "المواعيد", icon: "calendar-outline" as const },
        { key: "messages" as const, label: "المحادثات", icon: "chatbubble-outline" as const },
        { key: "profile" as const, label: "الحساب", icon: "person-outline" as const }
      ]
    : [
        { key: "home" as const, label: "الرئيسية", icon: "home-outline" as const },
        ...(employeeRoles.includes(role)
          ? [{ key: "workflow" as const, label: "الزيارات", icon: "medical-outline" as const }]
          : []),
        { key: "profile" as const, label: "الحساب", icon: "person-outline" as const }
      ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={styles.tab}>
            <Ionicons name={tab.icon} size={22} color={active ? colors.primary : colors.muted} />
            <Text style={[styles.label, active && styles.activeLabel]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row-reverse",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 64
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4
  },
  label: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 11,
    textAlign: "center"
  },
  activeLabel: {
    color: colors.primary
  }
});
