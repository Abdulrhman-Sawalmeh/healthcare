import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { Breadcrumbs, EmptyState, ErrorState, LoadingState, PageHeader, ResultSummary, SearchBox } from "../components/UiStates";
import { useAuth } from "../context/AuthContext";
import { joinMeta, toArabicLabel } from "../lib/arabic";
import { LocalPatientRecord, NetworkPatientSearchResult, UnifiedPatientRecord } from "../types";

type CreatePatientResponse = {
  success: boolean;
  unifiedId: string;
  patient: LocalPatientRecord;
  portalAccount: {
    loginIdentifier: string;
    deliveryMethod: "TWILIO" | "WEBHOOK" | "OUTBOX";
    email: string | null;
    emailDeliveryMethod: "BREVO_API" | "SMTP" | "WEBHOOK" | "OUTBOX" | "SKIPPED";
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
  const didRunInitialFilter = useRef(false);
  const [form, setForm] = useState({
    fullName: "",
    nationalId: "",
    email: "",
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

    if (!form.email.trim()) {
      setError("أدخل البريد الإلكتروني للمريض حتى يتم إرسال رسالة الترحيب وكلمة السر.");
      return;
    }

    try {
      const payload = await apiRequest<CreatePatientResponse>("/center/patients", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName,
          nationalId: form.nationalId,
          email: form.email.trim(),
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
        email: "",
        dateOfBirth: "",
        gender: "MALE",
        primaryPhone: "",
        address: "",
        emergencyContact: "",
        bloodType: "",
        allergies: "",
        chronicDiseases: ""
      });

      const smsMessage =
        payload.portalAccount.deliveryMethod !== "OUTBOX"
          ? "أُرسلت كلمة المرور إلى هاتفه."
          : "تم حفظ رسالة كلمة المرور في سجل الرسائل النصية المحلي.";
      const emailMessage =
        payload.portalAccount.emailDeliveryMethod === "SKIPPED"
          ? "لم يتم إدخال بريد إلكتروني للمريض."
          : payload.portalAccount.emailDeliveryMethod === "OUTBOX"
            ? `تم حفظ رسالة البريد الإلكتروني في سجل البريد المحلي: ${payload.portalAccount.email}.`
            : `أُرسلت رسالة الانضمام إلى بريد المريض: ${payload.portalAccount.email}.`;

      setSuccessMessage(
        `تم تجهيز حساب المريض، ويمكنه الدخول برقم الهوية ${payload.portalAccount.loginIdentifier}. ${smsMessage} ${emailMessage}`
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

  const isDoctor = user?.role === "DOCTOR";
  const canCreateAccounts = user?.role === "RECEPTIONIST";
  const patientMatches = searchResult?.patientMatches ?? (searchResult?.patient ? [searchResult.patient] : []);
  const localMatches = searchResult?.localMatches ?? (searchResult?.localPatient ? [searchResult.localPatient] : []);

  return (
    <div className="page-stack">
      <Breadcrumbs items={[{ label: "لوحة المتابعة", to: "/" }, { label: "المرضى" }]} />
      <PageHeader
        eyebrow="إدارة المرضى"
        title="ملفات المرضى المحليين"
        subtitle={isDoctor ? "راجع ملفات المرضى المرتبطين بالمركز دون أدوات الاستقبال." : "ابحث في السجل المحلي والموحد وأنشئ ملف مريض عند الحاجة."}
        meta={`${localPatients.length} ملف`}
      />
      {!isDoctor ? (
      <div className="split-grid">
        <SectionCard
          title="بحث الاستقبال"
          subtitle="ابحث برقم الهوية أو الهاتف قبل إنشاء حساب جديد للمريض."
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
                <span>البريد الإلكتروني</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="patient@example.com"
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
                إنشاء الملف والحساب
              </button>
            </form>
          </SectionCard>
        ) : (
          <SectionCard
            title="إنشاء الحساب"
            subtitle="إنشاء حساب المريض متاح حالياً لموظف الاستقبال فقط."
          >
            <EmptyState
              title="الصلاحية غير متاحة"
              description="يستطيع الطبيب أو مدير المركز مراجعة السجلات والبحث عن المرضى، بينما تبقى عملية إنشاء الحساب وربط الدخول برقم الهوية من مهام الاستقبال."
            />
          </SectionCard>
        )}
      </div>
      ) : null}

      {successMessage ? <EmptyState title="تم تجهيز حساب المريض" description={successMessage} /> : null}
      {error ? <ErrorState message={error} onRetry={() => retryLoadPatients(query)} /> : null}

      <SectionCard title="سجل المرضى المحلي" subtitle="المرضى المخزنون حالياً في قاعدة بيانات هذا المركز.">
        <SearchBox
          value={query}
          onChange={setQuery}
          onSubmit={handleFilterSubmit}
          placeholder="تصفية بالاسم أو الهاتف أو رقم الهوية أو الرقم الموحد"
          buttonLabel="تصفية"
        />

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
                  <p>{joinMeta([patient.nationalId ?? "بدون هوية", patient.phone])}</p>
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
