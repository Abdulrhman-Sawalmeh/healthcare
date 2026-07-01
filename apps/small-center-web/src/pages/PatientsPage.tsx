import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { Breadcrumbs, EmptyState, ErrorState, LoadingState, PageHeader, ResultSummary, SearchBox } from "../components/UiStates";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, joinMeta, toArabicLabel } from "../lib/arabic";
import { LocalPatientRecord, NetworkPatientSearchResult, UnifiedPatientRecord } from "../types";

type PatientFilter = "all" | "openVisits" | "chronic" | "recent";

type CreatePatientResponse = {
  success: boolean;
  unifiedId: string;
  patient: LocalPatientRecord;
  portalAccount: {
    loginIdentifier: string;
    deliveryMethod: "TWILIO" | "WEBHOOK" | "OUTBOX";
    accountStatus: "CREATED" | "RESET";
  };
};

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

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

function formatBloodType(value?: string | null) {
  const normalized = value?.trim().toUpperCase();

  if (!normalized) {
    return "فصيلة الدم غير مسجلة";
  }

  const flipped = normalized.match(/^([+-])([ABO]{1,2})$/);
  return flipped ? `${flipped[2]}${flipped[1]}` : normalized;
}

function latestVisit(patient: LocalPatientRecord) {
  return [...patient.recentVisits].sort((first, second) => {
    return new Date(second.visitDate).getTime() - new Date(first.visitDate).getTime();
  })[0];
}

function hasOpenVisit(patient: LocalPatientRecord) {
  return patient.recentVisits.some((visit) => visit.syncState !== "SYNCED");
}

export function PatientsPage() {
  const { user } = useAuth();
  const [centralPatients, setCentralPatients] = useState<UnifiedPatientRecord[]>([]);
  const [localPatients, setLocalPatients] = useState<LocalPatientRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResult, setSearchResult] = useState<NetworkPatientSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [patientFilter, setPatientFilter] = useState<PatientFilter>("all");
  const didRunInitialFilter = useRef(false);
  const [form, setForm] = useState({
    fullName: "",
    nationalId: "",
    dateOfBirth: "",
    gender: "MALE",
    primaryPhone: "",
    address: "",
    emergencyContact: "",
    bloodType: "",
    allergies: "",
    chronicDiseases: ""
  });

  async function loadPatients(search?: string) {
    setLoading(true);
    const path =
      user?.workspace === "central"
        ? `/central/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`
        : `/center/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`;

    try {
      const payload = await apiRequest<UnifiedPatientRecord[] | LocalPatientRecord[]>(path);

      if (user?.workspace === "central") {
        setCentralPatients(payload as UnifiedPatientRecord[]);
      } else {
        setLocalPatients(payload as LocalPatientRecord[]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) {
      return;
    }

    loadPatients().catch((cause: Error) => setError(cause.message));
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

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
  }, [query, user?.workspace]);

  useEffect(() => {
    const term = searchTerm.trim();

    if (user?.workspace === "central") {
      return;
    }

    if (!term) {
      setSearchResult(null);
      setSearchLoading(false);
      return;
    }

    let active = true;
    setSearchLoading(true);

    const timeout = window.setTimeout(() => {
      apiRequest<NetworkPatientSearchResult>(`/center/patients/search?term=${encodeURIComponent(term)}&limit=8`)
        .then((payload) => {
          if (!active) {
            return;
          }

          setSearchResult(payload);
          setSuccessMessage("");
        })
        .catch((cause) => {
          if (active) {
            setError(cause instanceof Error ? cause.message : "تعذر تنفيذ البحث.");
          }
        })
        .finally(() => {
          if (active) {
            setSearchLoading(false);
          }
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [searchTerm, user?.workspace]);

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSearchLoading(true);
      const payload = await apiRequest<NetworkPatientSearchResult>(
        `/center/patients/search?term=${encodeURIComponent(searchTerm)}&limit=8`
      );
      setSearchResult(payload);
      setSuccessMessage("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ البحث.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleCreatePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = await apiRequest<CreatePatientResponse>("/center/patients", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName,
          nationalId: form.nationalId,
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          primaryPhone: form.primaryPhone,
          address: form.address,
          emergencyContact: form.emergencyContact || undefined,
          bloodType: form.bloodType || undefined,
          allergies: splitCsv(form.allergies),
          chronicDiseases: splitCsv(form.chronicDiseases)
        })
      });

      setForm({
        fullName: "",
        nationalId: "",
        dateOfBirth: "",
        gender: "MALE",
        primaryPhone: "",
        address: "",
        emergencyContact: "",
        bloodType: "",
        allergies: "",
        chronicDiseases: ""
      });

      setSuccessMessage(
        payload.portalAccount.deliveryMethod !== "OUTBOX"
          ? `تم تجهيز حساب المريض، ويمكنه الدخول برقم الهوية ${payload.portalAccount.loginIdentifier}. أُرسلت كلمة المرور إلى هاتفه.`
          : `تم تجهيز حساب المريض، ويمكنه الدخول برقم الهوية ${payload.portalAccount.loginIdentifier}. تم حفظ رسالة كلمة المرور في سجل الرسائل النصية المحلي.`
      );
      setSearchResult(null);
      await loadPatients();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف المريض.");
    }
  }

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

  if (user?.workspace === "central") {
    return (
      <div className="page-stack">
        <Breadcrumbs items={[{ label: "لوحة المتابعة", to: "/" }, { label: "المرضى" }]} />
        <PageHeader
          eyebrow="النظام المركزي"
          title="السجل الموحد للمرضى"
          subtitle="ابحث وتابع هوية المريض ونشاطه الأخير عبر جميع المراكز الصحية."
          meta={`${centralPatients.length} ملف`}
        />
        <SectionCard
          title="السجل الموحد للمرضى"
          subtitle="المرجع المركزي لهوية المريض ونشاطه الأخير عبر المراكز الصحية."
        >
          <SearchBox
            value={query}
            onChange={setQuery}
            onSubmit={handleFilterSubmit}
            placeholder="ابحث برقم الهوية أو الرقم الموحد أو الاسم أو الهاتف"
          />

          {error ? <ErrorState message={error} onRetry={() => retryLoadPatients(query)} /> : null}

          {loading ? (
            <LoadingState text="جار تحميل سجل المرضى..." />
          ) : centralPatients.length === 0 ? (
            <EmptyState
              title="لا توجد ملفات مطابقة"
              description="غيّر كلمات البحث أو امسح التصفية لعرض كل المرضى المسجلين."
            />
          ) : (
            <>
              <ResultSummary count={centralPatients.length} label="ملف مريض" query={query.trim() || undefined} />
              <div className="card-grid">
                {centralPatients.map((patient, index) => (
                  <Link key={patient.id} to={`/patients/${patient.id}`} className="profile-tile interactive-card">
                    <p className="eyebrow">{patient.unifiedId}</p>
                    <h3>{getPatientDisplayName(patient.fullName, index)}</h3>
                    <p>{joinMeta([patient.nationalId ?? "بدون هوية", patient.primaryPhone])}</p>
                    <div className="tile-stats">
                      <span>{patient.visitCount} زيارات حديثة</span>
                      <span>{patient.referralCount} إحالات</span>
                      <span>{patient.centersSeenAt.length} مراكز مرتبطة</span>
                    </div>
                    <p className="muted">{getChronicDiseasesLabel(patient.chronicDiseases)}</p>
                    <div className="chip-row">
                      {patient.centersSeenAt.map((center) => (
                        <span key={center.centerId} className="tag">
                          {center.centerName}
                        </span>
                      ))}
                    </div>
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

  const canCreateAccounts = user?.role === "RECEPTIONIST";
  const isDoctor = user?.role === "DOCTOR";
  const patientMatches = searchResult?.patientMatches ?? (searchResult?.patient ? [searchResult.patient] : []);
  const localMatches = searchResult?.localMatches ?? (searchResult?.localPatient ? [searchResult.localPatient] : []);
  const filteredLocalPatients = useMemo(() => {
    if (patientFilter === "openVisits") {
      return localPatients.filter(hasOpenVisit);
    }

    if (patientFilter === "chronic") {
      return localPatients.filter((patient) => patient.chronicDiseases.some((disease) => !isPlaceholderText(disease)));
    }

    if (patientFilter === "recent") {
      return localPatients.filter((patient) => patient.recentVisits.length > 0);
    }

    return localPatients;
  }, [localPatients, patientFilter]);

  return (
    <div className="page-stack">
      <Breadcrumbs items={[{ label: "لوحة المتابعة", to: "/" }, { label: "المرضى" }]} />
      <PageHeader
        eyebrow={isDoctor ? "ملفات الطبيب" : "إدارة المرضى"}
        title={isDoctor ? "مرضاي" : "ملفات المرضى المحليين"}
        subtitle={
          isDoctor
            ? "تعرض القائمة المرضى المرتبطين بزياراتك، ويمكن استخدام البحث للوصول إلى ملف مريض عند الحاجة السريرية."
            : "ابحث في السجل المحلي والموحد وأنشئ ملف مريض عند الحاجة."
        }
        meta={`${localPatients.length} ملف`}
      />
      <div className="split-grid">
        <SectionCard
          title={isDoctor ? "بحث في ملفات المرضى" : "بحث الاستقبال"}
          subtitle={
            isDoctor
              ? "بحث مساعد للوصول إلى ملف مريض برقم الهوية أو الهاتف دون تعديل بياناته الإدارية."
              : "ابحث برقم الهوية أو الهاتف قبل إنشاء حساب جديد للمريض."
          }
        >
          <SearchBox
            value={searchTerm}
            onChange={setSearchTerm}
            onSubmit={handleSearchSubmit}
            placeholder="أدخل الاسم أو رقم الهوية أو الهاتف"
          />

          {searchTerm.trim() ? (
            <div className="stack-list">
              <div className="info-row">
                <span>{searchLoading ? "جاري البحث..." : "نتيجة البحث"}</span>
                {searchResult ? <StatusBadge status={searchResult.found ? "found" : "not_found"} /> : null}
              </div>

              {patientMatches.map((patient) => (
                <article className="stack-item" key={`central-${patient.id}`}>
                  <strong>{getPatientDisplayName(patient.fullName)}</strong>
                  <p className="muted">{joinMeta([patient.unifiedId, patient.nationalId ?? "بدون هوية", patient.primaryPhone])}</p>
                </article>
              ))}

              {localMatches.map((patient) => (
                <Link className="stack-item interactive-card" key={`local-${patient.id}`} to={`/patients/${patient.id}`}>
                  <strong>{getPatientDisplayName(patient.fullName)}</strong>
                  <p className="muted">{joinMeta([patient.nationalId ?? "بدون هوية", patient.phone])}</p>
                  <span className="action-hint">فتح بيانات المريض</span>
                </Link>
              ))}

              {searchResult && !searchResult.found ? (
                <EmptyState
                  title="لم يتم العثور على مريض"
                  description="يمكن إنشاء ملف وحساب جديد من نموذج الاستقبال عند الحاجة."
                />
              ) : null}
            </div>
          ) : null}
        </SectionCard>

        {canCreateAccounts ? (
          <SectionCard
            title="إنشاء ملف وحساب مريض"
            subtitle="يُنشئ موظف الاستقبال الحساب، ثم تُرسل كلمة المرور إلى هاتف المريض برسالة نصية."
          >
            <form className="form-grid" onSubmit={handleCreatePatient}>
              <label className="field">
                <span>الاسم الكامل</span>
                <input
                  value={form.fullName}
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>رقم الهوية</span>
                <input
                  value={form.nationalId}
                  onChange={(event) => setForm((current) => ({ ...current, nationalId: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>تاريخ الميلاد</span>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, dateOfBirth: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>الجنس</span>
                <select
                  value={form.gender}
                  onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}
                >
                  <option value="MALE">{toArabicLabel("MALE")}</option>
                  <option value="FEMALE">{toArabicLabel("FEMALE")}</option>
                  <option value="OTHER">{toArabicLabel("OTHER")}</option>
                  <option value="PREFER_NOT_TO_SAY">{toArabicLabel("PREFER_NOT_TO_SAY")}</option>
                </select>
              </label>
              <label className="field">
                <span>رقم الهاتف</span>
                <input
                  value={form.primaryPhone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, primaryPhone: event.target.value }))
                  }
                />
              </label>
              <label className="field field-span-2">
                <span>العنوان</span>
                <input
                  value={form.address}
                  onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>جهة الاتصال للطوارئ</span>
                <input
                  value={form.emergencyContact}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, emergencyContact: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>فصيلة الدم</span>
                <input
                  dir="ltr"
                  value={form.bloodType}
                  onChange={(event) => setForm((current) => ({ ...current, bloodType: event.target.value }))}
                  placeholder="A+ / O-"
                />
              </label>
              <label className="field">
                <span>الحساسيات</span>
                <input
                  value={form.allergies}
                  onChange={(event) => setForm((current) => ({ ...current, allergies: event.target.value }))}
                  placeholder="افصل بين العناصر بفاصلة"
                />
              </label>
              <label className="field">
                <span>الأمراض المزمنة</span>
                <input
                  value={form.chronicDiseases}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, chronicDiseases: event.target.value }))
                  }
                  placeholder="افصل بين العناصر بفاصلة"
                />
              </label>
              <button className="primary-button field-span-2" type="submit">
                إنشاء الملف والحساب
              </button>
            </form>
          </SectionCard>
        ) : (
          <div className="inline-note manager-permission-note">
            {isDoctor
              ? "إنشاء أو تعديل بيانات حساب المريض متاح لموظف الاستقبال فقط. يستطيع الطبيب فتح السجل الطبي ومتابعة الزيارات المرتبطة به."
              : "إنشاء ملف أو حساب مريض جديد متاح لموظف الاستقبال فقط. يمكن للمدير مراجعة السجلات والبحث دون تعديل بيانات إنشاء الحساب."}
          </div>
        )}
      </div>

      {successMessage ? <EmptyState title="تم تجهيز حساب المريض" description={successMessage} /> : null}
      {error ? <ErrorState message={error} onRetry={() => retryLoadPatients(query)} /> : null}

      <SectionCard
        title={isDoctor ? "مرضاي داخل المركز" : "سجل المرضى المحلي"}
        subtitle={
          isDoctor
            ? "المرضى الذين لديهم زيارات مرتبطة بالطبيب الحالي داخل هذا المركز."
            : "المرضى المخزنون حالياً في قاعدة بيانات هذا المركز."
        }
      >
        <SearchBox
          value={query}
          onChange={setQuery}
          onSubmit={handleFilterSubmit}
          placeholder="تصفية بالاسم أو الهاتف أو رقم الهوية أو الرقم الموحد"
          buttonLabel="تصفية"
        />
        <div className="chip-row">
          <button className={patientFilter === "all" ? "primary-button" : "ghost-button"} onClick={() => setPatientFilter("all")} type="button">
            كل المرضى
          </button>
          <button
            className={patientFilter === "openVisits" ? "primary-button" : "ghost-button"}
            onClick={() => setPatientFilter("openVisits")}
            type="button"
          >
            زيارات مفتوحة
          </button>
          <button className={patientFilter === "chronic" ? "primary-button" : "ghost-button"} onClick={() => setPatientFilter("chronic")} type="button">
            أمراض مزمنة
          </button>
          <button className={patientFilter === "recent" ? "primary-button" : "ghost-button"} onClick={() => setPatientFilter("recent")} type="button">
            لديهم زيارات
          </button>
        </div>

        {loading ? (
          <LoadingState text="جار تحميل المرضى المحليين..." />
        ) : filteredLocalPatients.length === 0 ? (
          <EmptyState
            title={isDoctor ? "لا توجد ملفات مرضى مرتبطة بك" : "لا توجد ملفات محلية"}
            description={
              isDoctor
                ? "استخدم البحث إذا كنت تحتاج فتح ملف مريض محدد، أو انتظر إسناد زيارة جديدة."
                : "أنشئ ملفًا جديدًا أو امسح التصفية إذا كنت تبحث عن نتيجة محددة."
            }
          />
        ) : (
          <>
            <ResultSummary count={filteredLocalPatients.length} label="ملف محلي" query={query.trim() || undefined} />
            <div className="card-grid">
              {filteredLocalPatients.map((patient, index) => {
                const patientLatestVisit = latestVisit(patient);
                const openVisitCount = patient.recentVisits.filter((visit) => visit.syncState !== "SYNCED").length;

                return (
                  <Link key={patient.id} to={`/patients/${patient.id}`} className="profile-tile interactive-card">
                    <p className="eyebrow">{patient.unifiedId ?? "سجل محلي فقط"}</p>
                    <h3>{getPatientDisplayName(patient.fullName, index)}</h3>
                    <p>{joinMeta([patient.nationalId ?? "بدون هوية", patient.phone])}</p>
                    <div className="tile-stats">
                      <span>{patient.visitCount} زيارات</span>
                      <span>{openVisitCount > 0 ? `${openVisitCount} زيارات مفتوحة` : "لا توجد زيارات مفتوحة"}</span>
                      <span dir="ltr" className="ltr-value">{formatBloodType(patient.bloodType)}</span>
                    </div>
                    <p className="muted">{getChronicDiseasesLabel(patient.chronicDiseases)}</p>
                    {patientLatestVisit ? (
                      <p className="muted">
                        آخر زيارة: {formatDateTime(patientLatestVisit.visitDate)} - {toArabicLabel(patientLatestVisit.visitType)}
                      </p>
                    ) : null}
                    <span className="action-hint">
                      {isDoctor && openVisitCount > 0 ? "فتح السجل ومتابعة الزيارة" : "فتح السجل الطبي"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
