import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing } from "../theme/tokens";

export type TabKey = "home" | "appointments" | "messages" | "profile";

interface TabBarProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "home", label: "Home" },
  { key: "appointments", label: "Visits" },
  { key: "messages", label: "Messages" },
  { key: "profile", label: "Profile" }
];

export function TabBar({ activeTab, onChange }: TabBarProps) {
  return (
    <View style={styles.container}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onChange(tab.key)}
          style={[styles.tab, activeTab === tab.key ? styles.active : undefined]}
        >
          <Text style={[styles.label, activeTab === tab.key ? styles.activeLabel : undefined]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: 999
  },
  active: {
    backgroundColor: colors.primary
  },
  label: {
    color: colors.muted,
    fontWeight: "700"
  },
  activeLabel: {
    color: "#fff"
  }
});
