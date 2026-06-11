import { useEffect, useState } from "react";
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
import { mediumApi } from "../services/mediumApi";
import { AiCareInsightContext, AiCareInsightResponse } from "../types";
import { colors, spacing } from "../theme/tokens";

const contexts: Array<{ key: AiCareInsightContext; label: string }> = [
  { key: "PATIENT_SELF_CARE", label: "إرشاد المريض" },
  { key: "CLINICAL_TRIAGE", label: "فرز سريري" },
  { key: "FOLLOW_UP", label: "متابعة" }
];

const urgencyLabels: Record<string, string> = {
  LOW: "منخفض",
  ROUTINE: "روتيني",
  URGENT: "عاجل",
  EMERGENCY: "طارئ"
};

export function AiAssistantScreen() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [context, setContext] = useState<AiCareInsightContext>(
    user?.role === "PATIENT" ? "PATIENT_SELF_CARE" : "CLINICAL_TRIAGE"
  );
  const [patientAge, setPatientAge] = useState("");
  const [gender, setGender] = useState("");
  const [chronicDiseases, setChronicDiseases] = useState("");
  const [allergies, setAllergies] = useState("");
  const [currentMedications, setCurrentMedications] = useState("");
  const [capabilities, setCapabilities] = useState<{ features: string[]; model: string; fallback: boolean } | null>(null);
  const [result, setResult] = useState<AiCareInsightResponse | null>(null);
  const [loadingCapabilities, setLoadingCapabilities] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mediumApi.aiCapabilities()
      .then(setCapabilities)
      .catch(() => setCapabilities(null))
      .finally(() => setLoadingCapabilities(false));
  }, []);

  async function askAssistant() {
    if (message.trim().length < 3) {
      setError("اكتب وصفا للحالة أو السؤال الطبي.");
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);

    try {
      setResult(
        await mediumApi.careInsights({
          message: message.trim(),
          patientAge: patientAge ? Number(patientAge) : undefined,
          gender: gender.trim() || undefined,
          chronicDiseases: chronicDiseases.trim() || undefined,
          allergies: allergies.trim() || undefined,
          currentMedications: currentMedications.trim() || undefined,
          context
        })
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تشغيل المساعد الذكي.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <HeaderCard
        eyebrow="المساعد الذكي"
        icon="sparkles-outline"
        subtitle="يدعم الفرز والمتابعة وأسئلة الطبيب، ولا يغني عن القرار الطبي."
        title="مساعد الرعاية"
      />

      {error ? <Notice text={error} tone="error" /> : null}

      <Card>
        <SectionTitle title="سياق السؤال" />
        <ChipRow>
          {contexts.map((item) => (
            <ChoiceChip key={item.key} label={item.label} onPress={() => setContext(item.key)} selected={context === item.key} />
          ))}
        </ChipRow>
        <TextField label="وصف الحالة أو السؤال" multiline onChangeText={setMessage} placeholder="اكتب الأعراض، مدة المشكلة، وأي تفاصيل مهمة..." value={message} />
        <View style={styles.row}>
          <TextField keyboardType="numeric" label="العمر" onChangeText={setPatientAge} value={patientAge} style={styles.flex} />
          <TextField label="الجنس" onChangeText={setGender} value={gender} style={styles.flex} />
        </View>
        <TextField label="أمراض مزمنة" onChangeText={setChronicDiseases} value={chronicDiseases} />
        <TextField label="حساسيات" onChangeText={setAllergies} value={allergies} />
        <TextField label="أدوية حالية" onChangeText={setCurrentMedications} value={currentMedications} />
        <AppButton disabled={busy} icon="send-outline" label="طلب تحليل ذكي" onPress={() => void askAssistant()} />
      </Card>

      <Card>
        <SectionTitle title="قدرات الخدمة" />
        {loadingCapabilities ? <LoadingState text="جار فحص قدرات المساعد..." /> : null}
        {capabilities ? (
          <>
            <Text style={styles.meta}>النموذج: {capabilities.model}</Text>
            <ChipRow>
              {capabilities.features.map((feature) => (
                <ChoiceChip key={feature} label={feature} onPress={() => undefined} />
              ))}
            </ChipRow>
          </>
        ) : !loadingCapabilities ? (
          <EmptyState text="لم يتم تحميل معلومات قدرات المساعد، لكن يمكنك إرسال السؤال مباشرة." />
        ) : null}
      </Card>

      {result ? (
        <Card>
          <View style={styles.itemTop}>
            <StatusPill label={urgencyLabels[result.urgency] ?? result.urgency} tone={result.urgency === "EMERGENCY" ? "danger" : result.urgency === "URGENT" ? "warning" : "primary"} />
            <Text style={styles.title}>نتيجة المساعد</Text>
          </View>
          <Text style={styles.summary}>{result.summary}</Text>
          <ResultList title="إجراءات مقترحة" items={result.suggestedActions} />
          <ResultList title="أسئلة للطبيب" items={result.questionsForClinician} />
          <ResultList title="علامات خطر" items={result.redFlags} />
          <ResultList title="رعاية ذاتية" items={result.selfCare} />
          <Notice text={result.disclaimer} />
        </Card>
      ) : null}
    </Screen>
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <View style={styles.resultBlock}>
      <Text style={styles.blockTitle}>{title}</Text>
      {items.map((item, index) => (
        <Text key={`${title}-${index}`} style={styles.bullet}>
          {index + 1}. {item}
        </Text>
      ))}
    </View>
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
  meta: {
    color: colors.muted,
    textAlign: "right",
    lineHeight: 21
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
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right"
  },
  summary: {
    color: colors.text,
    textAlign: "right",
    lineHeight: 23,
    fontWeight: "800"
  },
  resultBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 4
  },
  blockTitle: {
    color: colors.primary,
    fontWeight: "900",
    textAlign: "right"
  },
  bullet: {
    color: colors.text,
    textAlign: "right",
    lineHeight: 22
  }
});
