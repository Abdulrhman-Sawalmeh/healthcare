import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { NotificationRecord, SubscriptionRecord } from "../types";
import { colors, radii, spacing } from "../theme/tokens";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [error, setError] = useState("");

  async function loadData() {
    try {
      const [notificationPayload, subscriptionPayload] = await Promise.all([
        apiRequest<NotificationRecord[]>("/notifications"),
        apiRequest<SubscriptionRecord[]>("/subscriptions")
      ]);

      setNotifications(notificationPayload);
      setSubscriptions(subscriptionPayload);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load profile data.");
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handlePay() {
    const plan = subscriptions[0];

    if (!plan || user?.role !== "PATIENT") {
      return;
    }

    await apiRequest(`/subscriptions/${plan.id}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amountInCents: plan.plan.priceInCents,
        currency: "USD",
        method: "CARD"
      })
    });

    await loadData();
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>
        <Text style={styles.role}>{user?.role}</Text>
        <Text style={styles.name}>{user?.fullName}</Text>
        <Text style={styles.profileMeta}>{user?.email}</Text>
        <Text style={styles.profileMeta}>{user?.centerName ?? "No center assigned"}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {subscriptions[0] ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Subscription</Text>
          <Text style={styles.planName}>{subscriptions[0].plan.name}</Text>
          <Text style={styles.meta}>
            {currencyFormatter.format(subscriptions[0].plan.priceInCents / 100)} /{" "}
            {subscriptions[0].plan.billingCycle.toLowerCase()}
          </Text>
          {user?.role === "PATIENT" ? (
            <Pressable onPress={() => void handlePay()} style={styles.primaryButton}>
              <Text style={styles.primaryText}>Pay current cycle</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Notifications</Text>
        <View style={styles.notificationStack}>
          {notifications.slice(0, 4).map((notification) => (
            <View key={notification.id} style={styles.notificationCard}>
              <Text style={styles.notificationType}>{notification.type}</Text>
              <Text style={styles.notificationTitle}>{notification.title}</Text>
              <Text style={styles.notificationBody}>{notification.body}</Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable onPress={() => void logout()} style={styles.secondaryButton}>
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg
  },
  profileCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs
  },
  role: {
    color: "rgba(255,255,255,0.72)",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontWeight: "800",
    fontSize: 12
  },
  name: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800"
  },
  profileMeta: {
    color: "rgba(255,255,255,0.8)"
  },
  meta: {
    color: colors.muted
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  panelTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  planName: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 20
  },
  notificationStack: {
    gap: spacing.sm
  },
  notificationCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    padding: spacing.md,
    gap: 4
  },
  notificationType: {
    color: colors.secondary,
    fontWeight: "800",
    textTransform: "uppercase",
    fontSize: 12
  },
  notificationTitle: {
    color: colors.text,
    fontWeight: "800"
  },
  notificationBody: {
    color: colors.muted
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: "center"
  },
  primaryText: {
    color: "#fff",
    fontWeight: "800"
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border
  },
  secondaryText: {
    color: colors.text,
    fontWeight: "800"
  },
  error: {
    color: colors.danger,
    fontWeight: "700"
  }
});
