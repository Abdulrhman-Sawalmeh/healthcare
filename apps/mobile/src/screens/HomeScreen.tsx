import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { apiRequest } from "../api/client";
import { StatCard } from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import { CenterDashboard, PortalSummary } from "../types";
import { colors, radii, spacing } from "../theme/tokens";

const roleLabels = {
  CENTER_MANAGER: "مدير المركز",
  DOCTOR: "طبيب",
  PATIENT: "مريض",
  RECEPTIONIST: "موظف استقبال",
  LAB_TECH: "فني مختبر",
  PHARMACIST: "صيدلي",
  NURSE: "ممرض"
};

export function HomeScreen() {
  const { user } = useAuth();
  const [centerData, setCenterData] = useState<CenterDashboard | null>(null);
  const [patientData, setPatientData] = useState<PortalSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      if (user.role === "PATIENT") {
        setPatientData(await apiRequest<PortalSummary>("/portal/summary"));
      } else {
        setCenterData(await apiRequest<CenterDashboard>("/center/dashboard"));
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الصفحة الرئيسية.");
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { void loadData(); }, [loadData]);

  const stats = user?.role === "PATIENT"
    ? [
        { label: "المواعيد القادمة", value: patientData?.stats.upcomingAppointments ?? 0 },
        { label: "التقارير الطبية", value: patientData?.stats.completedReports ?? 0 },
        { label: "الإحالات النشطة", value: patientData?.stats.activeReferrals ?? 0 }
      ]
    : [
        { label: "المرضى المحليون", value: centerData?.stats.localPatients ?? 0 },
        { label: "زيارات غير مرفوعة", value: centerData?.stats.unsyncedVisits ?? 0 },
        { label: "طلبات المختبر", value: centerData?.stats.labOpenRequests ?? 0 }
      ];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData()} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.heroRole}>{user ? roleLabels[user.role] : ""}</Text>
        <Text style={styles.heroTitle}>مرحباً، {user?.fullName}</Text>
        <Text style={styles.heroSubtitle}>{user?.center?.name ?? "المركز الصحي المتوسط"}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statRow}>
        {stats.map((stat, index) => <StatCard key={stat.label} {...stat} tone={index === 1 ? "secondary" : "primary"} />)}
      </ScrollView>

      {user?.role === "PATIENT" ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>الموعد القادم</Text>
            <View style={styles.panel}>
              {patientData?.nextAppointment ? (
                <>
                  <Text style={styles.panelTitle}>{patientData.nextAppointment.reason}</Text>
                  <Text style={styles.meta}>{patientData.nextAppointment.doctor.fullName}</Text>
                  <Text style={styles.meta}>{new Date(patientData.nextAppointment.scheduledAt).toLocaleString("ar")}</Text>
                </>
              ) : <Text style={styles.meta}>لا يوجد موعد قادم.</Text>}
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>آخر الإشعارات</Text>
            {(patientData?.recentNotifications ?? []).slice(0, 4).map((notification) => (
              <View key={notification.id} style={styles.panel}>
                <Text style={styles.panelTitle}>{notification.title}</Text>
                <Text style={styles.meta}>{notification.body}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>آخر الزيارات</Text>
          {(centerData?.recentVisits ?? []).slice(0, 6).map((visit) => (
            <View key={visit.id} style={styles.panel}>
              <View style={styles.row}>
                <Text style={styles.state}>{visit.syncState === "SYNCED" ? "مرفوعة" : "محلية"}</Text>
                <Text style={styles.panelTitle}>{visit.patientName}</Text>
              </View>
              <Text style={styles.meta}>{visit.diagnosis}</Text>
              <Text style={styles.meta}>{visit.doctorName}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  hero: { backgroundColor: colors.primary, borderRadius: radii.md, padding: spacing.lg, gap: spacing.xs },
  heroRole: { color: "#d9f1e8", fontWeight: "800", textAlign: "right" },
  heroTitle: { color: "#fff", fontSize: 26, fontWeight: "800", textAlign: "right" },
  heroSubtitle: { color: "#d9f1e8", textAlign: "right" },
  statRow: { flexDirection: "row-reverse", gap: spacing.md },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "right" },
  panel: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 5 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { color: colors.text, fontWeight: "800", fontSize: 16, textAlign: "right" },
  meta: { color: colors.muted, textAlign: "right", lineHeight: 20 },
  state: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  error: { color: colors.danger, textAlign: "right", fontWeight: "700" }
});
