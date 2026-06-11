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
import { formatDate, formatDateTime, joinMeta, splitCsv, toArabicLabel } from "../lib/arabic";
import { canCreatePatients, mediumApi } from "../services/mediumApi";
import { LocalPatientRecord, NetworkPatientSearchResult, PatientTimelineBundle } from "../types";
import { useAuth } from "../context/AuthContext";
import { colors, spacing } from "../theme/tokens";

const genders = ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"];

export function PatientsScreen() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<LocalPatientRecord[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number>();
  const [timeline, setTimeline] = useState<PatientTimelineBundle | null>(null);
  const [query, setQuery] = useState("");
  const [networkTerm, setNetworkTerm] = useState("");
  const [networkResult, setNetworkResult] = useState<NetworkPatientSearchResult | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    nationalId: "",
    dateOfBirth: "1990-01-01",
    gender: "MALE",
    primaryPhone: "",
    address: "",
    emergencyContact: "",
    bloodType: "",
    allergies: "",
    chronicDiseases: ""
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canCreate = canCreatePatients(user?.role);

  const loadPatients = useCallback(async (search?: string) => {
    setRefreshing(true);
    try {
      const payload = await mediumApi.centerPatients(search);
      setPatients(payload);
      if (!selectedPatientId && payload[0]) {
        setSelectedPatientId(payload[0].id);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل المرضى.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    if (!selectedPatientId) {
      setTimeline(null);
      return;
    }

    mediumApi.patientTimeline(selectedPatientId)
      .then((payload) => {
        setTimeline(payload);
        setError("");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "تعذر تحميل ملف المريض."));
  }, [selectedPatientId]);

  async function runSearch() {
    if (!networkTerm.trim()) {
      setError("أدخل رقم الهوية أو الهاتف قبل البحث.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");

    try {
      setNetworkResult(await mediumApi.searchCenterPatient(networkTerm.trim()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ البحث.");
    } finally {
      setBusy(false);
    }
  }

  async function createPatient() {
    if (!canCreate) return;
    if (!form.fullName.trim() || !form.nationalId.trim() || !form.primaryPhone.trim() || !form.address.trim()) {
      setError("أدخل الاسم، الهوية، الهاتف، والعنوان قبل إنشاء الملف.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const payload = await mediumApi.createCenterPatient({
        fullName: form.fullName.trim(),
        nationalId: form.nationalId.trim(),
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        primaryPhone: form.primaryPhone.trim(),
        address: form.address.trim(),
        emergencyContact: form.emergencyContact.trim() || undefined,
        bloodType: form.bloodType.trim() || undefined,
        allergies: splitCsv(form.allergies),
        chronicDiseases: splitCsv(form.chronicDiseases)
      });

      setForm({
        fullName: "",
        nationalId: "",
        dateOfBirth: "1990-01-01",
        gender: "MALE",
        primaryPhone: "",
        address: "",
        emergencyContact: "",
        bloodType: "",
        allergies: "",
        chronicDiseases: ""
      });
      setMessage(
        payload.portalAccount
          ? `تم إنشاء ملف المريض. يمكنه الدخول برقم الهوية: ${payload.portalAccount.loginIdentifier}.`
          : "تم إنشاء ملف المريض."
      );
      await loadPatients();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف المريض.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState text="جار تحميل سجل المرضى..." />;
  }

  return (
    <Screen keyboard refreshing={refreshing} onRefresh={() => void loadPatients(query)}>
      <HeaderCard
        eyebrow="إدارة المرضى"
        icon="people-outline"
        subtitle="بحث محلي، تحقق من السجل الموحد، وإنشاء حسابات المرضى من الاستقبال."
        title="سجل المرضى المحلي"
      />

      {error ? <Notice text={error} tone="error" /> : null}
      {message ? <Notice text={message} tone="success" /> : null}

      <Card>
        <SectionTitle title="تصفية المرضى" />
        <TextField onChangeText={setQuery} placeholder="الاسم، الهاتف، الهوية أو الرقم الموحد" value={query} />
        <AppButton icon="search-outline" label="بحث في السجل المحلي" onPress={() => void loadPatients(query)} tone="ghost" />
      </Card>

      <Card>
        <SectionTitle title="بحث الاستقبال في السجل الموحد" subtitle="يفيد قبل إنشاء مريض جديد لتجنب التكرار." />
        <TextField onChangeText={setNetworkTerm} placeholder="رقم الهوية أو الهاتف" value={networkTerm} />
        <AppButton disabled={busy} icon="scan-outline" label="بحث موحد" onPress={() => void runSearch()} />
        {networkResult ? (
          <View style={styles.resultBox}>
            <StatusPill label={networkResult.found ? "تم العثور" : "غير موجود"} tone={networkResult.found ? "primary" : "warning"} />
            {networkResult.patient ? (
              <Text style={styles.primaryText}>
                {networkResult.patient.fullName} | {networkResult.patient.primaryPhone}
              </Text>
            ) : null}
            {networkResult.localPatient ? (
              <Text style={styles.meta}>محلي: {networkResult.localPatient.fullName}</Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      {canCreate ? (
        <Card>
          <SectionTitle title="إنشاء ملف وحساب مريض" subtitle="متاح لموظف الاستقبال في المركز المتوسط." />
          <TextField label="الاسم الكامل" onChangeText={(value) => setForm((current) => ({ ...current, fullName: value }))} value={form.fullName} />
          <View style={styles.row}>
            <TextField label="رقم الهوية" onChangeText={(value) => setForm((current) => ({ ...current, nationalId: value }))} value={form.nationalId} style={styles.flex} />
            <TextField label="تاريخ الميلاد" onChangeText={(value) => setForm((current) => ({ ...current, dateOfBirth: value }))} value={form.dateOfBirth} style={styles.flex} />
          </View>
          <Text style={styles.label}>الجنس</Text>
          <ChipRow>
            {genders.map((gender) => (
              <ChoiceChip key={gender} label={toArabicLabel(gender)} onPress={() => setForm((current) => ({ ...current, gender }))} selected={form.gender === gender} />
            ))}
          </ChipRow>
          <TextField label="الهاتف" onChangeText={(value) => setForm((current) => ({ ...current, primaryPhone: value }))} value={form.primaryPhone} />
          <TextField label="العنوان" onChangeText={(value) => setForm((current) => ({ ...current, address: value }))} value={form.address} />
          <View style={styles.row}>
            <TextField label="جهة الطوارئ" onChangeText={(value) => setForm((current) => ({ ...current, emergencyContact: value }))} value={form.emergencyContact} style={styles.flex} />
            <TextField label="فصيلة الدم" onChangeText={(value) => setForm((current) => ({ ...current, bloodType: value }))} value={form.bloodType} style={styles.flex} />
          </View>
          <TextField label="الحساسيات" onChangeText={(value) => setForm((current) => ({ ...current, allergies: value }))} placeholder="افصل بينها بفاصلة" value={form.allergies} />
          <TextField label="الأمراض المزمنة" onChangeText={(value) => setForm((current) => ({ ...current, chronicDiseases: value }))} placeholder="افصل بينها بفاصلة" value={form.chronicDiseases} />
          <AppButton disabled={busy} icon="person-add-outline" label="إنشاء الملف والحساب" onPress={() => void createPatient()} />
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="قائمة المرضى" subtitle={`${patients.length} مريض في السجل الحالي`} />
        {patients.map((patient) => (
          <View key={patient.id} style={styles.patientCard}>
            <View style={styles.patientTop}>
              <StatusPill label={patient.unifiedId ?? "محلي"} />
              <Text style={styles.patientName}>{patient.fullName}</Text>
            </View>
            <Text style={styles.meta}>{joinMeta([patient.nationalId ?? "بدون هوية", patient.phone, toArabicLabel(patient.gender)])}</Text>
            <Text style={styles.meta}>
              {patient.chronicDiseases.length > 0 ? patient.chronicDiseases.join("، ") : "لا توجد أمراض مزمنة مسجلة."}
            </Text>
            <ChipRow>
              <ChoiceChip label={`${patient.visitCount} زيارات`} onPress={() => setSelectedPatientId(patient.id)} selected={selectedPatientId === patient.id} />
              <ChoiceChip label={toArabicLabel(patient.billingStatus)} onPress={() => setSelectedPatientId(patient.id)} selected={selectedPatientId === patient.id} />
            </ChipRow>
          </View>
        ))}
        {patients.length === 0 ? <EmptyState text="لا توجد نتائج مطابقة." /> : null}
      </Card>

      {timeline ? (
        <Card>
          <SectionTitle
            title={timeline.patient.fullName}
            subtitle={joinMeta([timeline.patient.unifiedId ?? "سجل محلي", timeline.patient.nationalId ?? "بدون هوية", timeline.patient.phone])}
          />
          <View style={styles.row}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{timeline.patient.visitCount}</Text>
              <Text style={styles.summaryLabel}>زيارات</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{timeline.patient.labResultsCount}</Text>
              <Text style={styles.summaryLabel}>مختبر</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{timeline.patient.referralCount}</Text>
              <Text style={styles.summaryLabel}>إحالات</Text>
            </View>
          </View>
          <Text style={styles.meta}>تاريخ الميلاد: {formatDate(timeline.patient.dateOfBirth)}</Text>
          <Text style={styles.meta}>العنوان: {timeline.patient.address}</Text>
          {timeline.events.slice(0, 8).map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <Text style={styles.primaryText}>{event.title}</Text>
              <Text style={styles.meta}>{event.description}</Text>
              <Text style={styles.eventMeta}>
                {formatDateTime(event.date)} | {event.createdBy}
              </Text>
            </View>
          ))}
          {timeline.events.length === 0 ? <EmptyState text="لا توجد أحداث طبية مسجلة لهذا المريض." /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "right"
  },
  row: {
    flexDirection: "row-reverse",
    gap: spacing.sm
  },
  flex: {
    flex: 1
  },
  resultBox: {
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: spacing.sm
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
  patientCard: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.xs
  },
  patientTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    alignItems: "flex-start"
  },
  patientName: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "right"
  },
  summaryCell: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: spacing.sm
  },
  summaryValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "right"
  },
  summaryLabel: {
    color: colors.muted,
    fontWeight: "800",
    textAlign: "right"
  },
  eventCard: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 4
  },
  eventMeta: {
    color: colors.primary,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800"
  }
});
