import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { Breadcrumbs, EmptyState, ErrorState, LoadingState, PageHeader, ResultSummary, SearchBox } from "../components/UiStates";
import { useAuth } from "../context/AuthContext";
import { joinMeta, toArabicLabel } from "../lib/arabic";
import { LocalPatientRecord, NetworkPatientSearchResult, UnifiedPatientRecord } from "../types";

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

export function PatientsPage() {
  const { user } = useAuth();
  const [centralPatients, setCentralPatients] = useState<UnifiedPatientRecord[]>([]);
  const [localPatients, setLocalPatients] = useState<LocalPatientRecord[]>([]);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState<NetworkPatientSearchResult | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    fullName: "",
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

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = await apiRequest<NetworkPatientSearchResult>(
        `/center/patients/search?phone=${encodeURIComponent(searchPhone)}`
      );
      setSearchResult(payload);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ البحث.");
    }
  }

  async function handleCreatePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await apiRequest("/center/patients", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName,
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
        dateOfBirth: "",
        gender: "MALE",
        primaryPhone: "",
        address: "",
        emergencyContact: "",
        bloodType: "",
        allergies: "",
        chronicDiseases: ""
      });
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
            placeholder="ابحث بالرقم الموحد أو الاسم أو رقم الهاتف"
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
                    <p>{patient.primaryPhone}</p>
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
                    <span className="action-hint">عرض أو تعديل ملف المريض</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <Breadcrumbs items={[{ label: "لوحة المتابعة", to: "/" }, { label: "المرضى" }]} />
      <PageHeader
        eyebrow="إدارة المرضى"
        title="ملفات المرضى المحليين"
        subtitle="ابحث في السجل المحلي والموحد وأنشئ ملف مريض عند الحاجة."
        meta={`${localPatients.length} ملف`}
      />
      <div className="split-grid">
        <SectionCard
          title="بحث الاستقبال"
          subtitle="ابحث برقم الهاتف في السجل المحلي والموحد قبل إنشاء ملف مريض جديد."
        >
          <SearchBox
            value={searchPhone}
            onChange={setSearchPhone}
            onSubmit={handleSearchSubmit}
            placeholder="أدخل رقم الهاتف"
          />

          {searchResult ? (
            <div className="stack-list">
              <div className="info-row">
                <span>نتيجة البحث</span>
                <StatusBadge status={searchResult.found ? "found" : "not_found"} />
              </div>
              {searchResult.patient ? (
                <article className="stack-item">
                  <strong>{getPatientDisplayName(searchResult.patient.fullName)}</strong>
                  <p className="muted">{joinMeta([searchResult.patient.unifiedId, searchResult.patient.primaryPhone])}</p>
                </article>
              ) : (
                <EmptyState
                  title="لم يتم العثور على مريض"
                  description="يمكن إنشاء ملف محلي جديد ثم ربطه لاحقًا عند المزامنة."
                />
              )}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="إنشاء ملف مريض محلي"
          subtitle="إذا لم يكن للمريض سجل موحد، يمكنك إنشاء ملف محلي وربطه لاحقًا عند المزامنة."
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
                value={form.bloodType}
                onChange={(event) => setForm((current) => ({ ...current, bloodType: event.target.value }))}
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
              حفظ ملف المريض
            </button>
          </form>
        </SectionCard>
      </div>

      <SectionCard title="سجل المرضى المحلي" subtitle="المرضى المخزنون حاليًا في قاعدة بيانات هذا المركز.">
        <SearchBox
          value={query}
          onChange={setQuery}
          onSubmit={handleFilterSubmit}
          placeholder="تصفية بالاسم أو الهاتف أو الرقم الموحد"
          buttonLabel="تصفية"
        />

        {error ? <ErrorState message={error} onRetry={() => retryLoadPatients(query)} /> : null}

        {loading ? (
          <LoadingState text="جار تحميل المرضى المحليين..." />
        ) : localPatients.length === 0 ? (
          <EmptyState
            title="لا توجد ملفات محلية"
            description="أنشئ ملفًا جديدًا أو امسح التصفية إذا كنت تبحث عن نتيجة محددة."
          />
        ) : (
          <>
            <ResultSummary count={localPatients.length} label="ملف محلي" query={query.trim() || undefined} />
            <div className="card-grid">
              {localPatients.map((patient, index) => (
                <Link key={patient.id} to={`/patients/${patient.id}`} className="profile-tile interactive-card">
                  <p className="eyebrow">{patient.unifiedId ?? "سجل محلي فقط"}</p>
                  <h3>{getPatientDisplayName(patient.fullName, index)}</h3>
                  <p>{patient.phone}</p>
                  <div className="tile-stats">
                    <span>{patient.visitCount} زيارات</span>
                    <span>{toArabicLabel(patient.billingStatus)}</span>
                    <span>{patient.bloodType ?? "فصيلة الدم غير مسجلة"}</span>
                  </div>
                  <p className="muted">{getChronicDiseasesLabel(patient.chronicDiseases)}</p>
                  <span className="action-hint">عرض أو تعديل ملف المريض</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
