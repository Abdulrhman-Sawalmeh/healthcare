import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Catalogs, IntakeOptions, WorkflowVisit } from "../types";
import { colors, radii, spacing } from "../theme/tokens";

const statusLabels: Record<string, string> = {
  WAITING_TRIAGE: "بانتظار التمريض",
  WAITING_DOCTOR: "بانتظار الطبيب",
  WAITING_LAB: "بانتظار المختبر",
  WAITING_PHARMACY: "بانتظار الصيدلية",
  IN_TREATMENT: "قيد المعالجة",
  READY_TO_UPLOAD: "جاهز للرفع",
  UPLOAD_PENDING: "قيد الرفع",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي"
};

const priorityLabels = { NORMAL: "عادي", URGENT: "عاجل", EMERGENCY: "طارئ" };

export function WorkflowScreen() {
  const { user } = useAuth();
  const [visits, setVisits] = useState<WorkflowVisit[]>([]);
  const [options, setOptions] = useState<IntakeOptions>({ patients: [], doctors: [] });
  const [catalogs, setCatalogs] = useState<Catalogs>({ medicines: [], labTests: [], diseases: [] });
  const [selectedPatientId, setSelectedPatientId] = useState<number>();
  const [selectedDoctorId, setSelectedDoctorId] = useState<number>();
  const [selectedMedicineId, setSelectedMedicineId] = useState<number>();
  const [selectedLabId, setSelectedLabId] = useState<number>();
  const [activeVisitId, setActiveVisitId] = useState<number>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canIntake = user?.role === "CENTER_MANAGER" || user?.role === "RECEPTIONIST";
  const canAssess = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR";

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const requests: Promise<unknown>[] = [
        apiRequest<WorkflowVisit[]>("/center/visit-workflow").then(setVisits)
      ];
      if (canIntake || canAssess) {
        requests.push(apiRequest<IntakeOptions>("/center/visit-workflow/intake-options").then(setOptions));
      }
      if (canAssess || user?.role === "LAB_TECH" || user?.role === "PHARMACIST") {
        requests.push(apiRequest<Catalogs>("/center/visit-workflow/catalogs").then(setCatalogs));
      }
      await Promise.all(requests);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الزيارات.");
    } finally {
      setRefreshing(false);
    }
  }, [canAssess, canIntake, user?.role]);

  useEffect(() => { void loadData(); }, [loadData]);

  function setField(name: string, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      setFields({});
      setActiveVisitId(undefined);
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ العملية.");
    } finally {
      setBusy(false);
    }
  }

  function createVisit() {
    if (!selectedPatientId) {
      setError("اختر المريض أولاً.");
      return;
    }
    void run(() => apiRequest("/center/visit-workflow", {
      method: "POST",
      body: JSON.stringify({
        patientId: selectedPatientId,
        doctorId: selectedDoctorId,
        visitDate: new Date().toISOString(),
        visitType: fields.visitType || "CONSULTATION",
        priority: fields.priority || "NORMAL",
        symptoms: fields.symptoms || undefined
      })
    }), "تم تسجيل الزيارة.");
  }

  function triage(visitId: number) {
    void run(() => apiRequest(`/center/visit-workflow/${visitId}/triage`, {
      method: "PATCH",
      body: JSON.stringify({
        bloodPressure: fields.bloodPressure || undefined,
        temperature: fields.temperature ? Number(fields.temperature) : undefined,
        heartRate: fields.heartRate ? Number(fields.heartRate) : undefined,
        oxygenSaturation: fields.oxygenSaturation ? Number(fields.oxygenSaturation) : undefined,
        notes: fields.notes || undefined
      })
    }), "تم حفظ التقييم التمريضي.");
  }

  function doctorAssessment(visitId: number) {
    if (!fields.diagnosis || fields.diagnosis.length < 3) {
      setError("أدخل التشخيص الطبي.");
      return;
    }
    const prescriptions = selectedMedicineId ? [{
      medicineId: selectedMedicineId,
      dosage: fields.dosage || "حسب إرشادات الطبيب",
      duration: fields.duration || "حسب الحاجة",
      quantity: Number(fields.quantity || 1)
    }] : [];
    void run(() => apiRequest(`/center/visit-workflow/${visitId}/doctor`, {
      method: "PATCH",
      body: JSON.stringify({
        diagnosis: fields.diagnosis,
        symptoms: fields.symptoms || undefined,
        notes: fields.notes || undefined,
        prescriptions,
        labTestIds: selectedLabId ? [selectedLabId] : []
      })
    }), "تم حفظ تقييم الطبيب.");
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData()} />}
      keyboardShouldPersistTaps="handled"
    >
      <View>
        <Text style={styles.title}>دورة الزيارات</Text>
        <Text style={styles.subtitle}>المهام الطبية والتشغيلية الخاصة بحسابك.</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      {canIntake ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>تسجيل زيارة جديدة</Text>
          <Text style={styles.label}>المريض</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
            {options.patients.map((patient) => (
              <Choice key={patient.id} active={selectedPatientId === patient.id} label={patient.fullName} onPress={() => setSelectedPatientId(patient.id)} />
            ))}
          </ScrollView>
          <Text style={styles.label}>الطبيب</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
            {options.doctors.map((doctor) => (
              <Choice key={doctor.id} active={selectedDoctorId === doctor.id} label={doctor.fullName} onPress={() => setSelectedDoctorId(doctor.id)} />
            ))}
          </ScrollView>
          <Text style={styles.label}>الأولوية</Text>
          <View style={styles.choices}>
            {(["NORMAL", "URGENT", "EMERGENCY"] as const).map((priority) => (
              <Choice key={priority} active={(fields.priority || "NORMAL") === priority} label={priorityLabels[priority]} onPress={() => setField("priority", priority)} />
            ))}
          </View>
          <Input placeholder="الأعراض الأولية" value={fields.symptoms} onChange={(value) => setField("symptoms", value)} />
          <Action disabled={busy} label="تسجيل الزيارة" onPress={createVisit} />
        </View>
      ) : null}

      {visits.map((visit) => {
        const expanded = activeVisitId === visit.id;
        return (
          <View key={visit.id} style={styles.card}>
            <Pressable onPress={() => setActiveVisitId(expanded ? undefined : visit.id)}>
              <View style={styles.cardHeader}>
                <Text style={[styles.priority, visit.priority === "EMERGENCY" && styles.danger]}>{priorityLabels[visit.priority]}</Text>
                <View style={styles.headerText}>
                  <Text style={styles.cardTitle}>{visit.patient.fullName}</Text>
                  <Text style={styles.meta}>{statusLabels[visit.workflowStatus] ?? visit.workflowStatus}</Text>
                </View>
              </View>
              <Text style={styles.meta}>الطبيب: {visit.doctor?.fullName ?? "لم يحدد"}</Text>
              <Text style={styles.meta}>التشخيص: {visit.diagnosis || "بانتظار التقييم"}</Text>
              {visit.invoice ? <Text style={styles.invoice}>الفاتورة: {visit.invoice.amount.toFixed(2)} شيكل</Text> : null}
            </Pressable>

            {expanded ? (
              <View style={styles.actionPanel}>
                {(user?.role === "NURSE" || user?.role === "CENTER_MANAGER") && visit.workflowStatus === "WAITING_TRIAGE" ? (
                  <>
                    <Input placeholder="ضغط الدم 120/80" value={fields.bloodPressure} onChange={(value) => setField("bloodPressure", value)} />
                    <View style={styles.inputRow}>
                      <Input compact placeholder="الحرارة" keyboard="numeric" value={fields.temperature} onChange={(value) => setField("temperature", value)} />
                      <Input compact placeholder="النبض" keyboard="numeric" value={fields.heartRate} onChange={(value) => setField("heartRate", value)} />
                    </View>
                    <Input placeholder="نسبة الأكسجين" keyboard="numeric" value={fields.oxygenSaturation} onChange={(value) => setField("oxygenSaturation", value)} />
                    <Input placeholder="ملاحظات التمريض" value={fields.notes} onChange={(value) => setField("notes", value)} />
                    <Action disabled={busy} label="حفظ تقييم التمريض" onPress={() => triage(visit.id)} />
                  </>
                ) : null}

                {canAssess && ["WAITING_DOCTOR", "IN_TREATMENT"].includes(visit.workflowStatus) ? (
                  <>
                    <Input placeholder="التشخيص" value={fields.diagnosis} onChange={(value) => setField("diagnosis", value)} />
                    <Text style={styles.label}>تشخيص مقترح</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
                      {catalogs.diseases.slice(0, 8).map((disease) => (
                        <Choice key={disease.id} active={fields.diagnosis === disease.name} label={disease.name} onPress={() => setField("diagnosis", disease.name)} />
                      ))}
                    </ScrollView>
                    <Text style={styles.label}>دواء اختياري</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
                      {catalogs.medicines.map((medicine) => (
                        <Choice key={medicine.id} active={selectedMedicineId === medicine.id} label={medicine.medicineName} onPress={() => setSelectedMedicineId(selectedMedicineId === medicine.id ? undefined : medicine.id)} />
                      ))}
                    </ScrollView>
                    {selectedMedicineId ? (
                      <View style={styles.inputRow}>
                        <Input compact placeholder="الجرعة" value={fields.dosage} onChange={(value) => setField("dosage", value)} />
                        <Input compact placeholder="المدة" value={fields.duration} onChange={(value) => setField("duration", value)} />
                      </View>
                    ) : null}
                    <Text style={styles.label}>فحص اختياري</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
                      {catalogs.labTests.map((test) => (
                        <Choice key={test.id} active={selectedLabId === test.id} label={test.testName} onPress={() => setSelectedLabId(selectedLabId === test.id ? undefined : test.id)} />
                      ))}
                    </ScrollView>
                    <Action disabled={busy} label="حفظ تقييم الطبيب" onPress={() => doctorAssessment(visit.id)} />
                  </>
                ) : null}

                {(user?.role === "LAB_TECH" || user?.role === "CENTER_MANAGER") ? visit.labRequests?.filter((request) => request.status !== "COMPLETED").map((request) => (
                  <View key={request.id} style={styles.task}>
                    <Text style={styles.cardTitle}>{request.test.testName}</Text>
                    <Input placeholder="نتيجة الفحص" value={fields[`lab-${request.id}`]} onChange={(value) => setField(`lab-${request.id}`, value)} />
                    <Action disabled={busy} label="اعتماد النتيجة" onPress={() => void run(() => apiRequest(`/center/visit-workflow/lab/${request.id}/result`, {
                      method: "PATCH", body: JSON.stringify({ resultValue: fields[`lab-${request.id}`] })
                    }), "تم اعتماد نتيجة الفحص.")} />
                  </View>
                )) : null}

                {(user?.role === "PHARMACIST" || user?.role === "CENTER_MANAGER") ? visit.prescriptions?.filter((item) => !item.dispensed).map((item) => (
                  <View key={item.id} style={styles.task}>
                    <Text style={styles.cardTitle}>{item.medicineName}</Text>
                    <Text style={styles.meta}>{item.dosage}، الكمية {item.quantity}</Text>
                    <Action disabled={busy} label="تأكيد تسليم الدواء" onPress={() => void run(() => apiRequest(`/center/visit-workflow/prescriptions/${item.id}/dispense`, { method: "PATCH" }), "تم تسجيل صرف الدواء.")} />
                  </View>
                )) : null}

                {canAssess && visit.workflowStatus === "READY_TO_UPLOAD" && visit.uploadStatus === "NOT_READY" ? (
                  <Action disabled={busy} label="إنشاء الفاتورة وتجهيز الملف" onPress={() => void run(() => apiRequest(`/center/visit-workflow/${visit.id}/complete`, { method: "POST" }), "تم إنشاء الفاتورة.")} />
                ) : null}
                {canAssess && ["READY", "FAILED"].includes(visit.uploadStatus) ? (
                  <Action disabled={busy} label={visit.uploadStatus === "FAILED" ? "إعادة محاولة الرفع" : "رفع إلى النظام المركزي"} onPress={() => void run(() => apiRequest(`/center/visit-workflow/${visit.id}/upload`, { method: "POST" }), "تم رفع الزيارة إلى النظام المركزي.")} />
                ) : null}
                {busy ? <ActivityIndicator color={colors.primary} /> : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {visits.length === 0 && !refreshing ? <Text style={styles.empty}>لا توجد زيارات مرتبطة بهذا الحساب.</Text> : null}
    </ScrollView>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

function Input({ placeholder, value, onChange, keyboard, compact }: { placeholder: string; value?: string; onChange: (value: string) => void; keyboard?: "numeric"; compact?: boolean }) {
  return <TextInput keyboardType={keyboard} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.input, compact && styles.compactInput]} textAlign="right" value={value ?? ""} onChangeText={onChange} />;
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}><Text style={styles.actionText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 28, fontWeight: "800", textAlign: "right" },
  subtitle: { color: colors.muted, textAlign: "right", marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  headerText: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "right" },
  meta: { color: colors.muted, textAlign: "right", lineHeight: 20 },
  priority: { color: colors.primary, backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 5, fontWeight: "800", fontSize: 12 },
  danger: { color: colors.danger, backgroundColor: "#fbeaea" },
  invoice: { color: colors.primary, fontWeight: "800", textAlign: "right" },
  actionPanel: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm },
  label: { color: colors.text, fontWeight: "700", textAlign: "right" },
  choices: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.xs },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 9, backgroundColor: "#fff" },
  choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.text, fontWeight: "700" },
  choiceTextActive: { color: "#fff" },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: "#fff" },
  compactInput: { flex: 1 },
  inputRow: { flexDirection: "row-reverse", gap: spacing.sm },
  action: { minHeight: 48, borderRadius: radii.sm, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
  actionText: { color: "#fff", fontWeight: "800", textAlign: "center" },
  disabled: { opacity: 0.6 },
  task: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, padding: spacing.sm, gap: spacing.sm },
  error: { color: colors.danger, backgroundColor: "#fbeaea", padding: spacing.sm, borderRadius: radii.sm, textAlign: "right", fontWeight: "700" },
  success: { color: colors.success, backgroundColor: "#e5f4ec", padding: spacing.sm, borderRadius: radii.sm, textAlign: "right", fontWeight: "700" },
  empty: { color: colors.muted, textAlign: "center", padding: spacing.xl }
});
