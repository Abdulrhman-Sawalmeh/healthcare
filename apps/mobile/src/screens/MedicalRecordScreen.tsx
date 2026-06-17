import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { PatientContactCard } from "../components/PatientContactCard";
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
import { readPatientOfflineSnapshot, writePatientOfflineSnapshot } from "../services/offlineCache";
import { PortalClinicalReportRecord, PortalMedicalRecord, SubscriptionPlanRecord } from "../types";
import { colors, spacing } from "../theme/tokens";

export function MedicalRecordScreen() {
  const [record, setRecord] = useState<PortalMedicalRecord | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanRecord[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [paymentToken, setPaymentToken] = useState("SECURE-TOKEN-12345");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refillBusyId, setRefillBusyId] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setRefreshing(true);
    let reachable = false;

    try {
      reachable = await mediumApi.healthCheck().catch(() => false);

      if (!reachable) {
        throw new Error("Offline");
      }

      const [recordPayload, plansPayload] = await Promise.all([
        mediumApi.portalMedicalRecord(),
        mediumApi.subscriptionPlans().catch(() => [])
      ]);
      const snapshot = await writePatientOfflineSnapshot(recordPayload);
      setRecord(recordPayload);
      setPlans(plansPayload);
      setOffline(false);
      setLastSyncedAt(snapshot.cachedAt);
      if (!selectedPlanId && plansPayload[0]) {
        setSelectedPlanId(plansPayload[0].id);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل السجل الصحي.");
      const cached = reachable ? null : await readPatientOfflineSnapshot();

      if (cached) {
        setRecord(cached.record);
        setPlans([]);
        setOffline(true);
        setLastSyncedAt(cached.cachedAt);
        setError("");
      }
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

  async function requestRefill(prescriptionId: number) {
    setRefillBusyId(prescriptionId);
    setError("");
    setMessage("");

    try {
      await mediumApi.createPortalRefillRequest({ prescriptionId });
      setMessage("تم إرسال طلب تجديد الدواء إلى الطبيب.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرسال طلب تجديد الدواء.");
    } finally {
      setRefillBusyId(null);
    }
  }

  async function openReportAttachment(report: PortalClinicalReportRecord) {
    if (!report.attachment?.contentBase64) {
      setError("لا يوجد ملف مرفق يمكن فتحه لهذا التقرير.");
      return;
    }

    try {
      await Linking.openURL(
        `data:${report.attachment.mimeType};base64,${report.attachment.contentBase64}`
      );
    } catch {
      setError("تعذر فتح مرفق التقرير على هذا الجهاز.");
    }
  }

  async function openReportUrl(report: PortalClinicalReportRecord) {
    if (!report.reportUrl) {
      setError("لا يوجد رابط تقرير متاح لهذا التقرير.");
      return;
    }

    try {
      await Linking.openURL(report.reportUrl);
    } catch {
      setError("تعذر فتح رابط التقرير على هذا الجهاز.");
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
      {offline ? (
        <Card>
          <Text style={styles.offlineTitle}>Offline data - may be outdated</Text>
          <Text style={styles.meta}>
            Last synced: {lastSyncedAt ? formatDateTime(lastSyncedAt) : "Unknown"}
          </Text>
          <AppButton icon="sync-outline" label="Retry Sync" onPress={() => void loadData()} tone="ghost" />
        </Card>
      ) : null}

      {record ? (
        <>
          <PatientContactCard centerName={record.profile.center.name} phone={record.profile.center.phone} />

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
            <SectionTitle title="تجديد الأدوية" subtitle="يمكنك طلب تجديد وصفة مؤهلة ومتابعة حالتها من الطبيب والصيدلية." />
            {(record.eligiblePrescriptions ?? []).map((prescription) => (
              <View key={prescription.id} style={styles.listItem}>
                <Text style={styles.itemTitle}>{prescription.medicineName}</Text>
                <Text style={styles.meta}>
                  {prescription.dosage} | {prescription.duration} | {formatDateTime(prescription.issuedAt)}
                </Text>
                <AppButton
                  disabled={refillBusyId === prescription.id}
                  icon="medkit-outline"
                  label="طلب تجديد"
                  onPress={() => void requestRefill(prescription.id)}
                  style={styles.smallAction}
                />
              </View>
            ))}
            {(record.eligiblePrescriptions ?? []).length === 0 ? <EmptyState text="لا توجد وصفات مؤهلة لطلب تجديد حاليا." /> : null}

            {(record.medicationRefills ?? []).map((request) => (
              <View key={request.id} style={styles.listItem}>
                <View style={styles.itemTop}>
                  <StatusPill
                    label={toArabicLabel(request.status)}
                    tone={request.status === "REJECTED" ? "danger" : request.status === "COLLECTED" ? "primary" : "warning"}
                  />
                  <Text style={styles.itemTitle}>{request.medicineName}</Text>
                </View>
                <Text style={styles.meta}>
                  {request.dosage} | {request.duration} | {formatDateTime(request.requestedAt)}
                </Text>
                {request.rejectionReason ? <Text style={styles.meta}>سبب الرفض: {request.rejectionReason}</Text> : null}
              </View>
            ))}
          </Card>

          <Card>
            <SectionTitle title="تذكيرات المتابعة" subtitle="التذكيرات التي أضافها الطبيب بعد الزيارة." />
            {(record.followUpReminders ?? []).map((reminder) => {
              const overdue = reminder.status === "PENDING" && new Date(reminder.dueDate).getTime() < Date.now();

              return (
                <View key={reminder.id} style={styles.listItem}>
                  <View style={styles.itemTop}>
                    <StatusPill label={overdue ? "متأخر" : toArabicLabel(reminder.status)} tone={overdue ? "danger" : "warning"} />
                    <Text style={styles.itemTitle}>{reminder.reason}</Text>
                  </View>
                  <Text style={styles.meta}>
                    {reminder.doctorName} | {formatDateTime(reminder.dueDate)}
                  </Text>
                  {reminder.notes ? <Text style={styles.meta}>{reminder.notes}</Text> : null}
                </View>
              );
            })}
            {(record.followUpReminders ?? []).length === 0 ? <EmptyState text="لا توجد تذكيرات متابعة قادمة." /> : null}
          </Card>

          <Card>
            <SectionTitle title="التقارير الطبية" subtitle="تشمل الزيارات المكتملة وتقارير النتائج المشاركة معك." />
            {record.clinicalReports.map((report) => (
              <View key={report.id} style={styles.listItem}>
                <View style={styles.itemTop}>
                  <StatusPill label={toArabicLabel(report.source)} />
                  <Text style={styles.itemTitle}>{report.reason}</Text>
                </View>
                {report.summary ? (
                  <View style={styles.reportBlock}>
                    <Text style={styles.reportLabel}>الملخص</Text>
                    <Text style={styles.reportText}>{report.summary}</Text>
                  </View>
                ) : null}
                {report.findings ? (
                  <View style={styles.reportBlock}>
                    <Text style={styles.reportLabel}>النتائج والفحوصات</Text>
                    <Text style={styles.reportText}>{report.findings}</Text>
                  </View>
                ) : null}
                {report.recommendations ? (
                  <View style={styles.reportBlock}>
                    <Text style={styles.reportLabel}>التوصيات</Text>
                    <Text style={styles.reportText}>{report.recommendations}</Text>
                  </View>
                ) : null}
                {report.recommendedFollowUp ? (
                  <View style={styles.reportBlock}>
                    <Text style={styles.reportLabel}>المتابعة المقترحة</Text>
                    <Text style={styles.reportText}>{report.recommendedFollowUp}</Text>
                  </View>
                ) : null}
                {!report.summary && !report.findings ? <Text style={styles.meta}>لا يوجد ملخص مرفق.</Text> : null}
                <Text style={styles.meta}>
                  {report.doctor.fullName} | {formatDateTime(report.scheduledAt)}
                </Text>
                {report.reportUrl ? (
                  <AppButton
                    label="فتح التقرير"
                    icon="document-text-outline"
                    onPress={() => void openReportUrl(report)}
                    style={styles.smallAction}
                  />
                ) : null}
                {report.attachment ? (
                  <View style={styles.attachmentRow}>
                    <View style={styles.attachmentTextWrap}>
                      <Text style={styles.reportLabel}>المرفق</Text>
                      <Text style={styles.meta}>{report.attachment.fileName}</Text>
                    </View>
                    {report.attachment.contentBase64 ? (
                      <AppButton
                        label="فتح"
                        icon="attach-outline"
                        onPress={() => void openReportAttachment(report)}
                        tone="ghost"
                        style={styles.smallAction}
                      />
                    ) : null}
                  </View>
                ) : null}
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
  offlineTitle: {
    color: colors.danger,
    fontSize: 16,
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
  },
  reportBlock: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: spacing.sm,
    gap: 4
  },
  reportLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right"
  },
  reportText: {
    color: colors.text,
    textAlign: "right",
    lineHeight: 22
  },
  attachmentRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "space-between",
    padding: spacing.sm
  },
  attachmentTextWrap: {
    flex: 1,
    gap: 4
  },
  smallAction: {
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  }
});
