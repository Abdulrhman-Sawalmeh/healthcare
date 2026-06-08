import { useEffect, useState } from "react";
import { ActivityIndicator, I18nManager, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { TabBar, TabKey } from "./components/TabBar";
import { AppointmentsScreen } from "./screens/AppointmentsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { MessagesScreen } from "./screens/MessagesScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { WorkflowScreen } from "./screens/WorkflowScreen";
import { colors, spacing } from "./theme/tokens";

I18nManager.allowRTL(true);

function MobileWorkspace() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("home");

  useEffect(() => setActiveTab("home"), [user?.id]);

  if (loading) {
    return <View style={styles.loader}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }
  if (!user) return <LoginScreen />;

  const screens: Partial<Record<TabKey, JSX.Element>> = {
    home: <HomeScreen />,
    workflow: <WorkflowScreen />,
    appointments: <AppointmentsScreen />,
    messages: <MessagesScreen />,
    profile: <ProfileScreen />
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <View style={styles.screen}>{screens[activeTab] ?? screens.home}</View>
      <View style={styles.tabBarWrap}>
        <TabBar activeTab={activeTab} role={user.role} onChange={setActiveTab} />
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><AuthProvider><MobileWorkspace /></AuthProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1 },
  tabBarWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    backgroundColor: colors.background
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background
  }
});
