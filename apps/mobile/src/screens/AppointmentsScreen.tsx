import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppointmentCard } from "../components/AppointmentCard";
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
  TextField
} from "../components/ui";
import { combineDateAndTime, formatDateTime, tomorrowDateInput, toArabicLabel } from "../lib/arabic";
import { mediumApi } from "../services/mediumApi";
import { AppointmentItem, PortalAppointmentSuggestionRecord, PortalDoctorRecord } from "../types";
import { colors, spacing } from "../theme/tokens";

const appointmentTypes = ["CLINIC", "FOLLOW_UP", "TELEMEDICINE", "LAB"];

export function AppointmentsScreen() {
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [doctors, setDoctors] = useState<PortalDoctorRecord[]>([]);
  const [suggestions, setSuggestions] = useState<PortalAppointmentSuggestionRecord[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedType, setSelectedType] = useState("CLINIC");
  const [date, setDate] = useState(tomorrowDateInput());
  const [time, setTime] = useState("10:00");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === selectedDoctorId),
    [doctors, selectedDoctorId]
  );

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [appointmentsPayload, doctorsPayload] = await Promise.all([
        mediumApi.appointments(),
        mediumApi.portalDoctors()
      ]);

      setAppointments(appointmentsPayload);
      setDoctors(doctorsPayload);
      if (!selectedDoctorId && doctorsPayload[0]) {
        setSelectedDoctorId(doctorsPayload[0].id);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل المواعيد.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [selectedDoctorId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function loadSuggestions() {
    if (!selectedDoctor) return;
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const payload = await mediumApi.appointmentSuggestions(selectedDoctor.id, new Date(`${date}T00:00:00`).toISOString(), selectedType);
      setSuggestions(payload);
      setMessage(payload.length > 0 ? "تم تحميل أقرب المواعيد المقترحة." : "لا توجد اقتراحات متاحة لهذا اليوم.");
    } catch (cause) {
      setSuggestions([]);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل المواعيد المقترحة.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createAppointment() {
    if (!selectedDoctor) {
      setError("اختر الطبيب أولا.");
      return;
    }

    if (reason.trim().length < 5) {
      setError("اكتب سبب الزيارة بشكل واضح.");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      await mediumApi.createAppointment({
        doctorId: selectedDoctor.id,
        departmentId: selectedDoctor.department.id,
        scheduledAt: combineDateAndTime(date, time),
        type: selectedType,
        reason: reason.trim(),
        notes: notes.trim() || undefined
      });

      setReason("");
      setNotes("");
      setSuggestions([]);
      setMessage("تم إنشاء الموعد بنجاح.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء الموعد.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelAppointment(appointmentId: string) {
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await mediumApi.cancelAppointment(appointmentId);
      setMessage("تم إلغاء الموعد.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إلغاء الموعد.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <LoadingState text="جار تحميل المواعيد..." />;
  }

  return (
    <Screen keyboard refreshing={refreshing} onRefresh={() => void loadData()}>
      <HeaderCard
        eyebrow="حجز ومتابعة"
        icon="calendar-outline"
        subtitle="اختر الطبيب من القائمة، حدد نوع الزيارة، ثم احجز موعدك مباشرة."
        title="المواعيد الطبية"
      />

      {error ? <Notice text={error} tone="error" /> : null}
      {message ? <Notice text={message} tone="success" /> : null}

      <Card>
        <SectionTitle title="حجز موعد جديد" subtitle="القائمة تعرض أطباء المركز المرتبطين بحسابك." />
        <Text style={styles.label}>الطبيب</Text>
        <ChipRow>
          {doctors.map((doctor) => (
            <ChoiceChip
              key={doctor.id}
              label={`${doctor.fullName} - ${doctor.specialization}`}
              onPress={() => {
                setSelectedDoctorId(doctor.id);
                setSuggestions([]);
              }}
              selected={selectedDoctorId === doctor.id}
            />
          ))}
        </ChipRow>

        <Text style={styles.label}>نوع الزيارة</Text>
        <ChipRow>
          {appointmentTypes.map((type) => (
            <ChoiceChip key={type} label={toArabicLabel(type)} onPress={() => setSelectedType(type)} selected={selectedType === type} />
          ))}
        </ChipRow>

        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.label}>التاريخ</Text>
            <ChoiceChip label={date} onPress={() => setDate(tomorrowDateInput())} selected />
          </View>
          <View style={styles.flex}>
            <Text style={styles.label}>الوقت</Text>
            <ChoiceChip label={time} onPress={() => setTime(time === "10:00" ? "12:00" : "10:00")} selected />
          </View>
        </View>

        <AppButton disabled={submitting || !selectedDoctor} icon="sparkles-outline" label="اقتراح أقرب موعد" onPress={() => void loadSuggestions()} tone="ghost" />

        {suggestions.length > 0 ? (
          <View style={styles.suggestionStack}>
            {suggestions.slice(0, 4).map((slot) => (
              <ChoiceChip
                key={slot.scheduledAt}
                label={formatDateTime(slot.scheduledAt)}
                onPress={() => {
                  const selected = new Date(slot.scheduledAt);
                  setDate(selected.toISOString().slice(0, 10));
                  setTime(selected.toTimeString().slice(0, 5));
                }}
              />
            ))}
          </View>
        ) : null}

        <TextField label="سبب الزيارة" onChangeText={setReason} placeholder="مثال: مراجعة ضغط الدم" value={reason} />
        <TextField label="ملاحظات اختيارية" multiline onChangeText={setNotes} placeholder="أي تفاصيل تساعد الطبيب قبل الموعد" value={notes} />
        <AppButton disabled={submitting} icon="checkmark-circle-outline" label="تأكيد الحجز" onPress={() => void createAppointment()} />
      </Card>

      <Card>
        <SectionTitle title="قائمة المواعيد" subtitle="تظهر المواعيد القادمة والسابقة حسب حالة كل موعد." />
        {appointments.map((appointment) => (
          <AppointmentCard
            key={appointment.id}
            actionLabel={["SCHEDULED", "CONFIRMED"].includes(appointment.status) ? "إلغاء الموعد" : undefined}
            appointment={appointment}
            onPressAction={
              ["SCHEDULED", "CONFIRMED"].includes(appointment.status)
                ? () => void cancelAppointment(appointment.id)
                : undefined
            }
          />
        ))}
        {appointments.length === 0 ? <EmptyState text="لا توجد مواعيد مسجلة حاليا." /> : null}
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
  row: {
    flexDirection: "row-reverse",
    gap: spacing.sm
  },
  flex: {
    flex: 1,
    gap: spacing.xs
  },
  suggestionStack: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.xs
  }
});
