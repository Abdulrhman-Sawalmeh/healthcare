import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { StatCard } from "../components/StatCard";
import { Card, EmptyState, HeaderCard, LoadingState, Notice, Screen, StatusPill } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, formatMoney, roleLabels, toArabicLabel } from "../lib/arabic";
import { mediumApi } from "../services/mediumApi";
import { CenterDashboard, PortalSummary } from "../types";
import { colors, spacing } from "../theme/tokens";

export function HomeScreen() {
  const { user } = useAuth();
  const [centerData, setCenterData] = useState<CenterDashboard | null>(null);
  const [patientData, setPatientData] = useState<PortalSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);

    try {
      if (user.role === "PATIENT") {
        setPatientData(await mediumApi.portalSummary());
      } else {
        setCenterData(await mediumApi.centerDashboard());
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الصفحة الرئيسية.");
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    if (user?.role === "PATIENT") {
      return [
        { label: "المواعيد القادمة", value: patientData?.stats.upcomingAppointments ?? 0 },
        { label: "التقارير الطبية", value: patientData?.stats.completedReports ?? 0 },
        { label: "الإحالات النشطة", value: patientData?.stats.activeReferrals ?? 0 },
        { label: "إشعارات غير مقروءة", value: patientData?.stats.unreadNotifications ?? 0 }
      ];
    }

    return [
      { label: "المرضى المحليون", value: centerData?.stats.localPatients ?? 0 },
      { label: "زيارات غير مرفوعة", value: centerData?.stats.unsyncedVisits ?? 0 },
      { label: "إحالات مفتوحة", value: centerData?.stats.openReferrals ?? 0 },
      { label: "طلبات مختبر", value: centerData?.stats.labOpenRequests ?? 0 }
    ];
  }, [centerData, patientData, user?.role]);

  if (!loaded && refreshing) {
    return <LoadingState text="جار تحميل لوحة المتابعة..." />;
  }

  return (
    <Screen refreshing={refreshing} onRefresh={() => void loadData()}>
      <HeaderCard
        eyebrow={user ? roleLabels[user.role] : "المركز الصحي المتوسط"}
        icon={user?.role === "PATIENT" ? "heart-outline" : "pulse-outline"}
        subtitle={user?.center?.name ?? "المركز الصحي المتوسط"}
        title={`مرحبا، ${user?.fullName ?? ""}`}
      />

      {error ? <Notice text={error} tone="error" /> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statRow}>
        {stats.map((stat, index) => (
          <StatCard key={stat.label} {...stat} tone={index % 2 === 1 ? "secondary" : "primary"} />
        ))}
      </ScrollView>

      {user?.role === "PATIENT" ? (
        <>
          <Card>
            <Text style={styles.cardTitle}>الموعد القادم</Text>
            {patientData?.nextAppointment ? (
              <>
                <Text style={styles.primaryText}>{patientData.nextAppointment.reason}</Text>
                <Text style={styles.meta}>{patientData.nextAppointment.doctor.fullName}</Text>
                <Text style={styles.meta}>{formatDateTime(patientData.nextAppointment.scheduledAt)}</Text>
                <StatusPill label={toArabicLabel(patientData.nextAppointment.status)} />
              </>
            ) : (
              <EmptyState text="لا يوجد موعد قادم حاليا." />
            )}
          </Card>

          <Card>
            <Text style={styles.cardTitle}>فريق الرعاية</Text>
            {(patientData?.careTeam ?? []).slice(0, 4).map((doctor) => (
              <View key={doctor.id} style={styles.listItem}>
                <Text style={styles.primaryText}>{doctor.fullName}</Text>
                <Text style={styles.meta}>
                  {doctor.specialization} | {doctor.department.name}
                </Text>
              </View>
            ))}
            {(patientData?.careTeam ?? []).length === 0 ? <EmptyState text="لا يوجد أطباء مرتبطون بحسابك حاليا." /> : null}
          </Card>

          <Card>
            <Text style={styles.cardTitle}>آخر الإشعارات</Text>
            {(patientData?.recentNotifications ?? []).slice(0, 4).map((notification) => (
              <View key={notification.id} style={styles.listItem}>
                <Text style={styles.primaryText}>{notification.title}</Text>
                <Text style={styles.meta}>{notification.body}</Text>
              </View>
            ))}
            {(patientData?.recentNotifications ?? []).length === 0 ? <EmptyState text="لا توجد إشعارات جديدة." /> : null}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <Text style={styles.cardTitle}>نبض المركز</Text>
            <View style={styles.centerGrid}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{centerData?.center.currentPatientLoad ?? 0}</Text>
                <Text style={styles.metricLabel}>الضغط الحالي</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{centerData?.center.averageWaitTime ?? 0}</Text>
                <Text style={styles.metricLabel}>دقيقة انتظار</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{centerData?.center.specialties?.length ?? 0}</Text>
                <Text style={styles.metricLabel}>تخصصات</Text>
              </View>
            </View>
            {centerData?.financial ? (
              <Text style={styles.meta}>
                الفواتير غير المدفوعة: {centerData.financial.invoices.unpaidCount} | المتبقي من الميزانية:{" "}
                {formatMoney(centerData.financial.budget.remaining)}
              </Text>
            ) : null}
          </Card>

          <Card>
            <Text style={styles.cardTitle}>آخر الزيارات</Text>
            {(centerData?.recentVisits ?? []).slice(0, 6).map((visit) => (
              <View key={visit.id} style={styles.listItem}>
                <View style={styles.itemHeader}>
                  <StatusPill label={toArabicLabel(visit.syncState)} />
                  <Text style={styles.primaryText}>{visit.patientName}</Text>
                </View>
                <Text style={styles.meta}>{visit.diagnosis}</Text>
                <Text style={styles.meta}>
                  {visit.doctorName} | {formatDateTime(visit.visitDate)}
                </Text>
              </View>
            ))}
            {(centerData?.recentVisits ?? []).length === 0 ? <EmptyState text="لا توجد زيارات حديثة." /> : null}
          </Card>

          <Card>
            <Text style={styles.cardTitle}>فريق العمل</Text>
            {(centerData?.team ?? []).slice(0, 6).map((member) => (
              <View key={member.id} style={styles.listItem}>
                <Text style={styles.primaryText}>{member.fullName}</Text>
                <Text style={styles.meta}>
                  {roleLabels[member.role]} {member.specialization ? `| ${member.specialization}` : ""}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
    paddingVertical: 2
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right"
  },
  primaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right",
    lineHeight: 22
  },
  meta: {
    color: colors.muted,
    textAlign: "right",
    lineHeight: 21
  },
  listItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 4
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    alignItems: "flex-start"
  },
  centerGrid: {
    flexDirection: "row-reverse",
    gap: spacing.sm
  },
  metric: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: spacing.sm,
    minHeight: 78,
    justifyContent: "center"
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "right"
  },
  metricLabel: {
    color: colors.muted,
    fontWeight: "800",
    textAlign: "right",
    fontSize: 12
  }
});
