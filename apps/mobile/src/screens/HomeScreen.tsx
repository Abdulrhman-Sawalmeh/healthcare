import { useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { apiRequest } from "../api/client";
import { AppointmentCard } from "../components/AppointmentCard";
import { StatCard } from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import {
  AppointmentItem,
  DashboardSummary,
  NotificationRecord,
  SubscriptionRecord
} from "../types";
import { colors, radii, spacing } from "../theme/tokens";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export function HomeScreen() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    setRefreshing(true);
    try {
      const [summaryPayload, appointmentsPayload, subscriptionsPayload, notificationsPayload] =
        await Promise.all([
          apiRequest<DashboardSummary>("/dashboard/summary"),
          apiRequest<AppointmentItem[]>("/appointments"),
          apiRequest<SubscriptionRecord[]>("/subscriptions"),
          apiRequest<NotificationRecord[]>("/notifications")
        ]);

      setSummary(summaryPayload);
      setAppointments(appointmentsPayload);
      setSubscriptions(subscriptionsPayload);
      setNotifications(notificationsPayload);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load home data.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const nextAppointment = appointments[0];
  const activePlan = subscriptions[0];

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData()} />}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>{user?.centerName ?? "Mobile workspace"}</Text>
        <Text style={styles.heroTitle}>Welcome back, {user?.fullName?.split(" ")[0]}</Text>
        <Text style={styles.heroSubtitle}>
          Keep care continuity visible from your phone with live appointments, referrals, and alerts.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statRow}>
        <StatCard label="Today's visits" value={summary?.metrics.todayAppointments ?? 0} />
        <StatCard label="Pending referrals" value={summary?.metrics.pendingReferrals ?? 0} tone="secondary" />
        <StatCard label="Adherence" value={`${summary?.metrics.adherenceRate ?? 0}%`} />
      </ScrollView>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Next appointment</Text>
        {nextAppointment ? (
          <AppointmentCard appointment={nextAppointment} />
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No upcoming appointments.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current plan</Text>
        {activePlan ? (
          <View style={styles.planCard}>
            <Text style={styles.planName}>{activePlan.plan.name}</Text>
            <Text style={styles.planMeta}>
              {currencyFormatter.format(activePlan.plan.priceInCents / 100)} /{" "}
              {activePlan.plan.billingCycle.toLowerCase()}
            </Text>
            <Text style={styles.planMeta}>Center: {activePlan.center.name}</Text>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No active subscription found.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent alerts</Text>
        <View style={styles.alertStack}>
          {notifications.slice(0, 3).map((notification) => (
            <View key={notification.id} style={styles.alertCard}>
              <Text style={styles.alertType}>{notification.type}</Text>
              <Text style={styles.alertTitle}>{notification.title}</Text>
              <Text style={styles.alertBody}>{notification.body}</Text>
            </View>
          ))}
          {notifications.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No notifications yet.</Text>
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg
  },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1
  },
  heroTitle: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800"
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.8)",
    lineHeight: 22
  },
  statRow: {
    gap: spacing.md
  },
  section: {
    gap: spacing.sm
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800"
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border
  },
  emptyText: {
    color: colors.muted
  },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs
  },
  planName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800"
  },
  planMeta: {
    color: colors.muted
  },
  alertStack: {
    gap: spacing.sm
  },
  alertCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6
  },
  alertType: {
    color: colors.secondary,
    fontWeight: "800",
    textTransform: "uppercase",
    fontSize: 12
  },
  alertTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16
  },
  alertBody: {
    color: colors.muted,
    lineHeight: 20
  },
  error: {
    color: colors.danger,
    fontWeight: "700"
  }
});
