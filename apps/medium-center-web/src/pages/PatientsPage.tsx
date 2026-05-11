import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { joinMeta, toArabicLabel } from "../lib/arabic";
import { LocalPatientRecord, NetworkPatientSearchResult, UnifiedPatientRecord } from "../types";

type CreatePatientResponse = {
  success: boolean;
  unifiedId: string;
  patient: LocalPatientRecord;
  portalAccount: {
    loginIdentifier: string;
    deliveryMethod: "WEBHOOK" | "OUTBOX";
    accountStatus: "CREATED" | "RESET";
  };
};

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function PatientsPage() {
  const { user } = useAuth();
  const [centralPatients, setCentralPatients] = useState<UnifiedPatientRecord[]>([]);
  const [localPatients, setLocalPatients] = useState<LocalPatientRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResult, setSearchResult] = useState<NetworkPatientSearchResult | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
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
    const path =
      user?.workspace === "central"
        ? `/central/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`
        : `/center/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`;

    const payload = await apiRequest<UnifiedPatientRecord[] | LocalPatientRecord[]>(path);

    if (user?.workspace === "central") {
      setCentralPatients(payload as UnifiedPatientRecord[]);
    } else {
      setLocalPatients(payload as LocalPatientRecord[]);
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
        `/center/patients/search?term=${encodeURIComponent(searchTerm)}`
      );
      setSearchResult(payload);
      setSuccessMessage("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ البحث.");
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
        payload.portalAccount.deliveryMethod === "WEBHOOK"
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

  if (user?.workspace === "central") {
    return (
      <div className="page-stack">
        <SectionCard
          title="السجل الموحد للمرضى"
          subtitle="المرجع المركزي لهوية المريض ونشاطه الأخير عبر المراكز الصحية."
        >
          <form className="toolbar" onSubmit={handleFilterSubmit}>
            <input
              className="toolbar-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث برقم الهوية أو الرقم الموحد أو الاسم أو الهاتف"
            />
            <button className="ghost-button" type="submit">
              بحث
            </button>
          </form>

          {error ? <div className="error-banner">{error}</div> : null}

          <div className="card-grid">
            {centralPatients.map((patient) => (
              <Link key={patient.id} to={`/patients/${patient.id}`} className="profile-tile interactive-card">
                <p className="eyebrow">{patient.unifiedId}</p>
                <h3>{patient.fullName}</h3>
                <p>{joinMeta([patient.nationalId ?? "بدون هوية", patient.primaryPhone])}</p>
                <div className="tile-stats">
                  <span>{patient.visitCount} زيارات حديثة</span>
                  <span>{patient.referralCount} إحالات</span>
                  <span>{patient.centersSeenAt.length} مراكز مرتبطة</span>
                </div>
                <p className="muted">
                  {patient.chronicDiseases.length > 0
                    ? patient.chronicDiseases.join("، ")
                    : "لا توجد أمراض مزمنة مسجلة."}
                </p>
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
        </SectionCard>
      </div>
    );
  }

  const canCreateAccounts = user?.role === "RECEPTIONIST";

  return (
    <div className="page-stack">
      <div className="split-grid">
        <SectionCard
          title="بحث الاستقبال"
          subtitle="ابحث برقم الهوية أو الهاتف قبل إنشاء حساب جديد للمريض."
        >
          <form className="toolbar" onSubmit={handleSearchSubmit}>
            <input
              className="toolbar-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="أدخل رقم الهوية أو الهاتف"
            />
            <button className="ghost-button" type="submit">
              بحث
            </button>
          </form>

          {searchResult ? (
            <div className="stack-list">
              <div className="info-row">
                <span>نتيجة البحث</span>
                <StatusBadge status={searchResult.found ? "found" : "not_found"} />
              </div>

              {searchResult.patient ? (
                <article className="stack-item">
                  <strong>{searchResult.patient.fullName}</strong>
                  <p className="muted">
                    {joinMeta([
                      searchResult.patient.unifiedId,
                      searchResult.patient.nationalId ?? "بدون هوية",
                      searchResult.patient.primaryPhone
                    ])}
                  </p>
                </article>
              ) : (
                <div className="empty-state compact">لم يتم العثور على مريض موحد بهذا الرقم.</div>
              )}

              {searchResult.localPatient ? (
                <article className="stack-item">
                  <strong>{searchResult.localPatient.fullName}</strong>
                  <p className="muted">
                    {joinMeta([
                      searchResult.localPatient.nationalId ?? "بدون هوية",
                      searchResult.localPatient.phone
                    ])}
                  </p>
                </article>
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
            <div className="empty-state compact">
              يستطيع الطبيب أو مدير المركز مراجعة السجلات والبحث عن المرضى، بينما تبقى عملية إنشاء الحساب
              وربط الدخول برقم الهوية من مهام الاستقبال.
            </div>
          </SectionCard>
        )}
      </div>

      {successMessage ? <div className="empty-state compact">{successMessage}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <SectionCard title="سجل المرضى المحلي" subtitle="المرضى المخزنون حالياً في قاعدة بيانات هذا المركز.">
        <form className="toolbar" onSubmit={handleFilterSubmit}>
          <input
            className="toolbar-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="تصفية بالاسم أو الهاتف أو رقم الهوية أو الرقم الموحد"
          />
          <button className="ghost-button" type="submit">
            تصفية
          </button>
        </form>

        <div className="card-grid">
          {localPatients.map((patient) => (
            <Link key={patient.id} to={`/patients/${patient.id}`} className="profile-tile interactive-card">
              <p className="eyebrow">{patient.unifiedId ?? "سجل محلي فقط"}</p>
              <h3>{patient.fullName}</h3>
              <p>{joinMeta([patient.nationalId ?? "بدون هوية", patient.phone])}</p>
              <div className="tile-stats">
                <span>{patient.visitCount} زيارات</span>
                <span>{toArabicLabel(patient.billingStatus)}</span>
                <span>{patient.bloodType ?? "فصيلة الدم غير مسجلة"}</span>
              </div>
              <p className="muted">
                {patient.chronicDiseases.length > 0
                  ? patient.chronicDiseases.join("، ")
                  : "لا توجد أمراض مزمنة مسجلة."}
              </p>
              <span className="action-hint">عرض أو تعديل ملف المريض</span>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
