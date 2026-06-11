import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppIcon, IconName } from "./Icon";
import { Role } from "../types";
import { canManagePatients, canUseMessages, canUseVisitWorkflow } from "../services/mediumApi";
import { colors, radii } from "../theme/tokens";

export type TabKey =
  | "home"
  | "patients"
  | "workflow"
  | "appointments"
  | "record"
  | "messages"
  | "services"
  | "profile";

interface TabItem {
  key: TabKey;
  label: string;
  icon: IconName;
}

interface TabBarProps {
  activeTab: TabKey;
  role: Role;
  onChange: (tab: TabKey) => void;
}

export function getTabsForRole(role: Role): TabItem[] {
  if (role === "PATIENT") {
    return [
      { key: "home", label: "الرئيسية", icon: "home-outline" },
      { key: "appointments", label: "المواعيد", icon: "calendar-outline" },
      { key: "record", label: "السجل", icon: "folder-open-outline" },
      { key: "messages", label: "المحادثات", icon: "chatbubble-outline" },
      { key: "services", label: "الخدمات", icon: "grid-outline" }
    ];
  }

  const tabs: TabItem[] = [{ key: "home", label: "الرئيسية", icon: "home-outline" }];

  if (canManagePatients(role)) {
    tabs.push({ key: "patients", label: "المرضى", icon: "people-outline" });
  }

  if (canUseVisitWorkflow(role)) {
    tabs.push({ key: "workflow", label: "الزيارات", icon: "medical-outline" });
  }

  if (canUseMessages(role)) {
    tabs.push({ key: "messages", label: "المحادثات", icon: "chatbubble-outline" });
  }

  tabs.push({ key: "services", label: "الخدمات", icon: "grid-outline" });

  if (tabs.length < 5) {
    tabs.push({ key: "profile", label: "الحساب", icon: "person-outline" });
  }

  return tabs.slice(0, 5);
}

export function TabBar({ activeTab, role, onChange }: TabBarProps) {
  const tabs = getTabsForRole(role);

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={styles.tab}>
            <AppIcon name={tab.icon} size={21} color={active ? colors.primary : colors.muted} />
            <Text numberOfLines={1} style={[styles.label, active && styles.activeLabel]}>
              {tab.label}
            </Text>
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
    minHeight: 64,
    overflow: "hidden"
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 2
  },
  label: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 11,
    textAlign: "center",
    writingDirection: "rtl"
  },
  activeLabel: {
    color: colors.primary
  }
});
