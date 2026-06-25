import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

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
  READY_FOR_PICKUP: "جاهزة للصرف",
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
  const [searchParams] = useSearchParams();
  const [prescriptions, setPrescriptions] = useState<PharmacyPrescriptionRecord[]>([]);
  const [items, setItems] = useState<PharmacyItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<PharmacyAuditLogRecord[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  const mode = location.pathname.endsWith("/inventory")
    ? "inventory"
    : location.pathname.endsWith("/audit")
      ? "audit"
      : location.pathname.endsWith("/dispensing")
        ? "dispensing"
        : "prescriptions";
  const highlightedTarget = searchParams.get("highlight");
  const requestedStatus = searchParams.get("status") as PharmacyPrescriptionStatus | null;

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
    if (requestedStatus) {
      return prescriptions.filter((item) => item.status === requestedStatus);
    }

    if (mode === "dispensing") {
      return prescriptions.filter((item) =>
        ["PREPARING", "READY_FOR_PICKUP"].includes(item.status)
      );
    }

    return prescriptions;
  }, [mode, prescriptions, requestedStatus]);

  async function runAction(prescription: PharmacyPrescriptionRecord, action: PharmacyAction) {
    let reason: string | undefined;
    let notes: string | undefined;

    if (action === "MARK_UNAVAILABLE" || action === "REQUEST_DOCTOR_REVIEW") {
      reason =
        window.prompt(
          action === "MARK_UNAVAILABLE"
            ? "اكتب سبب عدم توفر الدواء:"
            : "اكتب سبب طلب مراجعة الطبيب:"
        )?.trim() || undefined;
      if (!reason) return;
    }

    if (action === "START_PREPARATION") {
      notes = window.prompt("ملاحظة صرف اختيارية:", prescription.pharmacistNotes ?? "")?.trim() || undefined;
    }

    if (
      action === "DISPENSE" &&
      !window.confirm(`تأكيد صرف ${prescription.medicineName} للمريض ${prescription.patientName}؟`)
    ) {
      return;
    }

    try {
      setBusyId(prescription.id);
      await apiRequest(`/center/pharmacy/prescriptions/${prescription.id}/action`, {
        method: "PATCH",
        body: JSON.stringify({ action, reason, notes })
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

  async function updateInventory(item: PharmacyItem) {
    const quantityInput = window.prompt("الكمية المتوفرة:", String(item.quantity));
    if (quantityInput === null) return;
    const reorderInput = window.prompt("حد إعادة الطلب:", String(item.reorderLevel));
    if (reorderInput === null) return;
    const quantity = Number(quantityInput);
    const reorderLevel = Number(reorderInput);

    if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(reorderLevel) || reorderLevel < 0) {
      setError("أدخل كمية وحد إعادة طلب بأرقام صحيحة موجبة أو صفر.");
      return;
    }

    try {
      setBusyId(item.id);
      await apiRequest(`/center/pharmacy/inventory/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, reorderLevel })
      });
      await loadData();
      setSuccess("تم تحديث كمية الدواء وحد إعادة الطلب.");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث المخزون.");
      setSuccess("");
    } finally {
      setBusyId(null);
    }
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
                {items.map((item) => {
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
                      <td><StatusBadge status={outOfStock ? "error" : item.isLowStock ? "warning" : "available"} /></td>
                      <td>{formatDateTime(item.updatedAt)}</td>
                      <td>
                        <button
                          className="ghost-button"
                          disabled={busyId === item.id}
                          onClick={() => void updateInventory(item)}
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
          {items.length === 0 ? <div className="empty-state compact">لا توجد أصناف دوائية في المخزون.</div> : null}
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
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.createdAt)}</td>
                    <td>{auditLabels[log.action] ?? toArabicLabel(log.action)}</td>
                    <td>{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</td>
                    <td>{joinMeta([log.actorUsername, log.actorRole ? toArabicLabel(log.actorRole) : null])}</td>
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
                        <td><strong>{prescription.prescriptionCode}</strong><span>ملف {prescription.patientFileNumber}</span></td>
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
                                مراجعة الطبيب
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
                              <div><span>تعليمات الاستخدام</span><strong>{prescription.instructions || "لا توجد تعليمات إضافية"}</strong></div>
                              <div><span>الحساسية الدوائية</span><strong>{prescription.patientAllergies || "لا توجد حساسية مسجلة"}</strong></div>
                              <div><span>توفر المخزون</span><strong>{prescription.inventory ? `${prescription.inventory.quantity} ${prescription.inventory.unit}` : "غير مرتبط بصنف مخزون"}</strong></div>
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
          {visiblePrescriptions.length === 0 ? <div className="empty-state compact">لا توجد وصفات مطابقة لهذه القائمة.</div> : null}
        </SectionCard>
      ) : null}
    </div>
  );
}
