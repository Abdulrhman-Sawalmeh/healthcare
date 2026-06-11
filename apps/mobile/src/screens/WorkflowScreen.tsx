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
import { combineDateAndTime, priorityLabels, toArabicLabel, tomorrowDateInput } from "../lib/arabic";
import { mediumApi } from "../services/mediumApi";
import { Catalogs, IntakeOptions, WorkflowVisit } from "../types";
import { colors, spacing } from "../theme/tokens";

const priorityOptions = ["NORMAL", "URGENT", "EMERGENCY"];
const visitTypes = ["CONSULTATION", "FOLLOW_UP", "LAB", "EMERGENCY"];
const filters = ["ALL", "WAITING_TRIAGE", "WAITING_DOCTOR", "WAITING_LAB", "WAITING_PHARMACY", "READY_TO_UPLOAD"];

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
  const [filter, setFilter] = useState("ALL");
  const [date, setDate] = useState(tomorrowDateInput());
  const [time, setTime] = useState("09:00");
  const [fields, setFields] = useState<Record<string, string>>({
    priority: "NORMAL",
    visitType: "CONSULTATION"
  });
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canIntake = user?.role === "CENTER_MANAGER" || user?.role === "RECEPTIONIST";
  const canAssess = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR";
  const canTriage = user?.role === "CENTER_MANAGER" || user?.role === "NURSE";
  const canLab = user?.role === "CENTER_MANAGER" || user?.role === "LAB_TECH";
  const canPharmacy = user?.role === "CENTER_MANAGER" || user?.role === "PHARMACIST";

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const status = filter === "ALL" ? undefined : filter;
      const tasks: Array<Promise<unknown>> = [mediumApi.workflowVisits(status).then(setVisits)];

      if (canIntake || canAssess) {
        tasks.push(mediumApi.workflowIntakeOptions().then(setOptions));
      }
      if (canAssess || canLab || canPharmacy) {
        tasks.push(mediumApi.workflowCatalogs().then(setCatalogs));
      }

      await Promise.all(tasks);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل زيارات المسار.");
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, [canAssess, canIntake, canLab, canPharmacy, filter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
      setFields((current) => ({
        priority: current.priority ?? "NORMAL",
        visitType: current.visitType ?? "CONSULTATION"
      }));
      setSelectedMedicineId(undefined);
      setSelectedLabId(undefined);
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ العملية.");
    } finally {
      setBusy(false);
    }
  }

  function createVisit() {
    if (!selectedPatientId) {
      setError("اختر المريض قبل تسجيل الزيارة.");
      return;
    }

    void run(
      () =>
        mediumApi.createWorkflowVisit({
          patientId: selectedPatientId,
          doctorId: selectedDoctorId,
          visitDate: combineDateAndTime(date, time),
          visitTime: time,
          visitType: fields.visitType || "CONSULTATION",
          priority: fields.priority || "NORMAL",
          symptoms: fields.symptoms || undefined,
          notes: fields.notes || undefined
        }),
      "تم تسجيل الزيارة وإدخالها إلى مسار الرعاية."
    );
  }

  function triage(visitId: number) {
    void run(
      () =>
        mediumApi.saveTriage(visitId, {
          bloodPressure: fields.bloodPressure || undefined,
          temperature: fields.temperature ? Number(fields.temperature) : undefined,
          heartRate: fields.heartRate ? Number(fields.heartRate) : undefined,
          oxygenSaturation: fields.oxygenSaturation ? Number(fields.oxygenSaturation) : undefined,
          notes: fields.triageNotes || undefined
        }),
      "تم حفظ تقييم التمريض."
    );
  }

  function doctorAssessment(visitId: number) {
    if (!fields.diagnosis || fields.diagnosis.trim().length < 3) {
      setError("أدخل التشخيص الطبي قبل الحفظ.");
      return;
    }

    const medicine = catalogs.medicines.find((item) => item.id === selectedMedicineId);
    const prescriptions = medicine
      ? [
          {
            medicineId: medicine.id,
            dosage: fields.dosage || "حسب إرشادات الطبيب",
            duration: fields.duration || "حسب الحاجة",
            quantity: Number(fields.quantity || 1)
          }
        ]
      : [];

    void run(
      () =>
        mediumApi.saveDoctorAssessment(visitId, {
          diagnosis: fields.diagnosis,
          symptoms: fields.symptoms || undefined,
          notes: fields.doctorNotes || undefined,
          prescriptions,
          labTestIds: selectedLabId ? [selectedLabId] : []
        }),
      "تم حفظ تقييم الطبيب."
    );
  }

  if (!loaded && refreshing) {
    return <LoadingState text="جار تحميل مسار الزيارات..." />;
  }

  return (
    <Screen keyboard refreshing={refreshing} onRefresh={() => void loadData()}>
      <HeaderCard
        eyebrow="ملفات الزيارة والمتابعة"
        icon="medical-outline"
        subtitle="كل دور يرى المهام التي تخصه فقط داخل دورة الرعاية."
        title="مسار الزيارة"
      />

      {error ? <Notice text={error} tone="error" /> : null}
      {message ? <Notice text={message} tone="success" /> : null}

      <Card>
        <SectionTitle title="تصفية المسار" subtitle="اختر حالة لعرض الزيارات المرتبطة بها." />
        <ChipRow>
          {filters.map((item) => (
            <ChoiceChip
              key={item}
              label={item === "ALL" ? "الكل" : toArabicLabel(item)}
              onPress={() => setFilter(item)}
              selected={filter === item}
            />
          ))}
        </ChipRow>
      </Card>

      {canIntake ? (
        <Card>
          <SectionTitle title="تسجيل زيارة جديدة" subtitle="تستخدم للاستقبال قبل انتقال المريض إلى التمريض والطبيب." />
          <Text style={styles.label}>المريض</Text>
          <ChipRow>
            {options.patients.map((patient) => (
              <ChoiceChip
                key={patient.id}
                label={`${patient.fullName} - ${patient.phone}`}
                onPress={() => setSelectedPatientId(patient.id)}
                selected={selectedPatientId === patient.id}
              />
            ))}
          </ChipRow>

          <Text style={styles.label}>الطبيب</Text>
          <ChipRow>
            {options.doctors.map((doctor) => (
              <ChoiceChip
                key={doctor.id}
                label={doctor.fullName}
                onPress={() => setSelectedDoctorId(selectedDoctorId === doctor.id ? undefined : doctor.id)}
                selected={selectedDoctorId === doctor.id}
              />
            ))}
          </ChipRow>

          <Text style={styles.label}>نوع الزيارة</Text>
          <ChipRow>
            {visitTypes.map((type) => (
              <ChoiceChip key={type} label={toArabicLabel(type)} onPress={() => setField("visitType", type)} selected={(fields.visitType || "CONSULTATION") === type} />
            ))}
          </ChipRow>

          <Text style={styles.label}>الأولوية</Text>
          <ChipRow>
            {priorityOptions.map((priority) => (
              <ChoiceChip
                key={priority}
                label={priorityLabels[priority] ?? priority}
                onPress={() => setField("priority", priority)}
                selected={(fields.priority || "NORMAL") === priority}
              />
            ))}
          </ChipRow>

          <View style={styles.row}>
            <TextField label="التاريخ" onChangeText={setDate} value={date} style={styles.flex} />
            <TextField label="الوقت" onChangeText={setTime} value={time} style={styles.flex} />
          </View>
          <TextField label="الأعراض الأولية" multiline onChangeText={(value) => setField("symptoms", value)} value={fields.symptoms ?? ""} />
          <TextField label="ملاحظات الاستقبال" multiline onChangeText={(value) => setField("notes", value)} value={fields.notes ?? ""} />
          <AppButton disabled={busy} icon="add-circle-outline" label="تسجيل الزيارة" onPress={createVisit} />
        </Card>
      ) : null}

      {visits.map((visit) => {
        const expanded = activeVisitId === visit.id;
        const openLabRequests = visit.labRequests?.filter((request) => request.status !== "COMPLETED") ?? [];
        const openPrescriptions = visit.prescriptions?.filter((item) => !item.dispensed) ?? [];

        return (
          <Card key={visit.id}>
            <AppButton
              icon={expanded ? "chevron-up-outline" : "chevron-down-outline"}
              label={expanded ? "إخفاء التفاصيل" : "فتح تفاصيل الزيارة"}
              onPress={() => setActiveVisitId(expanded ? undefined : visit.id)}
              tone="ghost"
            />
            <View style={styles.visitHeader}>
              <StatusPill label={priorityLabels[visit.priority]} tone={visit.priority === "EMERGENCY" ? "danger" : "primary"} />
              <View style={styles.visitText}>
                <Text style={styles.visitTitle}>{visit.patient.fullName}</Text>
                <Text style={styles.meta}>{toArabicLabel(visit.workflowStatus)}</Text>
              </View>
            </View>
            <Text style={styles.meta}>الطبيب: {visit.doctor?.fullName ?? "لم يحدد"}</Text>
            <Text style={styles.meta}>التشخيص: {visit.diagnosis || "بانتظار التقييم"}</Text>
            {visit.invoice ? <Text style={styles.invoice}>الفاتورة: {visit.invoice.amount.toFixed(2)} شيكل</Text> : null}

            {expanded ? (
              <View style={styles.actionPanel}>
                {canTriage && visit.workflowStatus === "WAITING_TRIAGE" ? (
                  <View style={styles.taskBlock}>
                    <SectionTitle title="تقييم التمريض" />
                    <TextField label="ضغط الدم" onChangeText={(value) => setField("bloodPressure", value)} placeholder="120/80" value={fields.bloodPressure ?? ""} />
                    <View style={styles.row}>
                      <TextField keyboardType="numeric" label="الحرارة" onChangeText={(value) => setField("temperature", value)} value={fields.temperature ?? ""} style={styles.flex} />
                      <TextField keyboardType="numeric" label="النبض" onChangeText={(value) => setField("heartRate", value)} value={fields.heartRate ?? ""} style={styles.flex} />
                    </View>
                    <TextField keyboardType="numeric" label="الأكسجين" onChangeText={(value) => setField("oxygenSaturation", value)} value={fields.oxygenSaturation ?? ""} />
                    <TextField label="ملاحظات" multiline onChangeText={(value) => setField("triageNotes", value)} value={fields.triageNotes ?? ""} />
                    <AppButton disabled={busy} label="حفظ تقييم التمريض" onPress={() => triage(visit.id)} />
                  </View>
                ) : null}

                {canAssess && ["WAITING_DOCTOR", "IN_TREATMENT"].includes(visit.workflowStatus) ? (
                  <View style={styles.taskBlock}>
                    <SectionTitle title="تقييم الطبيب" />
                    <TextField label="التشخيص" multiline onChangeText={(value) => setField("diagnosis", value)} value={fields.diagnosis ?? ""} />
                    <Text style={styles.label}>تشخيص مقترح</Text>
                    <ChipRow>
                      {catalogs.diseases.slice(0, 8).map((disease) => (
                        <ChoiceChip key={disease.id} label={disease.name} onPress={() => setField("diagnosis", disease.name)} selected={fields.diagnosis === disease.name} />
                      ))}
                    </ChipRow>
                    <Text style={styles.label}>دواء اختياري</Text>
                    <ChipRow>
                      {catalogs.medicines.slice(0, 10).map((medicine) => (
                        <ChoiceChip
                          key={medicine.id}
                          label={medicine.medicineName}
                          onPress={() => setSelectedMedicineId(selectedMedicineId === medicine.id ? undefined : medicine.id)}
                          selected={selectedMedicineId === medicine.id}
                        />
                      ))}
                    </ChipRow>
                    {selectedMedicineId ? (
                      <View style={styles.row}>
                        <TextField label="الجرعة" onChangeText={(value) => setField("dosage", value)} value={fields.dosage ?? ""} style={styles.flex} />
                        <TextField label="المدة" onChangeText={(value) => setField("duration", value)} value={fields.duration ?? ""} style={styles.flex} />
                      </View>
                    ) : null}
                    <Text style={styles.label}>فحص اختياري</Text>
                    <ChipRow>
                      {catalogs.labTests.slice(0, 10).map((test) => (
                        <ChoiceChip
                          key={test.id}
                          label={test.testName}
                          onPress={() => setSelectedLabId(selectedLabId === test.id ? undefined : test.id)}
                          selected={selectedLabId === test.id}
                        />
                      ))}
                    </ChipRow>
                    <TextField label="ملاحظات الطبيب" multiline onChangeText={(value) => setField("doctorNotes", value)} value={fields.doctorNotes ?? ""} />
                    <AppButton disabled={busy} label="حفظ تقييم الطبيب" onPress={() => doctorAssessment(visit.id)} />
                  </View>
                ) : null}

                {canLab && openLabRequests.map((request) => (
                  <View key={request.id} style={styles.taskBlock}>
                    <SectionTitle title={`نتيجة المختبر: ${request.test.testName}`} subtitle={request.test.normalRange ?? undefined} />
                    <TextField label="نتيجة الفحص" multiline onChangeText={(value) => setField(`lab-${request.id}`, value)} value={fields[`lab-${request.id}`] ?? ""} />
                    <AppButton
                      disabled={busy || !fields[`lab-${request.id}`]}
                      label="اعتماد النتيجة"
                      onPress={() =>
                        void run(
                          () => mediumApi.saveLabResult(request.id, { resultValue: fields[`lab-${request.id}`] }),
                          "تم اعتماد نتيجة الفحص."
                        )
                      }
                    />
                  </View>
                ))}

                {canPharmacy && openPrescriptions.map((prescription) => (
                  <View key={prescription.id} style={styles.taskBlock}>
                    <SectionTitle title={prescription.medicineName} subtitle={`${prescription.dosage} | الكمية ${prescription.quantity}`} />
                    <AppButton
                      disabled={busy}
                      label="تأكيد صرف الدواء"
                      onPress={() =>
                        void run(
                          () => mediumApi.dispensePrescription(prescription.id),
                          "تم تسجيل صرف الدواء."
                        )
                      }
                    />
                  </View>
                ))}

                {canAssess && visit.workflowStatus === "READY_TO_UPLOAD" && visit.uploadStatus === "NOT_READY" ? (
                  <AppButton
                    disabled={busy}
                    icon="document-text-outline"
                    label="إنشاء الفاتورة وتجهيز الملف"
                    onPress={() =>
                      void run(
                        () => mediumApi.completeWorkflowVisit(visit.id),
                        "تم إنشاء الفاتورة وتجهيز الملف."
                      )
                    }
                  />
                ) : null}

                {canAssess && ["READY", "FAILED"].includes(visit.uploadStatus) ? (
                  <AppButton
                    disabled={busy}
                    icon="cloud-upload-outline"
                    label={visit.uploadStatus === "FAILED" ? "إعادة محاولة الرفع" : "رفع إلى النظام المركزي"}
                    onPress={() =>
                      void run(
                        () => mediumApi.uploadWorkflowVisit(visit.id),
                        "تم إرسال الزيارة إلى النظام المركزي."
                      )
                    }
                  />
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}

      {visits.length === 0 ? <EmptyState text="لا توجد زيارات مطابقة لهذا الحساب أو الفلتر الحالي." /> : null}
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
  visitHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  visitText: {
    flex: 1
  },
  visitTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right"
  },
  meta: {
    color: colors.muted,
    textAlign: "right",
    lineHeight: 21
  },
  invoice: {
    color: colors.primary,
    fontWeight: "900",
    textAlign: "right"
  },
  actionPanel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.sm
  },
  taskBlock: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.sm
  }
});
