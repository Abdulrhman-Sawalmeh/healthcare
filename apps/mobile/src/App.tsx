import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, I18nManager, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { getTabsForRole, TabBar, TabKey } from "./components/TabBar";
import { AppointmentsScreen } from "./screens/AppointmentsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { MedicalRecordScreen } from "./screens/MedicalRecordScreen";
import { MessagesScreen } from "./screens/MessagesScreen";
import { PatientsScreen } from "./screens/PatientsScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { ServicesScreen } from "./screens/ServicesScreen";
import { WorkflowScreen } from "./screens/WorkflowScreen";
import { colors, spacing } from "./theme/tokens";

I18nManager.allowRTL(true);

function MobileWorkspace() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("home");

  const allowedTabs = useMemo(() => (user ? getTabsForRole(user.role).map((tab) => tab.key) : []), [user]);

  useEffect(() => {
    setActiveTab("home");
  }, [user?.id]);

  useEffect(() => {
    if (user && !allowedTabs.includes(activeTab)) {
      setActiveTab("home");
    }
  }, [activeTab, allowedTabs, user]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const screens: Partial<Record<TabKey, JSX.Element>> = {
    home: <HomeScreen />,
    patients: <PatientsScreen />,
    workflow: <WorkflowScreen />,
    appointments: <AppointmentsScreen />,
    record: <MedicalRecordScreen />,
    messages: <MessagesScreen />,
    services: <ServicesScreen />,
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
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <MobileWorkspace />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  screen: {
    flex: 1
  },
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
