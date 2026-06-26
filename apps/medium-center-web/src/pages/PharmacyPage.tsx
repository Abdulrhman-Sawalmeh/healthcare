import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate, formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import {
  PharmacyAuditLogRecord,
  PharmacyItem,
  PharmacyPrescriptionRecord,
  PharmacyPrescriptionStatus
} from "../types";

type PharmacyAction =
  | "START_REVIEW"
  | "START_PREPARATION"
  | "MARK_READY"
  | "DISPENSE"
  | "MARK_UNAVAILABLE"
  | "REQUEST_DOCTOR_REVIEW";

const statusLabels: Record<PharmacyPrescriptionStatus, string> = {
  NEW: "وصفة جديدة",
  UNDER_REVIEW: "قيد المراجعة",
  PREPARING: "قيد التجهيز",
  READY_FOR_PICKUP: "جاهزة للاستلام",
  DISPENSED: "تم الصرف",
  UNAVAILABLE: "دواء غير متوفر",
  NEEDS_DOCTOR_REVIEW: "تحتاج مراجعة الطبيب",
  CANCELLED: "ملغاة"
};

const auditLabels: Record<string, string> = {
  PRESCRIPTION_RECEIVED: "استلام وصفة جديدة",
  PRESCRIPTION_VIEWED_BY_PHARMACIST: "مراجعة الوصفة",
  PRESCRIPTION_PREPARATION_STARTED: "بدء تجهيز الوصفة",
  PRESCRIPTION_READY_FOR_PICKUP: "الوصفة جاهزة للصرف",
  PRESCRIPTION_DISPENSED: "صرف الوصفة",
  PRESCRIPTION_MEDICATION_UNAVAILABLE: "تسجيل دواء غير متوفر",
  PRESCRIPTION_DOCTOR_REVIEW_REQUESTED: "طلب مراجعة الطبيب",
  PRESCRIPTION_DOCTOR_REVIEW_RESPONDED: "رد الطبيب على المراجعة",
  INVENTORY_LOW_STOCK: "تنبيه مخزون منخفض",
  INVENTORY_UPDATED: "تحديث المخزون",
  PRESCRIPTION_VERIFIED: "التحقق من وصفة"
};

function actionLabel(action: PharmacyAction) {
  return {
    START_REVIEW: "مراجعة الوصفة",
    START_PREPARATION: "بدء التجهيز",
    MARK_READY: "تحديد كجاهزة للصرف",
    DISPENSE: "تم الصرف",
    MARK_UNAVAILABLE: "دواء غير متوفر",
    REQUEST_DOCTOR_REVIEW: "طلب مراجعة الطبيب"
  }[action];
}

function mainAction(status: PharmacyPrescriptionStatus): PharmacyAction | null {
  if (status === "NEW") return "START_REVIEW";
  if (status === "UNDER_REVIEW") return "START_PREPARATION";
  if (status === "PREPARING") return "MARK_READY";
  if (status === "READY_FOR_PICKUP") return "DISPENSE";
  return null;
}

function canReportIssue(status: PharmacyPrescriptionStatus) {
  return ["NEW", "UNDER_REVIEW", "PREPARING", "READY_FOR_PICKUP", "UNAVAILABLE"].includes(status);
}

export function PharmacyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedStatus = searchParams.get("status") as PharmacyPrescriptionStatus | null;
  const [prescriptions, setPrescriptions] = useState<PharmacyPrescriptionRecord[]>([]);
  const [items, setItems] = useState<PharmacyItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<PharmacyAuditLogRecord[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [prescriptionFilter, setPrescriptionFilter] = useState<PharmacyPrescriptionStatus | "ALL">(
    requestedStatus ?? "ALL"
  );
  const [inventoryFilter, setInventoryFilter] = useState<"ALL" | "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK">("ALL");
  const [actionDialog, setActionDialog] = useState<{
    prescription: PharmacyPrescriptionRecord;
    action: "START_PREPARATION" | "MARK_UNAVAILABLE" | "REQUEST_DOCTOR_REVIEW" | "DISPENSE";
    reason: string;
  } | null>(null);
  const [inventoryDialog, setInventoryDialog] = useState<{
    item: PharmacyItem;
    quantity: number;
    reorderLevel: number;
    reason: string;
  } | null>(null);
  const [auditDialog, setAuditDialog] = useState<PharmacyAuditLogRecord | null>(null);

  const mode = location.pathname.endsWith("/inventory")
    ? "inventory"
    : location.pathname.endsWith("/audit")
      ? "audit"
      : location.pathname.endsWith("/dispensing")
        ? "dispensing"
        : "prescriptions";
  const highlightedTarget = searchParams.get("highlight");

  useEffect(() => {
    setPrescriptionFilter(requestedStatus ?? "ALL");
  }, [requestedStatus]);

  async function loadData() {
    setLoading(true);
    try {
      if (mode === "inventory") {
        setItems(await apiRequest<PharmacyItem[]>("/center/pharmacy"));
      } else if (mode === "audit") {
        setAuditLogs(await apiRequest<PharmacyAuditLogRecord[]>("/center/pharmacy/audit"));
      } else {
        setPrescriptions(
          await apiRequest<PharmacyPrescriptionRecord[]>("/center/pharmacy/prescriptions")
        );
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل بيانات الصيدلية.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [mode]);

  useEffect(() => {
    if (!highlightedTarget || loading) return;

    const prescriptionId = Number(highlightedTarget.replace("prescription-", ""));
    if (highlightedTarget.startsWith("prescription-") && prescriptionId) {
      setExpandedId(prescriptionId);
    }
    window.setTimeout(() => {
      document.getElementById(highlightedTarget)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 100);
  }, [highlightedTarget, loading]);

  const visiblePrescriptions = useMemo(() => {
    if (mode === "dispensing") {
      return prescriptions.filter((item) =>
        ["PREPARING", "READY_FOR_PICKUP"].includes(item.status)
      );
    }

    return prescriptionFilter === "ALL"
      ? prescriptions
      : prescriptions.filter((item) => item.status === prescriptionFilter);
  }, [mode, prescriptionFilter, prescriptions]);

  const visibleInventory = useMemo(() => {
    if (inventoryFilter === "ALL") return items;
    if (inventoryFilter === "OUT_OF_STOCK") return items.filter((item) => item.quantity === 0);
    if (inventoryFilter === "LOW_STOCK") return items.filter((item) => item.quantity > 0 && item.isLowStock);
    return items.filter((item) => !item.isLowStock);
  }, [inventoryFilter, items]);

  async function runAction(prescription: PharmacyPrescriptionRecord, action: PharmacyAction) {
    if (action === "MARK_UNAVAILABLE" || action === "REQUEST_DOCTOR_REVIEW") {
      setActionDialog({ prescription, action, reason: "" });
      return;
    }

    if (action === "START_PREPARATION") {
      setActionDialog({ prescription, action, reason: prescription.pharmacistNotes ?? "" });
      return;
    }

    if (action === "DISPENSE") {
      setActionDialog({ prescription, action, reason: "" });
      return;
    }

    try {
      setBusyId(prescription.id);
      await apiRequest(`/center/pharmacy/prescriptions/${prescription.id}/action`, {
        method: "PATCH",
        body: JSON.stringify({ action })
      });
      await loadData();
      setSuccess(`تم تنفيذ: ${actionLabel(action)}.`);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث حالة الوصفة.");
      setSuccess("");
    } finally {
      setBusyId(null);
    }
  }

  async function submitIssueAction() {
    if (!actionDialog) return;
    if (
      ["MARK_UNAVAILABLE", "REQUEST_DOCTOR_REVIEW"].includes(actionDialog.action) &&
      !actionDialog.reason.trim()
    ) {
      setError("يجب إدخال سبب واضح قبل حفظ الإجراء.");
      return;
    }

    try {
      setBusyId(actionDialog.prescription.id);
      await apiRequest(`/center/pharmacy/prescriptions/${actionDialog.prescription.id}/action`, {
        method: "PATCH",
        body: JSON.stringify({
          action: actionDialog.action,
          reason: ["MARK_UNAVAILABLE", "REQUEST_DOCTOR_REVIEW"].includes(actionDialog.action)
            ? actionDialog.reason.trim()
            : undefined,
          notes: actionDialog.action === "START_PREPARATION"
            ? actionDialog.reason.trim() || undefined
            : undefined
        })
      });
      setActionDialog(null);
      await loadData();
      setSuccess(
        actionDialog.action === "MARK_UNAVAILABLE"
          ? "تم تسجيل الدواء كغير متوفر وإبلاغ الطبيب."
          : actionDialog.action === "REQUEST_DOCTOR_REVIEW"
            ? "تم إرسال طلب مراجعة الطبيب."
            : actionDialog.action === "START_PREPARATION"
              ? "بدأ تجهيز الوصفة وتم حفظ ملاحظات الصيدلي."
            : "تم صرف الوصفة وإبلاغ المريض والطبيب."
      );
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث حالة الوصفة.");
      setSuccess("");
    } finally {
      setBusyId(null);
    }
  }

  async function updateInventory() {
    if (!inventoryDialog) return;
    const { item, quantity, reorderLevel, reason } = inventoryDialog;

    if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(reorderLevel) || reorderLevel < 0) {
      setError("أدخل كمية وحد إعادة طلب صحيحين.");
      return;
    }

    try {
      setBusyId(item.id);
      await apiRequest(`/center/pharmacy/inventory/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, reorderLevel, reason: reason.trim() || undefined })
      });
      setInventoryDialog(null);
      await loadData();
      setSuccess(
        reason.trim()
          ? "تم تحديث كمية الدواء وتسجيل السبب في سجل التدقيق."
          : "تم تحديث كمية الدواء."
      );
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث المخزون.");
      setSuccess("");
    } finally {
      setBusyId(null);
    }
  }

  function inventoryStatus(item: PharmacyItem) {
    if (item.quantity === 0) return "غير متوفر";
    if (item.isLowStock) return "مخزون منخفض";
    return "متاح";
  }

  function shortCode(code: string) {
    return code.length > 22 ? `${code.slice(0, 10)}…${code.slice(-7)}` : code;
  }

  function auditValue(log: PharmacyAuditLogRecord, key: string) {
    const value = log.newValue as Record<string, unknown> | null | undefined;
    return value?.[key] == null ? null : String(value[key]);
  }

  function auditOldValue(log: PharmacyAuditLogRecord, key: string) {
    return log.oldValue?.[key] == null ? null : String(log.oldValue[key]);
  }

  function auditTargetLabel(log: PharmacyAuditLogRecord) {
    if (log.related?.kind === "prescription") {
      return log.action === "PRESCRIPTION_VERIFIED" ? "فتح التحقق من الوصفة" : "فتح الوصفة";
    }

    if (log.related?.kind === "inventory") {
      return "فتح الدواء في المخزون";
    }

    return "فتح السجل";
  }

  function openAuditTarget(log: PharmacyAuditLogRecord) {
    if (!log.related?.targetUrl) {
      return;
    }

    const targetUrl = log.related.targetUrl;
    setAuditDialog(null);
    navigate(targetUrl);
  }

  if (loading) {
    return <div className="empty-state">جارٍ تحميل بيانات الصيدلية...</div>;
  }

  return (
    <div className="page-stack pharmacy-workspace">
      {error ? <div className="error-banner">{error}</div> : null}
      {success ? <div className="empty-state compact">{success}</div> : null}

      {mode === "inventory" ? (
        <SectionCard
          title="مخزون الأدوية"
          subtitle="متابعة الكميات وحدود إعادة الطلب دون تغيير بيانات الوصفات الطبية."
        >
          <div className="chip-row">
            {[
              ["ALL", "الكل"],
              ["AVAILABLE", "متاح"],
              ["LOW_STOCK", "مخزون منخفض"],
              ["OUT_OF_STOCK", "غير متوفر"]
            ].map(([value, label]) => (
              <button className={inventoryFilter === value ? "primary-button" : "ghost-button"} key={value} onClick={() => setInventoryFilter(value as typeof inventoryFilter)} type="button">{label}</button>
            ))}
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الدواء</th>
                  <th>التشغيلة</th>
                  <th>الكمية</th>
                  <th>حد الطلب</th>
                  <th>الانتهاء</th>
                  <th>الحالة</th>
                  <th>آخر تحديث</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {visibleInventory.map((item) => {
                  const outOfStock = item.quantity === 0;
                  return (
                    <tr
                      className={highlightedTarget === `inventory-${item.id}` ? "target-highlight" : undefined}
                      id={`inventory-${item.id}`}
                      key={item.id}
                    >
                      <td><strong>{item.medicineName}</strong><span>{item.unit}</span></td>
                      <td>{item.batchNumber}</td>
                      <td>{item.quantity}</td>
                      <td>{item.reorderLevel}</td>
                      <td>{formatDate(item.expiryDate)}</td>
                      <td><span className={`status-badge ${outOfStock ? "danger" : item.isLowStock ? "warning" : "success"}`}>{inventoryStatus(item)}</span></td>
                      <td>{formatDateTime(item.updatedAt)}</td>
                      <td>
                        <button
                          className="ghost-button"
                          disabled={busyId === item.id}
                          onClick={() => setInventoryDialog({ item, quantity: item.quantity, reorderLevel: item.reorderLevel, reason: "" })}
                          type="button"
                        >
                          تحديث الكمية
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visibleInventory.length === 0 ? <div className="empty-state compact">لا توجد أصناف مطابقة لهذا التصنيف.</div> : null}
        </SectionCard>
      ) : null}

      {mode === "audit" ? (
        <SectionCard
          title="سجل الصرف والتدقيق"
          subtitle="يعرض أحداث الوصفات والمخزون والتحقق الخاصة بالصيدلية فقط."
        >
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>الإجراء</th>
                  <th>السجل</th>
                  <th>المنفذ</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{auditLabels[log.action] ?? toArabicLabel(log.action)}</td>
                    <td>
                      <strong>{log.related?.label ?? toArabicLabel(log.entityType)}</strong>
                      {log.related?.patientName ? <span>{log.related.patientName} • {log.related.medicineName}</span> : null}
                    </td>
                    <td>{joinMeta([log.actorUsername, log.actorRole ? toArabicLabel(log.actorRole) : null])}</td>
                    <td><button className="ghost-button" onClick={() => setAuditDialog(log)} type="button">عرض التفاصيل</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {auditLogs.length === 0 ? <div className="empty-state compact">لا توجد أحداث صيدلية مسجلة بعد.</div> : null}
        </SectionCard>
      ) : null}

      {mode === "prescriptions" || mode === "dispensing" ? (
        <SectionCard
          title={mode === "dispensing" ? "صرف الأدوية" : "الوصفات الواردة"}
          subtitle={
            mode === "dispensing"
              ? "الوصفات الجاري تجهيزها أو الجاهزة للتسليم للمريض."
              : "مراجعة الوصفات الواردة ومتابعة توفر الدواء دون فتح ملف الزيارة الكامل."
          }
        >
          {mode === "prescriptions" ? (
            <div className="chip-row">
              {[
                ["ALL", "الكل"],
                ["NEW", "وصفات جديدة"],
                ["PREPARING", "قيد التجهيز"],
                ["READY_FOR_PICKUP", "جاهزة للاستلام"],
                ["DISPENSED", "تم الصرف"],
                ["UNAVAILABLE", "غير متوفر"],
                ["NEEDS_DOCTOR_REVIEW", "تحتاج مراجعة الطبيب"]
              ].map(([value, label]) => (
                <button className={prescriptionFilter === value ? "primary-button" : "ghost-button"} key={value} onClick={() => setPrescriptionFilter(value as typeof prescriptionFilter)} type="button">{label}</button>
              ))}
            </div>
          ) : null}
          <div className="table-shell">
            <table className="data-table pharmacy-prescriptions-table">
              <thead>
                <tr>
                  <th>كود الوصفة</th>
                  <th>المريض</th>
                  <th>الطبيب</th>
                  <th>الدواء</th>
                  <th>التاريخ</th>
                  <th>الأولوية</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {visiblePrescriptions.map((prescription) => {
                  const action = mainAction(prescription.status);
                  const isExpanded = expandedId === prescription.id;
                  return (
                    <Fragment key={prescription.id}>
                      <tr
                        className={`${highlightedTarget === `prescription-${prescription.id}` ? "target-highlight " : ""}${isExpanded ? "is-selected" : ""}`.trim() || undefined}
                        id={`prescription-${prescription.id}`}
                      >
                        <td>
                          <strong title={prescription.prescriptionCode}>{shortCode(prescription.prescriptionCode)}</strong>
                          <button className="icon-copy-button" onClick={() => void navigator.clipboard.writeText(prescription.prescriptionCode)} title="نسخ كود الوصفة" type="button">نسخ</button>
                          <span>ملف {prescription.patientFileNumber}</span>
                        </td>
                        <td><strong>{prescription.patientName}</strong><span>{toArabicLabel(prescription.patientGender)}</span></td>
                        <td>{prescription.doctorName}</td>
                        <td><strong>{prescription.medicineName}</strong><span>{prescription.quantity} وحدة</span></td>
                        <td>{formatDateTime(prescription.issuedAt)}</td>
                        <td><StatusBadge status={prescription.priority} /></td>
                        <td><StatusBadge status={prescription.status} /><span>{statusLabels[prescription.status]}</span></td>
                        <td>
                          <div className="table-actions pharmacy-actions">
                            <button
                              className="ghost-button"
                              onClick={() => setExpandedId(isExpanded ? null : prescription.id)}
                              type="button"
                            >
                              {isExpanded ? "إخفاء التفاصيل" : "عرض الوصفة"}
                            </button>
                            {action ? (
                              <button
                                className="primary-button"
                                disabled={busyId === prescription.id}
                                onClick={() => void runAction(prescription, action)}
                                type="button"
                              >
                                {actionLabel(action)}
                              </button>
                            ) : null}
                            {canReportIssue(prescription.status) && prescription.status !== "UNAVAILABLE" ? (
                              <button
                                className="danger-button"
                                disabled={busyId === prescription.id}
                                onClick={() => void runAction(prescription, "MARK_UNAVAILABLE")}
                                type="button"
                              >
                                غير متوفر
                              </button>
                            ) : null}
                            {canReportIssue(prescription.status) ? (
                              <button
                                className="ghost-button"
                                disabled={busyId === prescription.id}
                                onClick={() => void runAction(prescription, "REQUEST_DOCTOR_REVIEW")}
                                type="button"
                              >
                                طلب مراجعة الطبيب
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="details-row" key={`${prescription.id}-details`}>
                          <td colSpan={8}>
                            <div className="pharmacy-prescription-details">
                              <div><span>الجرعة</span><strong>{prescription.dosage}</strong></div>
                              <div><span>المدة</span><strong>{prescription.duration}</strong></div>
                              <div><span>تعليمات الطبيب</span><strong>{prescription.instructions || "لا توجد تعليمات إضافية"}</strong></div>
                              <div><span>الحساسية الدوائية</span><strong>{prescription.patientAllergies || "لا توجد حساسية دوائية مسجلة"}</strong></div>
                              <div><span>توفر المخزون</span><strong>{prescription.inventory ? `${prescription.inventory.quantity} ${prescription.inventory.unit}` : "هذا الدواء غير مرتبط بالمخزون، ولن يتم خصم الكمية تلقائيًا."}</strong></div>
                              <div><span>آخر تحديث</span><strong>{formatDateTime(prescription.updatedAt)}</strong></div>
                              <div><span>ملاحظات الصيدلي</span><strong>{prescription.pharmacistNotes || "لا توجد ملاحظات صرف"}</strong></div>
                            </div>
                            {prescription.warnings.length > 0 ? (
                              <div className="stack-list compact">
                                {prescription.warnings.map((warning) => (
                                  <div className="inline-note" key={warning.id}>{warning.message}</div>
                                ))}
                              </div>
                            ) : null}
                            {prescription.unavailableReason || prescription.doctorReviewReason || prescription.doctorReviewResponse ? (
                              <div className="inline-note">
                                {joinMeta([
                                  prescription.unavailableReason,
                                  prescription.doctorReviewReason,
                                  prescription.doctorReviewResponse
                                ])}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visiblePrescriptions.length === 0 ? (
            <div className="empty-state compact">
              <p>{mode === "dispensing" ? "لا توجد وصفات قيد التجهيز أو جاهزة للصرف حاليًا." : "لا توجد وصفات مطابقة لهذه القائمة."}</p>
              {mode === "dispensing" ? <Link className="ghost-button" to="/pharmacy/prescriptions">فتح الوصفات الواردة</Link> : null}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {actionDialog ? (
        <div className="demo-login-backdrop" role="presentation">
          <section className="demo-login-dialog" role="dialog" aria-modal="true">
            <div className="section-header">
              <div><h3>{actionDialog.action === "MARK_UNAVAILABLE" ? "تسجيل دواء غير متوفر" : actionDialog.action === "REQUEST_DOCTOR_REVIEW" ? "طلب مراجعة الطبيب" : actionDialog.action === "START_PREPARATION" ? "بدء تجهيز الوصفة" : "تأكيد صرف الوصفة"}</h3><p className="muted">{actionDialog.prescription.patientName} • {actionDialog.prescription.medicineName}</p></div>
            </div>
            {actionDialog.action !== "DISPENSE" ? <label className="field"><span>{actionDialog.action === "START_PREPARATION" ? "ملاحظات الصيدلي (اختياري)" : "السبب"}</span><textarea autoFocus value={actionDialog.reason} onChange={(event) => setActionDialog({ ...actionDialog, reason: event.target.value })} /></label> : <div className="inline-note">سيتم خصم الكمية المرتبطة بالمخزون وإبلاغ المريض والطبيب المسؤول.</div>}
            <div className="button-row"><button className="primary-button" disabled={busyId === actionDialog.prescription.id} onClick={() => void submitIssueAction()} type="button">{actionDialog.action === "DISPENSE" ? "تأكيد الصرف" : actionDialog.action === "START_PREPARATION" ? "بدء التجهيز" : "حفظ وإبلاغ الطبيب"}</button><button className="ghost-button" onClick={() => setActionDialog(null)} type="button">إلغاء</button></div>
          </section>
        </div>
      ) : null}

      {inventoryDialog ? (
        <div className="demo-login-backdrop" role="presentation">
          <section className="demo-login-dialog" role="dialog" aria-modal="true">
            <div><h3>تحديث كمية الدواء</h3><p className="muted">{inventoryDialog.item.medicineName} • الكمية الحالية {inventoryDialog.item.quantity}</p></div>
            <label className="field"><span>الكمية الجديدة</span><input min="0" type="number" value={inventoryDialog.quantity} onChange={(event) => setInventoryDialog({ ...inventoryDialog, quantity: Number(event.target.value) })} /></label>
            <label className="field"><span>حد إعادة الطلب</span><input min="0" type="number" value={inventoryDialog.reorderLevel} onChange={(event) => setInventoryDialog({ ...inventoryDialog, reorderLevel: Number(event.target.value) })} /></label>
            <label className="field"><span>سبب التحديث — اختياري</span><textarea value={inventoryDialog.reason} onChange={(event) => setInventoryDialog({ ...inventoryDialog, reason: event.target.value })} /></label>
            <div className="button-row"><button className="primary-button" disabled={busyId === inventoryDialog.item.id} onClick={() => void updateInventory()} type="button">حفظ</button><button className="ghost-button" onClick={() => setInventoryDialog(null)} type="button">إلغاء</button></div>
          </section>
        </div>
      ) : null}

      {auditDialog ? (
        <div className="demo-login-backdrop" role="presentation">
          <section className="demo-login-dialog" role="dialog" aria-modal="true">
            <div><h3>تفاصيل حدث الصيدلية</h3><p className="muted">{auditLabels[auditDialog.action] ?? toArabicLabel(auditDialog.action)}</p></div>
            <div className="pharmacy-prescription-details">
              <div><span>المنفذ</span><strong>{joinMeta([auditDialog.actorUsername, auditDialog.actorRole ? toArabicLabel(auditDialog.actorRole) : null])}</strong></div>
              <div><span>الوقت</span><strong>{formatDateTime(auditDialog.createdAt)}</strong></div>
              <div><span>السجل المرتبط</span><strong>{auditDialog.related?.label ?? toArabicLabel(auditDialog.entityType)}</strong></div>
              {auditDialog.related?.patientName ? <div><span>المريض</span><strong>{auditDialog.related.patientName}</strong></div> : null}
              {auditDialog.related?.medicineName ? <div><span>الدواء</span><strong>{auditDialog.related.medicineName}</strong></div> : null}
              {auditValue(auditDialog, "status") ? <div><span>الحالة الجديدة</span><strong>{toArabicLabel(auditValue(auditDialog, "status"))}</strong></div> : null}
              {auditOldValue(auditDialog, "status") ? <div><span>الحالة السابقة</span><strong>{toArabicLabel(auditOldValue(auditDialog, "status"))}</strong></div> : null}
              {auditOldValue(auditDialog, "quantity") ? <div><span>الكمية السابقة</span><strong>{auditOldValue(auditDialog, "quantity")}</strong></div> : null}
              {auditValue(auditDialog, "quantity") ? <div><span>الكمية الجديدة</span><strong>{auditValue(auditDialog, "quantity")}</strong></div> : null}
              {auditValue(auditDialog, "reason") ? (
                <div><span>السبب</span><strong>{auditValue(auditDialog, "reason")}</strong></div>
              ) : auditDialog.related?.kind === "inventory" ? (
                <div><span>السبب</span><strong>لم يتم إدخال سبب</strong></div>
              ) : null}
            </div>
            <div className="button-row">{auditDialog.related ? <button className="primary-button" onClick={() => openAuditTarget(auditDialog)} type="button">{auditTargetLabel(auditDialog)}</button> : null}<button className="ghost-button" onClick={() => setAuditDialog(null)} type="button">إغلاق</button></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
