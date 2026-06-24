import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { cleanDemoText, formatDate, formatDateTime, safeDisplay, toArabicLabel } from "../lib/arabic";

interface AuditLogRecord {
  id: number;
  action: string;
  entityType: string;
  entityId?: string | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  createdAt: string;
  oldValue?: unknown;
  newValue?: unknown;
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

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function entityPath(log: AuditLogRecord) {
  if (!log.entityId) {
    return null;
  }

  if (log.entityType === "CentralReferral") {
    return `/referrals?referralId=${encodeURIComponent(log.entityId)}`;
  }

  if (log.entityType === "CentralCenter" && log.center?.centerCode) {
    return `/centers?centerCode=${encodeURIComponent(log.center.centerCode)}`;
  }

  if (log.entityType === "CentralNotification" || log.entityType === "OutgoingNotification" || log.entityType === "CenterNotification") {
    return "/notifications";
  }

  return null;
}

function JsonPreview({ value }: { value: unknown }) {
  if (!value) {
    return <span>غير متوفر</span>;
  }

  return <code>{JSON.stringify(value, null, 2)}</code>;
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<PrescriptionVerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [centerFilter, setCenterFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

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
      setError("أدخل كود التحقق أو قيمة QR أولا.");
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

  const actionOptions = useMemo(
    () => Array.from(new Set(logs.map((log) => log.action))).sort((a, b) => a.localeCompare(b, "ar")),
    [logs]
  );
  const entityOptions = useMemo(
    () => Array.from(new Set(logs.map((log) => log.entityType))).sort((a, b) => a.localeCompare(b, "ar")),
    [logs]
  );
  const centerOptions = useMemo(
    () =>
      Array.from(new Map(logs.filter((log) => log.center).map((log) => [log.center!.centerCode, log.center!.centerName]))).sort(
        (a, b) => a[1].localeCompare(b[1], "ar")
      ),
    [logs]
  );

  const visibleLogs = useMemo(() => {
    return logs.filter((log) => {
      if (actionFilter && log.action !== actionFilter) {
        return false;
      }

      if (entityFilter && log.entityType !== entityFilter) {
        return false;
      }

      if (centerFilter && log.center?.centerCode !== centerFilter) {
        return false;
      }

      if (dateFilter && log.createdAt.slice(0, 10) !== dateFilter) {
        return false;
      }

      if (userFilter.trim()) {
        const term = userFilter.trim().toLowerCase();
        const haystack = `${log.actorUsername ?? ""} ${log.actorRole ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }, [actionFilter, centerFilter, dateFilter, entityFilter, logs, userFilter]);

  function exportLogs() {
    downloadCsv("central-audit-log.csv", [
      ["الوقت", "المركز", "الإجراء", "الكيان", "المستخدم"],
      ...visibleLogs.map((log) => [
        formatDateTime(log.createdAt),
        log.center ? `${log.center.centerName} (${log.center.centerCode})` : "النظام المركزي",
        toArabicLabel(log.action),
        `${toArabicLabel(log.entityType)}${log.entityId ? ` #${log.entityId}` : ""}`,
        `${log.actorUsername ?? "غير متوفر"} / ${log.actorRole ?? "غير متوفر"}`
      ])
    ]);
  }

  if (loading) {
    return <div className="screen-center">جاري تحميل سجل التدقيق...</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">الحوكمة والتتبع</p>
          <h1>سجل التدقيق المركزي</h1>
          <p className="muted">راقب العمليات الحساسة وتحقق من وصفة رقمية أو رمز QR صادر من مركز متصل.</p>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="split-grid">
        <SectionCard
          title="تحقق وصفة من الشبكة"
          subtitle="يتحقق من كود وصفة أو رمز QR ويعرض بيانات آمنة فقط دون تفاصيل طبية غير ضرورية."
        >
          <form className="form-grid" onSubmit={handleVerify}>
            <label className="field field-span-2">
              <span>كود التحقق أو QR</span>
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="مثال: RX-2026-000123" />
            </label>
            <div className="field-span-2 button-row">
              <button className="primary-button" disabled={verifying} type="submit">
                {verifying ? "جاري التحقق..." : "تحقق"}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="نتيجة التحقق" subtitle="لا تعرض النتيجة تشخيص المريض أو ملاحظات طبية حساسة.">
          {!result ? <div className="empty-state compact">لم يتم تنفيذ تحقق بعد.</div> : null}
          {result ? (
            <div className="profile-meta">
              <div className="info-row">
                <strong>{result.authentic ? "الوصفة أصلية" : "لم يتم تأكيد الوصفة"}</strong>
                <StatusBadge status={result.authentic ? "active" : "cancelled"} />
              </div>
              {result.prescription ? (
                <>
                  <span>الدواء: {result.prescription.medicineName}</span>
                  <span>الجرعة والمدة: {result.prescription.dosage} - {result.prescription.duration}</span>
                  <span>الطبيب: {result.prescription.visit.doctorName}</span>
                  <span>المركز: {result.prescription.visit.centerName}</span>
                  <span>تاريخ الإصدار: {formatDate(result.prescription.issuedAt)}</span>
                  <span>حالة الصرف: {result.prescription.dispensed ? "تم الصرف" : "لم يصرف بعد"}</span>
                </>
              ) : (
                <span>لا توجد وصفة مطابقة لهذا الكود.</span>
              )}
            </div>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard
        title="الأحداث الأخيرة"
        subtitle="جدول أكثر اتساعا مع فلاتر وتفاصيل منفصلة لكل حدث."
        action={
          <div className="button-row">
            <button className="ghost-button" type="button" onClick={() => window.print()}>
              PDF
            </button>
            <button className="ghost-button" type="button" onClick={exportLogs}>
              Excel
            </button>
          </div>
        }
      >
        <div className="filter-grid">
          <label className="field">
            <span>نوع الحدث</span>
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <option value="">كل الأحداث</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {toArabicLabel(action)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>المستخدم</span>
            <input value={userFilter} onChange={(event) => setUserFilter(event.target.value)} placeholder="اسم المستخدم أو الدور" />
          </label>
          <label className="field">
            <span>المركز</span>
            <select value={centerFilter} onChange={(event) => setCenterFilter(event.target.value)}>
              <option value="">كل المراكز</option>
              {centerOptions.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>التاريخ</span>
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
          </label>
          <label className="field">
            <span>نوع الكيان</span>
            <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
              <option value="">كل الكيانات</option>
              {entityOptions.map((entity) => (
                <option key={entity} value={entity}>
                  {toArabicLabel(entity)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المركز</th>
                <th>الإجراء</th>
                <th>الكيان</th>
                <th>المستخدم</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.map((log) => {
                const path = entityPath(log);

                return (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{log.center ? `${log.center.centerName} (${log.center.centerCode})` : "النظام المركزي"}</td>
                    <td>{toArabicLabel(log.action)}</td>
                    <td>
                      {path ? (
                        <Link className="action-hint" to={path}>
                          {toArabicLabel(log.entityType)}{log.entityId ? ` #${log.entityId}` : ""}
                        </Link>
                      ) : (
                        <span>{toArabicLabel(log.entityType)}{log.entityId ? ` #${log.entityId}` : ""}</span>
                      )}
                    </td>
                    <td>{safeDisplay(log.actorUsername)} / {safeDisplay(log.actorRole)}</td>
                    <td>
                      <button className="ghost-button table-action-button" type="button" onClick={() => setSelectedLog(log)}>
                        عرض التفاصيل
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibleLogs.length === 0 ? <div className="empty-state compact">لا توجد أحداث تدقيق مطابقة للفلاتر.</div> : null}
      </SectionCard>

      {selectedLog ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="audit-details-title">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <p className="eyebrow">حدث تدقيق #{selectedLog.id}</p>
                <h2 id="audit-details-title">تفاصيل الحدث</h2>
              </div>
              <button className="ghost-button modal-close-button" type="button" onClick={() => setSelectedLog(null)}>
                ×
              </button>
            </div>
            <div className="modal-body" onWheel={(event) => event.stopPropagation()}>
              <div className="details-list">
                <div className="detail-field">
                  <span>المستخدم</span>
                  <strong>{safeDisplay(selectedLog.actorUsername)}</strong>
                </div>
                <div className="detail-field">
                  <span>الدور</span>
                  <strong>{toArabicLabel(selectedLog.actorRole)}</strong>
                </div>
                <div className="detail-field">
                  <span>المركز</span>
                  <strong>{selectedLog.center ? `${selectedLog.center.centerName} (${selectedLog.center.centerCode})` : "النظام المركزي"}</strong>
                </div>
                <div className="detail-field">
                  <span>نوع الإجراء</span>
                  <strong>{toArabicLabel(selectedLog.action)}</strong>
                </div>
                <div className="detail-field">
                  <span>الكيان المرتبط</span>
                  <strong>{toArabicLabel(selectedLog.entityType)}{selectedLog.entityId ? ` #${selectedLog.entityId}` : ""}</strong>
                </div>
                <div className="detail-field">
                  <span>الوقت</span>
                  <strong>{formatDateTime(selectedLog.createdAt)}</strong>
                </div>
              </div>
              <SectionCard title="قبل التغيير" className="inset-card">
                <JsonPreview value={selectedLog.oldValue} />
              </SectionCard>
              <SectionCard title="بعد التغيير" className="inset-card">
                <JsonPreview value={selectedLog.newValue} />
              </SectionCard>
              {entityPath(selectedLog) ? (
                <Link className="primary-button" to={entityPath(selectedLog)!}>
                  فتح السجل المرتبط
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
