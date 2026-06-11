import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AppButton,
  Card,
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
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { mediumApi } from "../services/mediumApi";
import { AuditLogRecord, PrescriptionVerificationResult } from "../types";
import { colors, spacing } from "../theme/tokens";

export function PrescriptionVerificationScreen() {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<PrescriptionVerificationResult | null>(null);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user?.role !== "CENTER_MANAGER") return;
    setLoadingLogs(true);
    mediumApi.auditLogs(12)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoadingLogs(false));
  }, [user?.role]);

  async function verify() {
    if (!code.trim()) {
      setError("أدخل رمز التحقق أو قيمة QR أولا.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    setResult(null);

    try {
      const payload = await mediumApi.verifyPrescription(code.trim());
      setResult(payload);
      setMessage(payload.authentic ? "الوصفة أصلية ومطابقة لسجلات المركز." : "لم يتم تأكيد أصالة هذه الوصفة.");
      if (user?.role === "CENTER_MANAGER") {
        setLogs(await mediumApi.auditLogs(12).catch(() => []));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر التحقق من الوصفة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <HeaderCard
        eyebrow="التحقق من الوصفات"
        icon="shield-checkmark-outline"
        subtitle="استخدم رمز التحقق المطبوع أو قيمة QR للتأكد من أن الوصفة صادرة عن المركز."
        title="توثيق الوصفة"
      />

      {error ? <Notice text={error} tone="error" /> : null}
      {message ? <Notice text={message} tone={result?.authentic ? "success" : "error"} /> : null}

      <Card>
        <SectionTitle title="إدخال الرمز" />
        <TextField
          label="رمز الوصفة"
          multiline
          onChangeText={setCode}
          placeholder="مثال: healthcare-prescription:..."
          value={code}
        />
        <AppButton disabled={busy} icon="search-outline" label="تحقق الآن" onPress={() => void verify()} />
      </Card>

      {result ? (
        <Card>
          <View style={styles.itemTop}>
            <StatusPill label={result.authentic ? "أصلية" : "غير مؤكدة"} tone={result.authentic ? "primary" : "danger"} />
            <Text style={styles.title}>نتيجة التحقق</Text>
          </View>
          {result.prescription ? (
            <>
              <Text style={styles.primaryText}>{result.prescription.medicineName}</Text>
              <Text style={styles.meta}>
                الجرعة: {result.prescription.dosage} | المدة: {result.prescription.duration} | الكمية: {result.prescription.quantity}
              </Text>
              <Text style={styles.meta}>المريض: {result.prescription.visit.patientName}</Text>
              <Text style={styles.meta}>الطبيب: {result.prescription.visit.doctorName}</Text>
              <Text style={styles.meta}>
                الزيارة: {result.prescription.visit.diagnosis} | {formatDateTime(result.prescription.visit.visitDate)}
              </Text>
              <Text style={styles.meta}>
                المركز: {result.prescription.visit.centerName} ({result.prescription.visit.centerCode})
              </Text>
            </>
          ) : (
            <EmptyState text="لم يتم العثور على وصفة مرتبطة بهذا الرمز داخل المركز." />
          )}
        </Card>
      ) : null}

      {user?.role === "CENTER_MANAGER" ? (
        <Card>
          <SectionTitle title="آخر سجلات التدقيق" subtitle="تظهر عمليات التحقق والتغييرات الإدارية الأخيرة." />
          {loadingLogs ? <LoadingState text="جار تحميل السجلات..." /> : null}
          {logs.map((log) => (
            <View key={log.id} style={styles.logItem}>
              <Text style={styles.primaryText}>{toArabicLabel(log.action)}</Text>
              <Text style={styles.meta}>
                {log.entityType} #{log.entityId ?? "-"}
              </Text>
              <Text style={styles.dateText}>{formatDateTime(log.createdAt)}</Text>
            </View>
          ))}
          {!loadingLogs && logs.length === 0 ? <EmptyState text="لا توجد سجلات تدقيق حديثة." /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  dateText: {
    color: colors.primary,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800"
  },
  logItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 4
  }
});
