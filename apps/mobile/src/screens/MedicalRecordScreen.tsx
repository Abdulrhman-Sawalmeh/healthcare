import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AppButton,
  Card,
  ChipRow,
  ChoiceChip,
  EmptyState,
  HeaderCard,
  LoadingState,
  Notice,
  Screen,
  SectionTitle,
  StatusPill,
  TextField
} from "../components/ui";
import { formatDate, formatDateTime, toArabicLabel } from "../lib/arabic";
import { mediumApi } from "../services/mediumApi";
import { PortalMedicalRecord, SubscriptionPlanRecord } from "../types";
import { colors, spacing } from "../theme/tokens";

export function MedicalRecordScreen() {
  const [record, setRecord] = useState<PortalMedicalRecord | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanRecord[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [paymentToken, setPaymentToken] = useState("SECURE-TOKEN-12345");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [recordPayload, plansPayload] = await Promise.all([
        mediumApi.portalMedicalRecord(),
        mediumApi.subscriptionPlans().catch(() => [])
      ]);
      setRecord(recordPayload);
      setPlans(plansPayload);
      if (!selectedPlanId && plansPayload[0]) {
        setSelectedPlanId(plansPayload[0].id);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل السجل الصحي.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [selectedPlanId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function activatePlan() {
    if (!selectedPlanId) {
      setError("اختر خطة متابعة أولا.");
      return;
    }
    if (paymentToken.trim().length < 12) {
      setError("أدخل رمز دفع آمن لا يقل عن 12 خانة.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await mediumApi.activateSubscription({
        planId: selectedPlanId,
        securePaymentToken: paymentToken.trim(),
        autoRenew: true,
        method: "SECURE_CARD"
      });
      setMessage("تم تفعيل اشتراك المتابعة.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تفعيل الاشتراك.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState text="جار تحميل السجل الصحي..." />;
  }

  return (
    <Screen keyboard refreshing={refreshing} onRefresh={() => void loadData()}>
      <HeaderCard
        eyebrow="بوابة المريض"
        icon="folder-open-outline"
        subtitle="ملخص مواعيدك، تقاريرك، الإحالات، والاشتراكات الطبية."
        title="السجل الصحي"
      />

      {error ? <Notice text={error} tone="error" /> : null}
      {message ? <Notice text={message} tone="success" /> : null}

      {record ? (
        <>
          <Card>
            <SectionTitle title={record.patient.fullName} subtitle={record.patient.medicalRecordNumber} />
            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={styles.detailLabel}>تاريخ الميلاد</Text>
                <Text style={styles.detailValue}>{formatDate(record.profile.dateOfBirth)}</Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={styles.detailLabel}>الجنس</Text>
                <Text style={styles.detailValue}>{toArabicLabel(record.profile.gender)}</Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={styles.detailLabel}>المركز</Text>
                <Text style={styles.detailValue}>{record.profile.center.name}</Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={styles.detailLabel}>التأمين</Text>
                <Text style={styles.detailValue}>{record.profile.insuranceNumber ?? "غير مسجل"}</Text>
              </View>
            </View>
            <Text style={styles.meta}>الأمراض المزمنة: {record.profile.chronicConditions || "غير مسجلة"}</Text>
            <Text style={styles.meta}>جهة الطوارئ: {record.profile.emergencyContact || "غير مسجلة"}</Text>
          </Card>

          <Card>
            <SectionTitle title="التقارير الطبية" subtitle="تشمل الزيارات المكتملة وتقارير النتائج المشاركة معك." />
            {record.clinicalReports.map((report) => (
              <View key={report.id} style={styles.listItem}>
                <View style={styles.itemTop}>
                  <StatusPill label={toArabicLabel(report.source)} />
                  <Text style={styles.itemTitle}>{report.reason}</Text>
                </View>
                <Text style={styles.meta}>{report.summary || report.findings || "لا يوجد ملخص مرفق."}</Text>
                <Text style={styles.meta}>
                  {report.doctor.fullName} | {formatDateTime(report.scheduledAt)}
                </Text>
              </View>
            ))}
            {record.clinicalReports.length === 0 ? <EmptyState text="لا توجد تقارير طبية منشورة حتى الآن." /> : null}
          </Card>

          <Card>
            <SectionTitle title="المواعيد القادمة" />
            {record.upcomingAppointments.map((appointment) => (
              <View key={appointment.id} style={styles.listItem}>
                <Text style={styles.itemTitle}>{appointment.reason}</Text>
                <Text style={styles.meta}>
                  {appointment.doctor.fullName} | {formatDateTime(appointment.scheduledAt)}
                </Text>
              </View>
            ))}
            {record.upcomingAppointments.length === 0 ? <EmptyState text="لا توجد مواعيد قادمة." /> : null}
          </Card>

          <Card>
            <SectionTitle title="الإحالات" />
            {record.referrals.map((referral) => (
              <View key={referral.id} style={styles.listItem}>
                <View style={styles.itemTop}>
                  <StatusPill label={toArabicLabel(referral.status)} />
                  <Text style={styles.itemTitle}>{referral.reason}</Text>
                </View>
                <Text style={styles.meta}>
                  من {referral.fromCenter.name} إلى {referral.toCenter.name}
                </Text>
                <Text style={styles.meta}>{formatDateTime(referral.createdAt)}</Text>
              </View>
            ))}
            {record.referrals.length === 0 ? <EmptyState text="لا توجد إحالات مرتبطة بحسابك." /> : null}
          </Card>

          <Card>
            <SectionTitle title="اشتراكات المتابعة" subtitle="تفعيل الاشتراك يسمح بخدمات المتابعة والمحادثة الطبية." />
            {record.subscriptions.map((subscription) => (
              <View key={subscription.id} style={styles.listItem}>
                <View style={styles.itemTop}>
                  <StatusPill label={toArabicLabel(subscription.status)} />
                  <Text style={styles.itemTitle}>{subscription.plan.name}</Text>
                </View>
                <Text style={styles.meta}>
                  ينتهي في {formatDate(subscription.endsAt)} | {subscription.plan.billingCycle}
                </Text>
              </View>
            ))}
            {record.subscriptions.length === 0 ? <EmptyState text="لا توجد اشتراكات نشطة حاليا." /> : null}

            {plans.length > 0 ? (
              <>
                <Text style={styles.label}>اختر خطة</Text>
                <ChipRow>
                  {plans.map((plan) => (
                    <ChoiceChip
                      key={plan.id}
                      label={`${plan.name} - ${(plan.priceInCents / 100).toFixed(2)} شيكل`}
                      onPress={() => setSelectedPlanId(plan.id)}
                      selected={selectedPlanId === plan.id}
                    />
                  ))}
                </ChipRow>
                <TextField label="رمز الدفع الآمن" onChangeText={setPaymentToken} value={paymentToken} />
                <AppButton disabled={busy} icon="card-outline" label="تفعيل الاشتراك" onPress={() => void activatePlan()} />
              </>
            ) : null}
          </Card>
        </>
      ) : (
        <EmptyState text="لم يتم العثور على سجل صحي لهذا الحساب." />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  detailGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  detailCell: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: spacing.sm,
    gap: 4
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right"
  },
  detailValue: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "right"
  },
  label: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "right"
  },
  listItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 4
  },
  itemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    alignItems: "flex-start"
  },
  itemTitle: {
    flex: 1,
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
  }
});
