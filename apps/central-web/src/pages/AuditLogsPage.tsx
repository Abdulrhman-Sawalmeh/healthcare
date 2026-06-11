import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate } from "../lib/arabic";

interface AuditLogRecord {
  id: number;
  action: string;
  entityType: string;
  entityId?: string | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  createdAt: string;
  center?: {
    centerName: string;
    centerCode: string;
  } | null;
}

interface PrescriptionVerificationResult {
  authentic: boolean;
  qrValue: string;
  prescription: {
    id: number;
    verificationCode?: string | null;
    issuedAt: string;
    medicineName: string;
    dosage: string;
    duration: string;
    instructions?: string | null;
    dispensed: boolean;
    visit: {
      id: number;
      visitDate: string;
      diagnosis: string;
      patientName: string;
      patientUnifiedId?: string | null;
      doctorName: string;
      centerName: string;
      centerCode: string;
    };
  } | null;
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<PrescriptionVerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  async function loadLogs() {
    const payload = await apiRequest<AuditLogRecord[]>("/central/audit-logs?limit=120");
    setLogs(payload);
  }

  useEffect(() => {
    loadLogs()
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      setError("أدخل كود التحقق أو قيمة QR أولاً.");
      return;
    }

    try {
      setVerifying(true);
      setError("");
      const payload = await apiRequest<PrescriptionVerificationResult>(
        `/central/prescriptions/verify/${encodeURIComponent(normalizedCode)}`
      );
      setResult(payload);
      await loadLogs();
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "تعذر التحقق من الوصفة.");
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return <div className="screen-center">جارٍ تحميل سجل التدقيق...</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">الحوكمة والتتبع</p>
          <h1>سجل التدقيق المركزي</h1>
          <p className="muted">
            راقب العمليات الحساسة في الشبكة وتحقق من وصفة رقمية صادرة من أي مركز متصل.
          </p>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="split-grid">
        <SectionCard title="تحقق وصفة من الشبكة" subtitle="يبحث في كل المراكز المتصلة بقاعدة البيانات المركزية.">
          <form className="form-grid" onSubmit={handleVerify}>
            <label className="field field-span-2">
              <span>كود التحقق</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="RX-..."
              />
            </label>
            <div className="field-span-2 button-row">
              <button className="primary-button" disabled={verifying} type="submit">
                {verifying ? "جارٍ التحقق..." : "تحقق"}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="نتيجة التحقق" subtitle="تُعرض البيانات فقط إذا كان الكود مطابقاً.">
          {!result ? <div className="empty-state compact">لم يتم تنفيذ تحقق بعد.</div> : null}
          {result ? (
            <div className="profile-meta">
              <div className="info-row">
                <strong>{result.authentic ? "الوصفة أصلية" : "لم يتم تأكيد الوصفة"}</strong>
                <StatusBadge status={result.authentic ? "active" : "cancelled"} />
              </div>
              {result.prescription ? (
                <>
                  <span>{result.prescription.medicineName}</span>
                  <span>{result.prescription.dosage} - {result.prescription.duration}</span>
                  <span>المريض: {result.prescription.visit.patientName}</span>
                  <span>الطبيب: {result.prescription.visit.doctorName}</span>
                  <span>المركز: {result.prescription.visit.centerName}</span>
                  <span>تاريخ الإصدار: {formatDate(result.prescription.issuedAt)}</span>
                  <code>{result.qrValue}</code>
                </>
              ) : (
                <span>لا توجد وصفة مطابقة لهذا الكود.</span>
              )}
            </div>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard title="الأحداث الأخيرة" subtitle="آخر عمليات الدخول، إنشاء المرضى، الزيارات، الوصفات، المختبر، والإحالات.">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المركز</th>
                <th>الإجراء</th>
                <th>الكيان</th>
                <th>المستخدم</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.createdAt)}</td>
                  <td>{log.center ? `${log.center.centerName} (${log.center.centerCode})` : "النظام المركزي"}</td>
                  <td>{log.action}</td>
                  <td>{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</td>
                  <td>{log.actorUsername ?? "-"} / {log.actorRole ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length === 0 ? <div className="empty-state compact">لا توجد أحداث تدقيق بعد.</div> : null}
      </SectionCard>
    </div>
  );
}
