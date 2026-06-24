import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { Breadcrumbs, EmptyState, ErrorState, LoadingState, PageHeader, ResultSummary, SearchBox } from "../components/UiStates";
import { formatCount, formatDateTime, joinMeta, safeDisplay, toArabicLabel } from "../lib/arabic";
import { UnifiedPatientRecord } from "../types";

function isPlaceholderText(value?: string | null) {
  const normalizedValue = value?.trim() ?? "";
  return normalizedValue.length > 0 && /^[?\s]+$/.test(normalizedValue);
}

function getPatientDisplayName(fullName: string, index = 0) {
  if (isPlaceholderText(fullName)) {
    return `مريض افتراضي ${index + 1}`;
  }

  return fullName;
}

function getChronicDiseasesLabel(chronicDiseases: string[]) {
  const validDiseases = chronicDiseases.filter((disease) => !isPlaceholderText(disease));
  return validDiseases.length > 0 ? validDiseases.join("، ") : "لا توجد أمراض مزمنة مسجلة.";
}

export function PatientsPage() {
  const [searchParams] = useSearchParams();
  const [centralPatients, setCentralPatients] = useState<UnifiedPatientRecord[]>([]);
  const [query, setQuery] = useState(() => searchParams.get("search") ?? "");
  const [centerFilter, setCenterFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [visitsFilter, setVisitsFilter] = useState("");
  const [referralsFilter, setReferralsFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const didRunInitialFilter = useRef(false);

  async function loadPatients(search?: string) {
    setLoading(true);
    const path = `/central/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`;

    try {
      const payload = await apiRequest<UnifiedPatientRecord[]>(path);
      setCentralPatients(payload);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPatients(query.trim()).catch((cause: Error) => setError(cause.message));
  }, []);

  useEffect(() => {
    if (!didRunInitialFilter.current) {
      didRunInitialFilter.current = true;
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      loadPatients(query.trim())
        .then(() => {
          if (active) {
            setError("");
          }
        })
        .catch((cause: Error) => {
          if (active) {
            setError(cause.message);
          }
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await loadPatients(query);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تصفية قائمة المرضى.");
    }
  }

  function retryLoadPatients(search = query) {
    void loadPatients(search)
      .then(() => setError(""))
      .catch((cause: Error) => setError(cause.message));
  }

  const centerOptions = useMemo(() => {
    const centers = centralPatients.flatMap((patient) => patient.centersSeenAt);
    const unique = new Map<number, string>();
    centers.forEach((center) => unique.set(center.centerId, center.centerName));
    return Array.from(unique, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [centralPatients]);

  const visiblePatients = useMemo(() => {
    return centralPatients.filter((patient) => {
      if (centerFilter && !patient.centersSeenAt.some((center) => String(center.centerId) === centerFilter)) {
        return false;
      }

      if (activityFilter === "active" && patient.visitCount + patient.referralCount === 0) {
        return false;
      }

      if (activityFilter === "quiet" && patient.visitCount + patient.referralCount > 0) {
        return false;
      }

      if (visitsFilter === "with" && patient.visitCount === 0) {
        return false;
      }

      if (visitsFilter === "without" && patient.visitCount > 0) {
        return false;
      }

      if (referralsFilter === "with" && patient.referralCount === 0) {
        return false;
      }

      if (referralsFilter === "without" && patient.referralCount > 0) {
        return false;
      }

      return true;
    });
  }, [activityFilter, centerFilter, centralPatients, referralsFilter, visitsFilter]);

  return (
    <div className="page-stack">
      <Breadcrumbs items={[{ label: "لوحة المتابعة", to: "/" }, { label: "المرضى" }]} />
      <PageHeader
        eyebrow="النظام المركزي"
        title="السجل الموحد للمرضى"
        subtitle="عرض مركزي للمرضى وسجل نشاطهم عبر المراكز. البيانات هنا للقراءة والمتابعة ولا تعدل من النظام المركزي."
        meta={`${formatCount(centralPatients.length)} ملف`}
      />
      <SectionCard
        title="ملفات المرضى"
        subtitle="ابحث وفلتر السجل المركزي حسب المركز والنشاط والزيارات والإحالات."
      >
        <SearchBox
          value={query}
          onChange={setQuery}
          onSubmit={handleFilterSubmit}
          placeholder="ابحث بالرقم الموحد أو الاسم أو رقم الهاتف"
        />

        <div className="filter-grid">
          <label className="field">
            <span>المركز</span>
            <select value={centerFilter} onChange={(event) => setCenterFilter(event.target.value)}>
              <option value="">كل المراكز</option>
              {centerOptions.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>حالة النشاط</span>
            <select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}>
              <option value="">كل الحالات</option>
              <option value="active">لديه نشاط</option>
              <option value="quiet">لا يوجد نشاط حديث</option>
            </select>
          </label>
          <label className="field">
            <span>الزيارات</span>
            <select value={visitsFilter} onChange={(event) => setVisitsFilter(event.target.value)}>
              <option value="">الكل</option>
              <option value="with">لديه زيارات</option>
              <option value="without">لا توجد زيارات</option>
            </select>
          </label>
          <label className="field">
            <span>الإحالات</span>
            <select value={referralsFilter} onChange={(event) => setReferralsFilter(event.target.value)}>
              <option value="">الكل</option>
              <option value="with">لديه إحالات</option>
              <option value="without">لا توجد إحالات</option>
            </select>
          </label>
        </div>

        {error ? <ErrorState message={error} onRetry={() => retryLoadPatients(query)} /> : null}

        {loading ? (
          <LoadingState text="جاري تحميل سجل المرضى..." />
        ) : visiblePatients.length === 0 ? (
          <EmptyState
            title="لا توجد ملفات مطابقة"
            description="غيّر كلمات البحث أو امسح الفلاتر لعرض كل المرضى المسجلين."
          />
        ) : (
          <>
            <ResultSummary count={visiblePatients.length} label="ملف مريض" query={query.trim() || undefined} />
            <div className="card-grid">
              {visiblePatients.map((patient, index) => (
                <Link key={patient.id} to={`/patients/${patient.id}`} className="profile-tile interactive-card wide">
                  <div className="tile-heading">
                    <div>
                      <p className="eyebrow">{safeDisplay(patient.unifiedId, "لا يوجد رقم موحد")}</p>
                      <h3>{getPatientDisplayName(patient.fullName, index)}</h3>
                    </div>
                    <span className="status-badge neutral">{patient.visitCount + patient.referralCount > 0 ? "نشط" : "لا يوجد نشاط"}</span>
                  </div>
                  <p>{joinMeta([patient.nationalId ?? "بدون هوية", patient.primaryPhone, toArabicLabel(patient.gender)])}</p>
                  <div className="tile-stats">
                    <span>{formatCount(patient.visitCount)} زيارات</span>
                    <span>{formatCount(patient.referralCount)} إحالات</span>
                    <span>{formatCount(patient.centersSeenAt.length)} مراكز مرتبطة</span>
                  </div>
                  <p className="muted">{getChronicDiseasesLabel(patient.chronicDiseases)}</p>
                  <div className="chip-row">
                    {patient.centersSeenAt.length > 0 ? (
                      patient.centersSeenAt.map((center) => (
                        <span key={center.centerId} className="tag">
                          {center.centerName}
                        </span>
                      ))
                    ) : (
                      <span className="tag">لا يوجد مركز مرتبط</span>
                    )}
                  </div>
                  {patient.recentVisits[0] ? (
                    <p className="muted">
                      آخر زيارة: {safeDisplay(patient.recentVisits[0].primaryDiagnosis)} • {formatDateTime(patient.recentVisits[0].visitDate)}
                    </p>
                  ) : null}
                  <span className="action-hint">عرض ملف المريض</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
