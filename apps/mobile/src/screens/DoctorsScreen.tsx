import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

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
import { formatDateTime, toArabicLabel, workDayLabels } from "../lib/arabic";
import { mediumApi } from "../services/mediumApi";
import { CenterDoctorsBundle, IntakeOptions, PortalAppointmentSuggestionRecord, PortalDoctorRecord, WorkDay } from "../types";
import { colors, spacing } from "../theme/tokens";

const genders = ["MALE", "FEMALE", "PREFER_NOT_TO_SAY"];
const workDays: WorkDay[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"];

export function DoctorsScreen() {
  const { user } = useAuth();
  const [portalDoctors, setPortalDoctors] = useState<PortalDoctorRecord[]>([]);
  const [centerBundle, setCenterBundle] = useState<CenterDoctorsBundle | null>(null);
  const [staffOptions, setStaffOptions] = useState<IntakeOptions>({ patients: [], doctors: [] });
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [suggestions, setSuggestions] = useState<PortalAppointmentSuggestionRecord[]>([]);
  const [form, setForm] = useState({
    username: "",
    password: "Password123!",
    fullName: "",
    nationalId: "",
    phone: "",
    email: "",
    gender: "PREFER_NOT_TO_SAY",
    specialization: "",
    yearsExperience: "0",
    licenseNumber: "",
    qualification: "",
    consultationRoom: "",
    shiftStartTime: "08:00",
    shiftEndTime: "14:00",
    shiftDays: workDays
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [shouldScrollToSuggestions, setShouldScrollToSuggestions] = useState(false);
  const screenRef = useRef<ScrollView | null>(null);
  const suggestionsRef = useRef<View | null>(null);

  const isPatient = user?.role === "PATIENT";
  const isManager = user?.role === "CENTER_MANAGER";

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      if (isPatient) {
        const payload = await mediumApi.portalDoctors();
        setPortalDoctors(payload);
        if (!selectedDoctorId && payload[0]) setSelectedDoctorId(payload[0].id);
      } else if (isManager) {
        setCenterBundle(await mediumApi.centerDoctors());
      } else {
        setStaffOptions(await mediumApi.workflowIntakeOptions());
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الأطباء.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [isManager, isPatient, selectedDoctorId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function scrollToTarget(target: View | null) {
    setTimeout(() => {
      const node = target as unknown as {
        scrollIntoView?: (options?: { behavior?: "smooth"; block?: "start" }) => void;
        measureLayout?: (
          relativeToNativeNode: unknown,
          onSuccess: (x: number, y: number) => void,
          onFail?: () => void
        ) => void;
      };
      const scroller = screenRef.current as unknown as { scrollTo?: (options: { y: number; animated: boolean }) => void };

      if (typeof node?.scrollIntoView === "function") {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (typeof node?.measureLayout === "function" && scroller) {
        node.measureLayout(
          scroller,
          (_x, y) => scroller.scrollTo?.({ y: Math.max(y - spacing.md, 0), animated: true }),
          () => undefined
        );
      }
    }, 0);
  }

  useEffect(() => {
    if (!shouldScrollToSuggestions || suggestions.length === 0) {
      return;
    }

    scrollToTarget(suggestionsRef.current);
    setShouldScrollToSuggestions(false);
  }, [shouldScrollToSuggestions, suggestions.length]);

  async function loadSuggestions(doctor: PortalDoctorRecord) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await mediumApi.appointmentSuggestions(doctor.id, new Date().toISOString());
      setSuggestions(payload);
      setSelectedDoctorId(doctor.id);
      setShouldScrollToSuggestions(payload.length > 0);
      setMessage(payload.length ? "تم تحميل أقرب المواعيد المتاحة." : "لا توجد اقتراحات قريبة حاليا.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل مواعيد الطبيب.");
    } finally {
      setBusy(false);
    }
  }

  async function createDoctor() {
    if (!isManager) return;
    if (!form.fullName.trim() || !form.nationalId.trim() || !form.phone.trim() || !form.specialization.trim() || !form.licenseNumber.trim()) {
      setError("أدخل الاسم، الهوية، الهاتف، التخصص، ورقم الترخيص.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await mediumApi.createCenterDoctor({
        username: form.username.trim() || undefined,
        password: form.password,
        fullName: form.fullName.trim(),
        nationalId: form.nationalId.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        gender: form.gender,
        specialization: form.specialization.trim(),
        yearsExperience: Number(form.yearsExperience || 0),
        licenseNumber: form.licenseNumber.trim(),
        qualification: form.qualification.trim() || undefined,
        shiftDays: form.shiftDays,
        shiftStartTime: form.shiftStartTime,
        shiftEndTime: form.shiftEndTime,
        consultationRoom: form.consultationRoom.trim() || undefined,
        isActive: true
      });
      setMessage("تم إنشاء حساب الطبيب.");
      setForm((current) => ({
        ...current,
        username: "",
        fullName: "",
        nationalId: "",
        phone: "",
        email: "",
        specialization: "",
        yearsExperience: "0",
        licenseNumber: "",
        qualification: "",
        consultationRoom: ""
      }));
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء حساب الطبيب.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDoctor(doctorId: number) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await mediumApi.deleteCenterDoctor(doctorId);
      setMessage("تم حذف حساب الطبيب.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف حساب الطبيب.");
    } finally {
      setBusy(false);
    }
  }

  function toggleWorkDay(day: WorkDay) {
    setForm((current) => ({
      ...current,
      shiftDays: current.shiftDays.includes(day)
        ? current.shiftDays.filter((item) => item !== day)
        : [...current.shiftDays, day]
    }));
  }

  if (loading) {
    return <LoadingState text="جار تحميل الأطباء..." />;
  }

  return (
    <Screen ref={screenRef} keyboard refreshing={refreshing} onRefresh={() => void loadData()}>
      <HeaderCard
        eyebrow="الأطباء"
        icon="medkit-outline"
        subtitle={isPatient ? "اختر طبيبا واعرض أقرب المواعيد المتاحة." : "إدارة أو مراجعة أطباء المركز المتوسط."}
        title={isPatient ? "دليل الأطباء" : "أطباء المركز"}
      />

      {error ? <Notice text={error} tone="error" /> : null}
      {message ? <Notice text={message} tone="success" /> : null}

      {isManager ? (
        <Card>
          <SectionTitle title="إضافة طبيب جديد" subtitle="تنشئ حسابا محليا للطبيب داخل المركز المتوسط." />
          <TextField label="اسم المستخدم" onChangeText={(value) => setForm((current) => ({ ...current, username: value }))} value={form.username} />
          <TextField label="كلمة المرور المؤقتة" onChangeText={(value) => setForm((current) => ({ ...current, password: value }))} value={form.password} />
          <TextField label="الاسم الكامل" onChangeText={(value) => setForm((current) => ({ ...current, fullName: value }))} value={form.fullName} />
          <View style={styles.row}>
            <TextField label="رقم الهوية" onChangeText={(value) => setForm((current) => ({ ...current, nationalId: value }))} value={form.nationalId} style={styles.flex} />
            <TextField label="الهاتف" onChangeText={(value) => setForm((current) => ({ ...current, phone: value }))} value={form.phone} style={styles.flex} />
          </View>
          <TextField label="البريد الإلكتروني" onChangeText={(value) => setForm((current) => ({ ...current, email: value }))} value={form.email} />
          <Text style={styles.label}>الجنس</Text>
          <ChipRow>
            {genders.map((gender) => (
              <ChoiceChip key={gender} label={toArabicLabel(gender)} onPress={() => setForm((current) => ({ ...current, gender }))} selected={form.gender === gender} />
            ))}
          </ChipRow>
          <View style={styles.row}>
            <TextField label="التخصص" onChangeText={(value) => setForm((current) => ({ ...current, specialization: value }))} value={form.specialization} style={styles.flex} />
            <TextField keyboardType="numeric" label="سنوات الخبرة" onChangeText={(value) => setForm((current) => ({ ...current, yearsExperience: value }))} value={form.yearsExperience} style={styles.flex} />
          </View>
          <View style={styles.row}>
            <TextField label="رقم الترخيص" onChangeText={(value) => setForm((current) => ({ ...current, licenseNumber: value }))} value={form.licenseNumber} style={styles.flex} />
            <TextField label="الغرفة" onChangeText={(value) => setForm((current) => ({ ...current, consultationRoom: value }))} value={form.consultationRoom} style={styles.flex} />
          </View>
          <TextField label="المؤهل العلمي" onChangeText={(value) => setForm((current) => ({ ...current, qualification: value }))} value={form.qualification} />
          <Text style={styles.label}>أيام الدوام</Text>
          <ChipRow>
            {Object.keys(workDayLabels).map((day) => (
              <ChoiceChip key={day} label={workDayLabels[day]} onPress={() => toggleWorkDay(day as WorkDay)} selected={form.shiftDays.includes(day as WorkDay)} />
            ))}
          </ChipRow>
          <View style={styles.row}>
            <TextField label="بداية الدوام" onChangeText={(value) => setForm((current) => ({ ...current, shiftStartTime: value }))} value={form.shiftStartTime} style={styles.flex} />
            <TextField label="نهاية الدوام" onChangeText={(value) => setForm((current) => ({ ...current, shiftEndTime: value }))} value={form.shiftEndTime} style={styles.flex} />
          </View>
          <AppButton disabled={busy} icon="person-add-outline" label="إنشاء حساب الطبيب" onPress={() => void createDoctor()} />
        </Card>
      ) : null}

      <Card>
        <SectionTitle title={isPatient ? "الأطباء المتاحون" : "قائمة الأطباء"} />
        {isPatient ? (
          <>
            {portalDoctors.map((doctor) => (
              <View key={doctor.id} style={styles.doctorCard}>
                <View style={styles.itemTop}>
                  <StatusPill label={`${doctor.yearsExperience} سنوات`} />
                  <Text style={styles.itemTitle}>{doctor.fullName}</Text>
                </View>
                <Text style={styles.meta}>
                  {doctor.specialization} | {doctor.department.name}
                </Text>
                <Text style={styles.meta}>{doctor.phone ?? "لا يوجد هاتف مباشر"}</Text>
                <AppButton disabled={busy} icon="calendar-outline" label="عرض المواعيد المقترحة" onPress={() => void loadSuggestions(doctor)} tone="ghost" />
              </View>
            ))}
            {portalDoctors.length === 0 ? <EmptyState text="لا توجد بيانات أطباء متاحة." /> : null}
          </>
        ) : isManager ? (
          <>
            {(centerBundle?.doctors ?? []).map((doctor) => (
              <View key={doctor.id} style={styles.doctorCard}>
                <View style={styles.itemTop}>
                  <StatusPill label={doctor.isActive ? "نشط" : "غير نشط"} />
                  <Text style={styles.itemTitle}>{doctor.fullName}</Text>
                </View>
                <Text style={styles.meta}>
                  {doctor.profile?.specialization ?? "بدون تخصص"} | {doctor.phone ?? "لا يوجد هاتف"}
                </Text>
                <Text style={styles.meta}>
                  {doctor.profile?.shiftDays.map((day) => workDayLabels[day]).join("، ") || "لم تسجل أيام دوام"}
                </Text>
                <AppButton disabled={busy} icon="trash-outline" label="حذف الحساب" onPress={() => void deleteDoctor(doctor.id)} tone="danger" />
              </View>
            ))}
            {(centerBundle?.doctors ?? []).length === 0 ? <EmptyState text="لا يوجد أطباء محليون مسجلون." /> : null}
          </>
        ) : (
          <>
            {staffOptions.doctors.map((doctor) => (
              <View key={doctor.id} style={styles.doctorCard}>
                <Text style={styles.itemTitle}>{doctor.fullName}</Text>
                <Text style={styles.meta}>طبيب ضمن مسار الزيارات في المركز.</Text>
              </View>
            ))}
            {staffOptions.doctors.length === 0 ? <EmptyState text="لا توجد قائمة أطباء متاحة لهذا الدور." /> : null}
          </>
        )}
      </Card>

      {isPatient && suggestions.length > 0 ? (
        <View ref={suggestionsRef}>
        <Card>
          <SectionTitle title="أقرب المواعيد المقترحة" />
          {suggestions.slice(0, 6).map((slot) => (
            <View key={slot.scheduledAt} style={styles.doctorCard}>
              <Text style={styles.itemTitle}>{formatDateTime(slot.scheduledAt)}</Text>
              <Text style={styles.meta}>{slot.note}</Text>
            </View>
          ))}
        </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    gap: spacing.sm
  },
  flex: {
    flex: 1
  },
  label: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "right"
  },
  doctorCard: {
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
  itemTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "right",
    lineHeight: 23
  },
  meta: {
    color: colors.muted,
    textAlign: "right",
    lineHeight: 21
  }
});
