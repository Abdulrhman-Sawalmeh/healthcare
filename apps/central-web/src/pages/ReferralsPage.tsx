import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { cleanDemoText, formatCount, formatDateTime, safeDisplay, toArabicLabel } from "../lib/arabic";
import { ReferralRecord } from "../types";

const preferredStatusOrder = [
  "REQUESTED",
  "AUTO_SELECTED",
  "PENDING_RECEIVING_MANAGER",
  "RECEIVING_MANAGER_ACCEPTED",
  "RECEIVING_MANAGER_REJECTED",
  "ASSIGNED_TO_DOCTOR",
  "VISIT_CREATED",
  "COMPLETED",
  "NO_CANDIDATE_REJECTED"
];

function buildPathParams(current: URLSearchParams, next: Record<string, string | number | undefined>) {
  const params = new URLSearchParams(current);

  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === "") {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  return params;
}

function isNoCandidate(referral: ReferralRecord) {
  return referral.status === "NO_CANDIDATE_REJECTED" || !referral.toCenterId;
}

function receivingCenterLabel(referral: ReferralRecord) {
  if (referral.status === "NO_CANDIDATE_REJECTED") {
    return "لا يوجد مركز مناسب";
  }

  if (!referral.toCenterId) {
    return "لم يتم اختيار مركز مستقبل";
  }

  return safeDisplay(referral.toCenter);
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{cleanDemoText(value == null ? null : String(value))}</strong>
    </div>
  );
}

export function ReferralsPage() {
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [fromCenterFilter, setFromCenterFilter] = useState("");
  const [toCenterFilter, setToCenterFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [patientFilter, setPatientFilter] = useState("");

  const statusFilter = searchParams.get("status") ?? "";
  const selectedReferralId = Number(searchParams.get("referralId") ?? "");

  async function loadData() {
    const payload = await apiRequest<ReferralRecord[]>("/central/referrals");
    setReferrals(payload);
  }

  useEffect(() => {
    loadData().catch((cause: Error) => setError(cause.message));
  }, []);

  const statusCounts = useMemo(() => {
    return referrals.reduce<Record<string, number>>((accumulator, referral) => {
      accumulator[referral.status] = (accumulator[referral.status] ?? 0) + 1;
      return accumulator;
    }, {});
  }, [referrals]);

  const statusOptions = useMemo(() => {
    const available = Object.keys(statusCounts);
    return preferredStatusOrder.filter((status) => available.includes(status)).concat(
      available.filter((status) => !preferredStatusOrder.includes(status))
    );
  }, [statusCounts]);

  const fromCenters = useMemo(
    () => Array.from(new Set(referrals.map((referral) => referral.fromCenter))).sort((a, b) => a.localeCompare(b, "ar")),
    [referrals]
  );
  const toCenters = useMemo(
    () =>
      Array.from(
        new Set(
          referrals
            .filter((referral) => referral.toCenterId)
            .map((referral) => referral.toCenter)
        )
      ).sort((a, b) => a.localeCompare(b, "ar")),
    [referrals]
  );
  const specialties = useMemo(
    () => Array.from(new Set(referrals.map((referral) => referral.requiredSpecialty))).sort((a, b) => a.localeCompare(b, "ar")),
    [referrals]
  );

  const filteredReferrals = useMemo(() => {
    return referrals.filter((referral) => {
      if (statusFilter && referral.status !== statusFilter) {
        return false;
      }

      if (fromCenterFilter && referral.fromCenter !== fromCenterFilter) {
        return false;
      }

      if (toCenterFilter && referral.toCenter !== toCenterFilter) {
        return false;
      }

      if (specialtyFilter && referral.requiredSpecialty !== specialtyFilter) {
        return false;
      }

      if (dateFilter && referral.requestedAt.slice(0, 10) !== dateFilter) {
        return false;
      }

      if (patientFilter.trim()) {
        const term = patientFilter.trim().toLowerCase();
        const haystack = `${referral.patientName ?? ""} ${referral.patientUnifiedId ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }, [dateFilter, fromCenterFilter, patientFilter, referrals, specialtyFilter, statusFilter, toCenterFilter]);

  const selectedReferral = referrals.find((referral) => referral.id === selectedReferralId) ?? null;

  function openDetails(referralId: number) {
    setSearchParams(buildPathParams(searchParams, { referralId }));
  }

  function closeDetails() {
    setSearchParams(buildPathParams(searchParams, { referralId: undefined }));
  }

  return (
    <div className="page-stack">
      <SectionCard
        title="متابعة الإحالات على مستوى الشبكة"
        subtitle="عرض الإحالات المقبولة والمعلقة والمرفوضة والمكتملة دون إظهار التفاصيل الطويلة داخل الجدول."
      >
        {error ? <div className="error-banner">{error}</div> : null}

        <div className="chip-row">
          <button
            className={statusFilter === "" ? "primary-button" : "ghost-button"}
            onClick={() => setSearchParams(buildPathParams(searchParams, { status: undefined }))}
            type="button"
          >
            الكل ({formatCount(referrals.length)})
          </button>
          {statusOptions.map((status) => (
            <button
              className={statusFilter === status ? "primary-button" : "ghost-button"}
              key={status}
              onClick={() => setSearchParams(buildPathParams(searchParams, { status }))}
              type="button"
            >
              {toArabicLabel(status)} ({formatCount(statusCounts[status] ?? 0)})
            </button>
          ))}
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>المركز المرسل</span>
            <select value={fromCenterFilter} onChange={(event) => setFromCenterFilter(event.target.value)}>
              <option value="">كل المراكز</option>
              {fromCenters.map((center) => (
                <option key={center} value={center}>
                  {center}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>المركز المستقبل</span>
            <select value={toCenterFilter} onChange={(event) => setToCenterFilter(event.target.value)}>
              <option value="">كل المراكز</option>
              {toCenters.map((center) => (
                <option key={center} value={center}>
                  {center}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>التخصص</span>
            <select value={specialtyFilter} onChange={(event) => setSpecialtyFilter(event.target.value)}>
              <option value="">كل التخصصات</option>
              {specialties.map((specialty) => (
                <option key={specialty} value={specialty}>
                  {specialty}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>تاريخ الطلب</span>
            <input value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} type="date" />
          </label>
          <label className="field field-span-full">
            <span>اسم المريض أو الرقم الموحد</span>
            <input
              className="toolbar-input"
              value={patientFilter}
              onChange={(event) => setPatientFilter(event.target.value)}
              placeholder="ابحث باسم المريض أو الرقم الموحد"
            />
          </label>
        </div>

        {statusFilter ? (
          <div className="filter-summary">
            <div>
              <strong>تصفية حسب الحالة</strong>
              <p className="muted">يعرض الجدول الإحالات التي حالتها {toArabicLabel(statusFilter)} فقط.</p>
            </div>
            <button className="ghost-button" type="button" onClick={() => setSearchParams({})}>
              عرض كل الإحالات
            </button>
          </div>
        ) : null}

        {filteredReferrals.length === 0 ? (
          <div className="empty-state compact">لا توجد إحالات تطابق التصفية الحالية.</div>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>المريض</th>
                  <th>المسار</th>
                  <th>الاحتياج السريري</th>
                  <th>الحالة</th>
                  <th>التوقيت</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredReferrals.map((referral) => (
                  <tr key={referral.id}>
                    <td>
                      <strong>{safeDisplay(referral.patientName, "مريض")}</strong>
                      <span>{safeDisplay(referral.patientUnifiedId, "سجل إحالة محلي")}</span>
                    </td>
                    <td>
                      <strong>{safeDisplay(referral.fromCenter)}</strong>
                      <span>{receivingCenterLabel(referral)}</span>
                    </td>
                    <td>
                      <strong>{safeDisplay(referral.requiredSpecialty)}</strong>
                      <span>{cleanDemoText(referral.reason)}</span>
                    </td>
                    <td>
                      <StatusBadge status={referral.status} />
                    </td>
                    <td>
                      <strong>{formatDateTime(referral.requestedAt)}</strong>
                      {referral.decisionAt ? <span>قرار: {formatDateTime(referral.decisionAt)}</span> : null}
                      {referral.visitCreatedAt ? <span>زيارة: {formatDateTime(referral.visitCreatedAt)}</span> : null}
                    </td>
                    <td>
                      <button className="ghost-button table-action-button" type="button" onClick={() => openDetails(referral.id)}>
                        عرض التفاصيل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {selectedReferral ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="referral-details-title">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <p className="eyebrow">إحالة #{selectedReferral.id}</p>
                <h2 id="referral-details-title">تفاصيل الإحالة</h2>
              </div>
              <button className="ghost-button modal-close-button" type="button" onClick={closeDetails}>
                ×
              </button>
            </div>
            <div className="modal-body" onWheel={(event) => event.stopPropagation()}>
              <div className="details-list">
                <DetailField label="المريض" value={selectedReferral.patientName} />
                <DetailField label="الرقم الموحد" value={selectedReferral.patientUnifiedId} />
                <DetailField label="المركز المرسل" value={selectedReferral.fromCenter} />
                <DetailField label="المركز المستقبل" value={receivingCenterLabel(selectedReferral)} />
                <DetailField label="التخصص المطلوب" value={selectedReferral.requiredSpecialty} />
                <DetailField label="الأولوية" value={toArabicLabel(selectedReferral.priority)} />
                <DetailField label="الحالة" value={toArabicLabel(selectedReferral.status)} />
                <DetailField label="تاريخ الطلب" value={formatDateTime(selectedReferral.requestedAt)} />
              </div>

              <div className="details-list">
                <DetailField label="سبب الإحالة / الاحتياج السريري" value={selectedReferral.reason} />
                <DetailField
                  label={isNoCandidate(selectedReferral) ? "سبب عدم اختيار مركز" : "تفاصيل الاختيار التلقائي"}
                  value={selectedReferral.rejectionReason ?? selectedReferral.selectedCenterReason}
                />
                <DetailField label="قرار المدير" value={selectedReferral.managerDecisionReason} />
                <DetailField
                  label="مدير المركز الذي قبل"
                  value={selectedReferral.acceptedByManager?.fullName}
                />
                <DetailField
                  label="مدير المركز الذي رفض"
                  value={selectedReferral.rejectedByManager?.fullName}
                />
                <DetailField label="الطبيب المسند" value={selectedReferral.assignedDoctor?.fullName} />
                <DetailField label="الزيارة المرتبطة" value={selectedReferral.createdVisitId ? `زيارة #${selectedReferral.createdVisitId}` : null} />
                <DetailField label="درجة المطابقة" value={selectedReferral.matchingScore} />
                <DetailField
                  label="زمن الانتظار المتوقع"
                  value={
                    selectedReferral.estimatedWaitTimeMinutes != null
                      ? `${selectedReferral.estimatedWaitTimeMinutes} دقيقة`
                      : null
                  }
                />
                <DetailField label="ملاحظات المرسل" value={selectedReferral.notesFromSender} />
                <DetailField label="ملاحظات المستقبل" value={selectedReferral.notesFromReceiver} />
              </div>

              <div className="details-list">
                <DetailField label="وقت الرد" value={selectedReferral.respondedAt ? formatDateTime(selectedReferral.respondedAt) : null} />
                <DetailField label="وقت القرار" value={selectedReferral.decisionAt ? formatDateTime(selectedReferral.decisionAt) : null} />
                <DetailField label="وقت الإسناد" value={selectedReferral.assignedAt ? formatDateTime(selectedReferral.assignedAt) : null} />
                <DetailField label="وقت إنشاء الزيارة" value={selectedReferral.visitCreatedAt ? formatDateTime(selectedReferral.visitCreatedAt) : null} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
