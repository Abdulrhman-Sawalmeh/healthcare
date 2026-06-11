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
import { useAuth } from "../context/AuthContext";
import { formatDateTime, priorityLabels, toArabicLabel } from "../lib/arabic";
import { mediumApi } from "../services/mediumApi";
import { LocalPatientRecord, ReferralRecord } from "../types";
import { colors, spacing } from "../theme/tokens";

const priorities = ["NORMAL", "URGENT", "EMERGENCY"];

export function ReferralsScreen() {
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [patients, setPatients] = useState<LocalPatientRecord[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number>();
  const [form, setForm] = useState({
    patientUnifiedId: "",
    requiredSpecialty: "",
    priority: "NORMAL",
    reason: "",
    preferredRegion: "",
    notesFromSender: ""
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canCreate = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR";

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [referralsPayload, patientsPayload] = await Promise.all([
        mediumApi.centerReferrals(),
        mediumApi.centerPatients().catch(() => [])
      ]);
      setReferrals(referralsPayload);
      setPatients(patientsPayload);
      if (!selectedPatientId && patientsPayload[0]) {
        setSelectedPatientId(patientsPayload[0].id);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الإحالات.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function createReferral() {
    if (!canCreate) return;
    if (!selectedPatientId && !form.patientUnifiedId.trim()) {
      setError("اختر مريضا أو اكتب الرقم الموحد.");
      return;
    }
    if (!form.requiredSpecialty.trim() || form.reason.trim().length < 5) {
      setError("أدخل التخصص المطلوب وسبب الإحالة.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await mediumApi.requestCenterReferral({
        localPatientId: selectedPatientId,
        patientUnifiedId: form.patientUnifiedId.trim() || undefined,
        requiredSpecialty: form.requiredSpecialty.trim(),
        priority: form.priority,
        reason: form.reason.trim(),
        preferredRegion: form.preferredRegion.trim() || undefined,
        notesFromSender: form.notesFromSender.trim() || undefined,
        processNow: true
      });
      setMessage("تم إنشاء طلب الإحالة وإرساله للمعالجة.");
      setForm({
        patientUnifiedId: "",
        requiredSpecialty: "",
        priority: "NORMAL",
        reason: "",
        preferredRegion: "",
        notesFromSender: ""
      });
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء الإحالة.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState text="جار تحميل الإحالات..." />;
  }

  return (
    <Screen keyboard refreshing={refreshing} onRefresh={() => void loadData()}>
      <HeaderCard
        eyebrow="الإحالات"
        icon="git-branch-outline"
        subtitle="متابعة طلبات الإحالة الصادرة والواردة للمركز المتوسط."
        title="إحالات المركز"
      />

      {error ? <Notice text={error} tone="error" /> : null}
      {message ? <Notice text={message} tone="success" /> : null}

      {canCreate ? (
        <Card>
          <SectionTitle title="طلب إحالة جديد" subtitle="يرسل الطلب للنظام المركزي لاختيار الجهة المناسبة." />
          <Text style={styles.label}>المريض المحلي</Text>
          <ChipRow>
            {patients.map((patient) => (
              <ChoiceChip
                key={patient.id}
                label={`${patient.fullName} - ${patient.unifiedId ?? patient.phone}`}
                onPress={() => {
                  setSelectedPatientId(patient.id);
                  setForm((current) => ({ ...current, patientUnifiedId: patient.unifiedId ?? current.patientUnifiedId }));
                }}
                selected={selectedPatientId === patient.id}
              />
            ))}
          </ChipRow>
          <TextField label="الرقم الموحد عند الحاجة" onChangeText={(value) => setForm((current) => ({ ...current, patientUnifiedId: value }))} value={form.patientUnifiedId} />
          <TextField label="التخصص المطلوب" onChangeText={(value) => setForm((current) => ({ ...current, requiredSpecialty: value }))} placeholder="مثال: قلب" value={form.requiredSpecialty} />
          <Text style={styles.label}>الأولوية</Text>
          <ChipRow>
            {priorities.map((priority) => (
              <ChoiceChip
                key={priority}
                label={priorityLabels[priority]}
                onPress={() => setForm((current) => ({ ...current, priority }))}
                selected={form.priority === priority}
              />
            ))}
          </ChipRow>
          <TextField label="سبب الإحالة" multiline onChangeText={(value) => setForm((current) => ({ ...current, reason: value }))} value={form.reason} />
          <TextField label="المنطقة المفضلة" onChangeText={(value) => setForm((current) => ({ ...current, preferredRegion: value }))} value={form.preferredRegion} />
          <TextField label="ملاحظات مرسلة" multiline onChangeText={(value) => setForm((current) => ({ ...current, notesFromSender: value }))} value={form.notesFromSender} />
          <AppButton disabled={busy} icon="send-outline" label="إرسال طلب الإحالة" onPress={() => void createReferral()} />
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="سجل الإحالات" subtitle={`${referrals.length} إحالة`} />
        {referrals.map((referral) => (
          <View key={referral.id} style={styles.referralCard}>
            <View style={styles.itemTop}>
              <StatusPill label={toArabicLabel(referral.status)} />
              <Text style={styles.itemTitle}>{referral.patientName ?? referral.patientUnifiedId ?? "مريض"}</Text>
            </View>
            <Text style={styles.meta}>
              {referral.fromCenter} إلى {referral.toCenter}
            </Text>
            <Text style={styles.meta}>
              {referral.requiredSpecialty} | {priorityLabels[referral.priority] ?? referral.priority}
            </Text>
            {referral.reason ? <Text style={styles.meta}>{referral.reason}</Text> : null}
            {referral.rejectionReason ? <Text style={styles.errorText}>{referral.rejectionReason}</Text> : null}
            <Text style={styles.dateText}>{formatDateTime(referral.requestedAt)}</Text>
          </View>
        ))}
        {referrals.length === 0 ? <EmptyState text="لا توجد إحالات مسجلة حاليا." /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "right"
  },
  referralCard: {
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
    textAlign: "right"
  },
  meta: {
    color: colors.muted,
    textAlign: "right",
    lineHeight: 21
  },
  errorText: {
    color: colors.danger,
    textAlign: "right",
    fontWeight: "800"
  },
  dateText: {
    color: colors.primary,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800"
  }
});
