import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDate, toArabicLabel } from "../lib/arabic";

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
    quantity: number;
    instructions?: string | null;
    dispensed: boolean;
    pharmacyStatus?: string;
    visit: {
      id: number;
      visitDate: string;
      patientName: string;
      patientUnifiedId?: string | null;
      doctorName: string;
      centerName: string;
      centerCode: string;
    };
  } | null;
}

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

export function PrescriptionVerificationPage() {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<PrescriptionVerificationResult | null>(null);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadAuditLogs() {
    if (!["CENTER_MANAGER", "PHARMACIST"].includes(user?.role ?? "")) {
      setLogs([]);
      return;
    }

    const payload = await apiRequest<AuditLogRecord[]>(
      user?.role === "PHARMACIST" ? "/center/pharmacy/audit?limit=12" : "/center/audit-logs?limit=12"
    );
    setLogs(payload);
  }

  useEffect(() => {
    loadAuditLogs().catch(() => setLogs([]));
  }, [user?.role]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      setError("أدخل كود التحقق أو قيمة QR أولاً.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const payload = await apiRequest<PrescriptionVerificationResult>(
        `/center/prescriptions/verify/${encodeURIComponent(normalizedCode)}`
      );
      setResult(payload);
      await loadAuditLogs();
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "تعذر التحقق من الوصفة.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">التحقق الرقمي</p>
          <h1>تحقق الوصفات وسجل التدقيق</h1>
          <p className="muted">
            أدخل كود الوصفة أو قيمة QR للتأكد من أن الوصفة صدرت من هذا المركز، ثم راجع آخر العمليات الحساسة.
          </p>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="split-grid">
        <SectionCard title="التحقق من وصفة" subtitle="يدعم الكود المباشر أو القيمة المضمّنة في QR.">
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field field-span-2">
              <span>كود التحقق</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="RX-2026-000123"
              />
            </label>
            <div className="field-span-2 button-row">
              <button className="primary-button" disabled={loading} type="submit">
                {loading ? "جارٍ التحقق..." : "تحقق"}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="نتيجة التحقق" subtitle="تعرض بيانات الوصفة المطابقة فقط داخل نطاق المركز الحالي.">
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
                  <span>حالة الصرف: {toArabicLabel(result.prescription.pharmacyStatus ?? (result.prescription.dispensed ? "DISPENSED" : "NEW"))}</span>
                  <code>{result.qrValue}</code>
                </>
              ) : (
                <span>لا توجد وصفة مطابقة لهذا الكود داخل المركز.</span>
              )}
            </div>
          ) : null}
        </SectionCard>
      </div>

      {["CENTER_MANAGER", "PHARMACIST"].includes(user?.role ?? "") ? (
      <SectionCard title="آخر أحداث التدقيق" subtitle={user?.role === "PHARMACIST" ? "أحدث أحداث الصيدلية فقط." : "أحدث العمليات الحساسة المسجلة في هذا المركز."}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>الإجراء</th>
                <th>الكيان</th>
                <th>المستخدم</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.createdAt)}</td>
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
      ) : null}
    </div>
  );
}
