import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Card,
  EmptyState,
  HeaderCard,
  LoadingState,
  Notice,
  Screen,
  SectionTitle,
  StatusPill
} from "../components/ui";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { mediumApi } from "../services/mediumApi";
import { VisitRecord } from "../types";
import { colors, spacing } from "../theme/tokens";

export function VisitsScreen() {
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      setVisits(await mediumApi.visits());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الزيارات.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingState text="جار تحميل الزيارات..." />;
  }

  return (
    <Screen refreshing={refreshing} onRefresh={() => void loadData()}>
      <HeaderCard
        eyebrow="الزيارات المحلية"
        icon="clipboard-outline"
        subtitle="سجل الزيارات المخزنة في المركز مع التقارير والوصفات وحالة المزامنة."
        title="الزيارات"
      />

      {error ? <Notice text={error} tone="error" /> : null}

      <Card>
        <SectionTitle title="سجل الزيارات" subtitle={`${visits.length} زيارة`} />
        {visits.map((visit) => (
          <View key={visit.id} style={styles.visitCard}>
            <View style={styles.itemTop}>
              <StatusPill label={toArabicLabel(visit.syncState)} />
              <Text style={styles.title}>{visit.patientName}</Text>
            </View>
            <Text style={styles.meta}>
              {toArabicLabel(visit.visitType)} | {formatDateTime(visit.visitDate)}
            </Text>
            <Text style={styles.meta}>الطبيب: {visit.doctorName}</Text>
            <Text style={styles.primaryText}>{visit.diagnosis}</Text>
            {visit.symptoms ? <Text style={styles.meta}>الأعراض: {visit.symptoms}</Text> : null}
            <Text style={styles.meta}>
              الوصفات: {visit.prescriptionCount} | الفاتورة: {toArabicLabel(visit.invoiceStatus)}
            </Text>

            {visit.prescriptions.length > 0 ? (
              <View style={styles.subBlock}>
                <Text style={styles.subTitle}>الوصفات</Text>
                {visit.prescriptions.map((prescription) => (
                  <Text key={prescription.id} style={styles.meta}>
                    {prescription.medicineName} | {prescription.dosage} | {prescription.duration}
                  </Text>
                ))}
              </View>
            ) : null}

            {visit.reports.length > 0 ? (
              <View style={styles.subBlock}>
                <Text style={styles.subTitle}>التقارير</Text>
                {visit.reports.map((report) => (
                  <View key={report.id} style={styles.reportItem}>
                    <Text style={styles.primaryText}>{report.title}</Text>
                    <Text style={styles.meta}>{report.summary}</Text>
                    <Text style={styles.dateText}>{formatDateTime(report.createdAt)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
        {visits.length === 0 ? <EmptyState text="لا توجد زيارات مسجلة حاليا." /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  visitCard: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.xs
  },
  itemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    alignItems: "flex-start"
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "right"
  },
  primaryText: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "right",
    lineHeight: 22
  },
  meta: {
    color: colors.muted,
    textAlign: "right",
    lineHeight: 21
  },
  subBlock: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: spacing.sm,
    gap: 4
  },
  subTitle: {
    color: colors.primary,
    fontWeight: "900",
    textAlign: "right"
  },
  reportItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs
  },
  dateText: {
    color: colors.primary,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800"
  }
});
