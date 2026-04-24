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
import { useAuth } from "../context/AuthContext";
import { AppointmentItem } from "../types";
import { colors, spacing } from "../theme/tokens";

export function AppointmentsScreen() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    setRefreshing(true);

    try {
      const payload = await apiRequest<AppointmentItem[]>("/appointments");
      setAppointments(payload);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load appointments.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function cancelAppointment(appointmentId: string) {
    await apiRequest(`/appointments/${appointmentId}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "CANCELLED"
      })
    });

    await loadData();
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData()} />}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Appointments</Text>
      <Text style={styles.subtitle}>Track upcoming visits and keep follow-up on schedule.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.stack}>
        {appointments.map((appointment) => (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            actionLabel={
              user?.role === "PATIENT" && ["SCHEDULED", "CONFIRMED"].includes(appointment.status)
                ? "Cancel visit"
                : undefined
            }
            onPressAction={
              user?.role === "PATIENT" && ["SCHEDULED", "CONFIRMED"].includes(appointment.status)
                ? () => void cancelAppointment(appointment.id)
                : undefined
            }
          />
        ))}
        {appointments.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No appointments available right now.</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.sm
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.muted,
    marginBottom: spacing.sm
  },
  stack: {
    gap: spacing.md
  },
  empty: {
    paddingVertical: spacing.xl
  },
  emptyText: {
    color: colors.muted
  },
  error: {
    color: colors.danger,
    fontWeight: "700"
  }
});
