import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { DemoPatientLoginButton } from "../components/DemoPatientLoginButton";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { Breadcrumbs, EmptyState, ErrorState, LoadingState, PageHeader, ResultSummary, SearchBox } from "../components/UiStates";
import { useAuth } from "../context/AuthContext";
import { formatDate, joinMeta, toArabicLabel } from "../lib/arabic";
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

const bloodTypeOptions = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasFutureDate(value: string) {
  if (!value) return false;

  const date = new Date(value);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return !Number.isNaN(date.getTime()) && date > today;
}

function patientName(patient: { fullName: string }, index = 0) {
  return patient.fullName.trim() || `مريض رقم ${index + 1}`;
}

function chronicLabel(chronicDiseases: string[]) {
  return chronicDiseases.length > 0 ? chronicDiseases.join("، ") : "لا توجد أمراض مزمنة مسجلة";
}

function latestVisitLabel(patient: LocalPatientRecord) {
  if (patient.lastVisitAt) {
    return formatDate(patient.lastVisitAt);
  }

  const latestVisit = patient.recentVisits[0];
  return latestVisit ? formatDate(latestVisit.visitDate) : "لا توجد زيارات";
}

export function PatientsPage() {
  const { user } = useAuth();
  const [centralPatients, setCentralPatients] = useState<UnifiedPatientRecord[]>([]);
  const [localPatients, setLocalPatients] = useState<LocalPatientRecord[]>([]);
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResult, setSearchResult] = useState<NetworkPatientSearchResult | null>(null);
  const [bloodTypeFilter, setBloodTypeFilter] = useState("");
  const [chronicFilter, setChronicFilter] = useState("all");
  const [visitFilter, setVisitFilter] = useState("all");
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
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

  const isCenterUser = user?.workspace === "center";
  const canCreateAccounts = isCenterUser && user?.role === "RECEPTIONIST";
  const isManager = isCenterUser && user?.role === "CENTER_MANAGER";
  const patientMatches = searchResult?.patientMatches ?? (searchResult?.patient ? [searchResult.patient] : []);
  const localMatches = searchResult?.localMatches ?? (searchResult?.localPatient ? [searchResult.localPatient] : []);

  const filteredLocalPatients = useMemo(() => {
    return localPatients.filter((patient) => {
      const matchesBloodType = !bloodTypeFilter || patient.bloodType === bloodTypeFilter;
      const matchesChronic =
        chronicFilter === "all" ||
        (chronicFilter === "with" ? patient.chronicDiseases.length > 0 : patient.chronicDiseases.length === 0);
      const matchesVisits =
        visitFilter === "all" ||
        (visitFilter === "visited" ? patient.visitCount > 0 : patient.visitCount === 0);

      return matchesBloodType && matchesChronic && matchesVisits;
    });
  }, [bloodTypeFilter, chronicFilter, localPatients, visitFilter]);

  async function loadPatients(search?: string) {
    if (!user) return;

    setLoading(true);
    const path =
      user.workspace === "central"
        ? `/central/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`
        : `/center/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`;

    try {
      const payload = await apiRequest<UnifiedPatientRecord[] | LocalPatientRecord[]>(path);

      if (user.workspace === "central") {
        setCentralPatients(payload as UnifiedPatientRecord[]);
      } else {
        setLocalPatients(payload as LocalPatientRecord[]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;

    loadPatients().catch((cause: Error) => setError(cause.message));
  }, [user]);

  useEffect(() => {
    if (!user) return;

    if (!didRunInitialFilter.current) {
      didRunInitialFilter.current = true;
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      loadPatients(query.trim())
        .then(() => {
          if (active) setError("");
        })
        .catch((cause: Error) => {
          if (active) setError(cause.message);
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query, user?.workspace]);

  useEffect(() => {
    const term = searchTerm.trim();

    if (!isCenterUser || !term) {
      setSearchResult(null);
      setSearchLoading(false);
      return;
    }

    let active = true;
    setSearchLoading(true);

    const timeout = window.setTimeout(() => {
      apiRequest<NetworkPatientSearchResult>(`/center/patients/search?term=${encodeURIComponent(term)}&limit=8`)
        .then((payload) => {
          if (!active) return;
          setSearchResult(payload);
          setSuccessMessage("");
        })
        .catch((cause) => {
          if (active) setError(cause instanceof Error ? cause.message : "تعذر تنفيذ البحث.");
        })
        .finally(() => {
          if (active) setSearchLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [isCenterUser, searchTerm]);

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

    if (!canCreateAccounts) {
      setError("إنشاء حسابات المرضى متاح لموظف الاستقبال فقط.");
      return;
    }

    if (!form.email.trim()) {
      setError("أدخل بريد المريض الإلكتروني حتى يمكن استخدام استعادة كلمة المرور.");
      return;
    }

    if (hasFutureDate(form.dateOfBirth)) {
      setError("تاريخ الميلاد لا يمكن أن يكون في المستقبل.");
      return;
    }

    try {
      const payload = await apiRequest<CreatePatientResponse>("/center/patients", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          nationalId: form.nationalId.trim(),
          email: form.email.trim(),
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          primaryPhone: form.primaryPhone.trim(),
          address: form.address.trim(),
          emergencyContact: form.emergencyContact.trim() || undefined,
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

      const emailMessage =
        payload.portalAccount.emailDeliveryMethod === "OUTBOX"
          ? `تم حفظ رسالة البريد في صندوق الصادر المحلي: ${payload.portalAccount.email}.`
          : `تم إرسال رسالة الانضمام إلى بريد المريض: ${payload.portalAccount.email}.`;

      setSuccessMessage(
        `تم تجهيز حساب المريض ويمكنه الدخول برقم الهوية ${payload.portalAccount.loginIdentifier}. ${emailMessage}`
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
          subtitle="بحث ومتابعة هوية المريض ونشاطه الأخير عبر المراكز الصحية."
          meta={`${centralPatients.length} ملف`}
        />

        <SectionCard title="السجل الموحد" subtitle="قائمة قراءة ومتابعة للسجلات المركزية.">
          <SearchBox
            value={query}
            onChange={setQuery}
            onSubmit={handleFilterSubmit}
            placeholder="ابحث برقم الهوية أو الرقم الموحد أو الاسم أو الهاتف"
          />

          {error ? <ErrorState message={error} onRetry={() => retryLoadPatients(query)} /> : null}

          {loading ? (
            <LoadingState text="جاري تحميل سجل المرضى..." />
          ) : centralPatients.length === 0 ? (
            <EmptyState title="لا توجد ملفات مطابقة" description="غيّر كلمات البحث أو امسح التصفية." />
          ) : (
            <>
              <ResultSummary count={centralPatients.length} label="ملف مريض" query={query.trim() || undefined} />
              <div className="card-grid">
                {centralPatients.map((patient, index) => (
                  <Link key={patient.id} to={`/patients/${patient.id}`} className="profile-tile interactive-card">
                    <p className="eyebrow">{patient.unifiedId}</p>
                    <h3>{patientName(patient, index)}</h3>
                    <p>{joinMeta([patient.nationalId ?? "بدون هوية", patient.primaryPhone])}</p>
                    <div className="tile-stats">
                      <span>{patient.visitCount} زيارة</span>
                      <span>{patient.referralCount} إحالة</span>
                      <span>{patient.centersSeenAt.length} مركز مرتبط</span>
                    </div>
                    <p className="muted">{chronicLabel(patient.chronicDiseases)}</p>
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

  return (
    <div className="page-stack">
      <Breadcrumbs items={[{ label: "لوحة المتابعة", to: "/" }, { label: "المرضى" }]} />
      <PageHeader
        eyebrow="إدارة ملفات المرضى"
        title="ملفات المرضى المحليين"
        subtitle={
          isManager
            ? "مساحة متابعة للمدير: عرض الملفات، مراقبة الزيارات، ومعرفة الحالات التي تحتاج تنسيقا دون إنشاء حسابات."
            : canCreateAccounts
              ? "ابحث قبل إنشاء الحساب، ثم افتح ملف المريض من الاستقبال عند الحاجة."
              : "استعراض ملفات المرضى حسب صلاحيات الدور الحالي."
        }
        meta={`${localPatients.length} ملف`}
      />

      <SectionCard
        title={canCreateAccounts ? "بحث الاستقبال" : "البحث عن مريض"}
        subtitle={
          canCreateAccounts
            ? "ابحث برقم الهوية أو الهاتف قبل إنشاء حساب جديد."
            : "البحث متاح للمراجعة والمتابعة فقط. إنشاء الحساب من صلاحية الاستقبال."
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
              {searchResult ? <StatusBadge status={searchResult.found ? "FOUND" : "NOT_FOUND"} /> : null}
            </div>

            {patientMatches.map((patient) => (
              <article className="stack-item" key={`central-${patient.id}`}>
                <strong>{patientName(patient)}</strong>
                <p className="muted">{joinMeta([patient.unifiedId, patient.nationalId ?? "بدون هوية", patient.primaryPhone])}</p>
              </article>
            ))}

            {localMatches.map((patient) => (
              <article className="stack-item" key={`local-${patient.id}`}>
                <strong>{patientName(patient)}</strong>
                <p className="muted">{joinMeta([patient.nationalId ?? "بدون هوية", patient.phone])}</p>
                <div className="button-row">
                  <Link className="ghost-button" to={`/patients/${patient.id}`}>
                    عرض الملف
                  </Link>
                  {canCreateAccounts ? (
                    <Link className="action-hint" to={`/patients/${patient.id}`}>
                      تعديل البيانات
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}

            {searchResult && !searchResult.found ? (
              <EmptyState
                title="لم يتم العثور على مريض"
                description={
                  canCreateAccounts
                    ? "يمكن لموظف الاستقبال إنشاء ملف وحساب جديد من النموذج أدناه."
                    : "راجع الاستقبال إذا كان المريض يحتاج إلى حساب جديد أو ربط ملف."
                }
              />
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      {canCreateAccounts ? (
        <SectionCard title="إنشاء ملف وحساب مريض" subtitle="البريد الإلكتروني مطلوب لدعم استعادة كلمة المرور.">
          <form className="form-grid" onSubmit={handleCreatePatient}>
            <label className="field">
              <span>الاسم الكامل</span>
              <input required value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} />
            </label>
            <label className="field">
              <span>رقم الهوية</span>
              <input required value={form.nationalId} onChange={(event) => setForm((current) => ({ ...current, nationalId: event.target.value }))} />
            </label>
            <label className="field">
              <span>البريد الإلكتروني</span>
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="patient@example.com"
              />
            </label>
            <label className="field">
              <span>تاريخ الميلاد</span>
              <input
                required
                type="date"
                value={form.dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setForm((current) => ({ ...current, dateOfBirth: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>الجنس</span>
              <select value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}>
                <option value="MALE">{toArabicLabel("MALE")}</option>
                <option value="FEMALE">{toArabicLabel("FEMALE")}</option>
                <option value="OTHER">{toArabicLabel("OTHER")}</option>
                <option value="PREFER_NOT_TO_SAY">{toArabicLabel("PREFER_NOT_TO_SAY")}</option>
              </select>
            </label>
            <label className="field">
              <span>رقم الهاتف</span>
              <input required value={form.primaryPhone} onChange={(event) => setForm((current) => ({ ...current, primaryPhone: event.target.value }))} />
            </label>
            <label className="field field-span-2">
              <span>العنوان</span>
              <input required value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
            </label>
            <label className="field">
              <span>جهة اتصال للطوارئ</span>
              <input value={form.emergencyContact} onChange={(event) => setForm((current) => ({ ...current, emergencyContact: event.target.value }))} />
            </label>
            <label className="field">
              <span>فصيلة الدم</span>
              <select value={form.bloodType} onChange={(event) => setForm((current) => ({ ...current, bloodType: event.target.value }))}>
                <option value="">غير مسجلة</option>
                {bloodTypeOptions.filter(Boolean).map((bloodType) => (
                  <option key={bloodType} value={bloodType}>
                    {bloodType}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>الحساسيات</span>
              <input value={form.allergies} onChange={(event) => setForm((current) => ({ ...current, allergies: event.target.value }))} placeholder="افصل بين العناصر بفاصلة" />
            </label>
            <label className="field">
              <span>الأمراض المزمنة</span>
              <input
                value={form.chronicDiseases}
                onChange={(event) => setForm((current) => ({ ...current, chronicDiseases: event.target.value }))}
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
          title="صلاحيات إنشاء الحساب"
          subtitle="مدير المركز يراجع الملفات ويتابع الحالات، بينما ينشئ موظف الاستقبال الحسابات والزيارات الأولية."
        >
          <EmptyState
            title="إنشاء الحساب غير متاح لهذا الدور"
            description="استخدم العرض والبحث والفلاتر للمتابعة، ووجه المريض إلى الاستقبال عند الحاجة لإنشاء أو تعديل حساب."
          />
        </SectionCard>
      )}

      {successMessage ? <div className="success-banner">{successMessage}</div> : null}
      {error ? <ErrorState message={error} onRetry={() => retryLoadPatients(query)} /> : null}

      <SectionCard title="سجل المرضى المحلي" subtitle="بطاقات قابلة للمسح السريع حسب فصيلة الدم، الأمراض المزمنة، وعدد الزيارات.">
        <SearchBox
          value={query}
          onChange={setQuery}
          onSubmit={handleFilterSubmit}
          placeholder="تصفية بالاسم أو الهاتف أو رقم الهوية أو الرقم الموحد"
          buttonLabel="تصفية"
        />

        <div className="filter-strip">
          <label className="field">
            <span>فصيلة الدم</span>
            <select value={bloodTypeFilter} onChange={(event) => setBloodTypeFilter(event.target.value)}>
              <option value="">كل الفصائل</option>
              {bloodTypeOptions.filter(Boolean).map((bloodType) => (
                <option key={bloodType} value={bloodType}>
                  {bloodType}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>الأمراض المزمنة</span>
            <select value={chronicFilter} onChange={(event) => setChronicFilter(event.target.value)}>
              <option value="all">كل الحالات</option>
              <option value="with">لديهم أمراض مزمنة</option>
              <option value="without">بدون أمراض مزمنة</option>
            </select>
          </label>
          <label className="field">
            <span>الزيارات</span>
            <select value={visitFilter} onChange={(event) => setVisitFilter(event.target.value)}>
              <option value="all">كل الملفات</option>
              <option value="visited">لديهم زيارات</option>
              <option value="new">لا توجد زيارات</option>
            </select>
          </label>
        </div>

        {loading ? (
          <LoadingState text="جاري تحميل المرضى المحليين..." />
        ) : filteredLocalPatients.length === 0 ? (
          <EmptyState title="لا توجد ملفات مطابقة" description="غيّر البحث أو الفلاتر لعرض نتائج أخرى." />
        ) : (
          <>
            <ResultSummary count={filteredLocalPatients.length} label="ملف محلي" query={query.trim() || undefined} />
            <div className="patient-card-grid">
              {filteredLocalPatients.map((patient, index) => (
                <article key={patient.id} className="patient-card" id={`patient-${patient.id}`}>
                  <div className="patient-card-header">
                    <div>
                      <p className="eyebrow">{patient.unifiedId ?? `ملف داخلي ${patient.id}`}</p>
                      <h3>{patientName(patient, index)}</h3>
                      <p className="muted">{joinMeta([patient.nationalId ?? "بدون هوية", patient.phone])}</p>
                    </div>
                    <StatusBadge status={patient.createdLocally ? "LOCAL" : "LINKED"} />
                  </div>

                  <div className="patient-card-facts">
                    <span>
                      <strong>{patient.visitCount}</strong>
                      زيارة
                    </span>
                    <span>
                      <strong>{latestVisitLabel(patient)}</strong>
                      آخر زيارة
                    </span>
                    <span>
                      <strong>{patient.bloodType ?? "غير مسجلة"}</strong>
                      فصيلة الدم
                    </span>
                    <span>
                      <strong>{patient.chronicDiseases.length}</strong>
                      أمراض مزمنة
                    </span>
                  </div>

                  <p className="muted">{chronicLabel(patient.chronicDiseases)}</p>
                  <div className="chip-row">
                    {patient.allergies.length > 0 ? (
                      patient.allergies.slice(0, 3).map((allergy) => (
                        <span className="tag" key={allergy}>
                          حساسية: {allergy}
                        </span>
                      ))
                    ) : (
                      <span className="tag">لا توجد حساسيات مسجلة</span>
                    )}
                  </div>

                  <div className="button-row patient-actions">
                    <Link className="primary-button" to={`/patients/${patient.id}`}>
                      عرض الملف
                    </Link>
                    <DemoPatientLoginButton patientId={patient.id} />
                    {canCreateAccounts ? (
                      <Link className="ghost-button" to={`/patients/${patient.id}?mode=edit`}>
                        تعديل البيانات
                      </Link>
                    ) : (
                      <span className="permission-note">التعديل وإنشاء الحساب من الاستقبال</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
