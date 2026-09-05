import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatCount, joinMeta, normalizeArabicName, safeDisplay, toArabicLabel } from "../lib/arabic";
import { CenterRecord, MasterDataBundle } from "../types";

const defaultCenterForm = {
  centerCode: "",
  centerName: "",
  centerType: "MEDICAL_CENTER",
  region: "",
  city: "",
  address: "",
  phone: "",
  email: "",
  specialties: [] as string[],
  isConnected: false,
  apiEndpoint: "",
  apiKey: ""
};

interface SpecialtyOption {
  id: number | null;
  name: string;
  normalizedName: string;
}

function centerToForm(center: CenterRecord) {
  return {
    centerCode: center.code,
    centerName: center.name,
    centerType: center.type,
    region: center.region,
    city: center.city,
    address: center.address,
    phone: center.phone,
    email: center.email,
    specialties: center.specialties,
    isConnected: center.isConnected,
    apiEndpoint: center.apiEndpoint ?? "",
    apiKey: ""
  };
}

function normalizeCenterPayload(form: typeof defaultCenterForm, isEditing: boolean) {
  const payload: Record<string, unknown> = {
    centerName: form.centerName,
    region: form.region,
    city: form.city,
    address: form.address,
    phone: form.phone,
    email: form.email,
    specialties: form.specialties,
    isConnected: form.isConnected,
    apiEndpoint: form.apiEndpoint
  };

  if (!isEditing) {
    payload.centerCode = form.centerCode;
    payload.centerType = form.centerType;
  }

  if (form.apiKey.trim()) {
    payload.apiKey = form.apiKey;
  }

  return payload;
}

function isSpecialtySelected(specialties: string[], option: SpecialtyOption) {
  return specialties.some((specialty) => normalizeArabicName(specialty) === option.normalizedName);
}

function deduplicateSpecialtyNames(specialties: string[]) {
  const unique = new Map<string, string>();

  for (const specialty of specialties) {
    const normalizedName = normalizeArabicName(specialty);

    if (normalizedName && !unique.has(normalizedName)) {
      unique.set(normalizedName, specialty.trim());
    }
  }

  return [...unique.values()];
}

function matchesCenter(center: CenterRecord, query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return [
    center.code,
    center.name,
    center.type,
    center.region,
    center.city,
    center.address,
    center.phone,
    center.email,
    center.specialties.join(" ")
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

export function CentersPage() {
  const [centers, setCenters] = useState<CenterRecord[]>([]);
  const [masterData, setMasterData] = useState<MasterDataBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [query, setQuery] = useState("");
  const [editingCenterId, setEditingCenterId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultCenterForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedCenterId = Number(searchParams.get("centerId") ?? "");
  const selectedCenterCode = searchParams.get("centerCode") ?? "";
  const focus = searchParams.get("focus") ?? "";

  async function loadCenters() {
    const [centersPayload, masterPayload] = await Promise.all([
      apiRequest<CenterRecord[]>("/central/centers"),
      apiRequest<MasterDataBundle>("/central/master-data")
    ]);
    setCenters(centersPayload);
    setMasterData(masterPayload);
  }

  useEffect(() => {
    loadCenters()
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = editingCenterId ? `/central/centers/${editingCenterId}` : "/central/centers";
    const method = editingCenterId ? "PUT" : "POST";

    try {
      await apiRequest<CenterRecord>(path, {
        method,
        body: JSON.stringify(normalizeCenterPayload(form, Boolean(editingCenterId)))
      });
      await loadCenters();
      setForm(defaultCenterForm);
      setEditingCenterId(null);
      setIsFormOpen(false);
      setError("");
      setSuccessMessage(editingCenterId ? "تم تحديث بيانات المركز." : "تمت إضافة المركز.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ بيانات المركز.");
    }
  }

  async function toggleConnection(center: CenterRecord) {
    const nextState = !center.isConnected;

    try {
      const updated = await apiRequest<CenterRecord>(`/central/centers/${center.id}/connection`, {
        method: "PATCH",
        body: JSON.stringify({
          isConnected: nextState,
          reason: nextState ? undefined : "تم تعطيل الاتصال من لوحة التحكم المركزية."
        })
      });

      setCenters((current) => current.map((item) => (item.id === center.id ? updated : item)));
      setError("");
      setSuccessMessage(nextState ? "تمت إعادة تفعيل اتصال المركز." : "تم تعطيل اتصال المركز مؤقتا.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث حالة الاتصال.");
    }
  }

  function editCenter(center: CenterRecord) {
    setEditingCenterId(center.id);
    setForm(centerToForm(center));
    setIsFormOpen(true);
    setError("");
    setSuccessMessage("");
  }

  function toggleSpecialty(option: SpecialtyOption) {
    setForm((current) => ({
      ...current,
      specialties: isSpecialtySelected(current.specialties, option)
        ? current.specialties.filter((item) => normalizeArabicName(item) !== option.normalizedName)
        : [...current.specialties, option.name]
    }));
  }

  const specialtyOptions = useMemo(() => {
    const options = new Map<string, SpecialtyOption>();
    const masterSpecialties = [...(masterData?.specialties ?? [])].sort((a, b) => a.id - b.id);

    for (const specialty of masterSpecialties) {
      const normalizedName = normalizeArabicName(specialty.specialtyName);

      if (normalizedName && !options.has(normalizedName)) {
        options.set(normalizedName, {
          id: specialty.id,
          name: specialty.specialtyName.trim(),
          normalizedName
        });
      }
    }

    for (const specialtyName of centers.flatMap((center) => center.specialties)) {
      const normalizedName = normalizeArabicName(specialtyName);

      if (normalizedName && !options.has(normalizedName)) {
        options.set(normalizedName, {
          id: null,
          name: specialtyName.trim(),
          normalizedName
        });
      }
    }

    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [centers, masterData]);

  const visibleCenters = useMemo(() => {
    return centers.filter((center) => {
      if (selectedCenterId && center.id !== selectedCenterId) {
        return false;
      }

      if (selectedCenterCode && center.code !== selectedCenterCode) {
        return false;
      }

      return matchesCenter(center, query);
    });
  }, [centers, query, selectedCenterCode, selectedCenterId]);

  const selectedCenter = useMemo(() => {
    return centers.find((center) => center.id === selectedCenterId || center.code === selectedCenterCode) ?? null;
  }, [centers, selectedCenterCode, selectedCenterId]);

  if (loading) {
    return <div className="empty-state">جاري تحميل المراكز...</div>;
  }

  return (
    <div className="page-stack">
      <SectionCard
        title="إدارة المراكز"
        subtitle="إدارة المستشفيات والمراكز والعيادات المتصلة والمستخدمة في الإحالات وتقارير الشبكة."
        action={
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setEditingCenterId(null);
              setForm(defaultCenterForm);
              setIsFormOpen(true);
              setSuccessMessage("");
              setError("");
            }}
          >
            + إضافة مركز جديد
          </button>
        }
      >
        {successMessage ? <div className="credentials-banner">{successMessage}</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        {isFormOpen ? (
          <form className="center-form" onSubmit={handleSubmit}>
            <fieldset className="center-form-section">
              <legend>البيانات الأساسية</legend>
              <div className="form-grid">
                <label className="field">
                  <span>رمز المركز</span>
                  <input
                    className="technical-input"
                    dir="ltr"
                    readOnly={Boolean(editingCenterId)}
                    value={form.centerCode}
                    onChange={(event) => setForm((current) => ({ ...current, centerCode: event.target.value }))}
                    required
                  />
                  {editingCenterId ? <small className="field-hint">رمز ثابت لا يمكن تغييره بعد إنشاء المركز.</small> : null}
                </label>
                <label className="field">
                  <span>اسم المركز</span>
                  <input
                    value={form.centerName}
                    onChange={(event) => setForm((current) => ({ ...current, centerName: event.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>نوع المركز</span>
                  {editingCenterId ? (
                    <>
                      <input readOnly value={toArabicLabel(form.centerType)} />
                      <small className="field-hint">نوع ثابت لا يتغير من نموذج التعديل العادي.</small>
                    </>
                  ) : (
                    <select
                      value={form.centerType}
                      onChange={(event) => setForm((current) => ({ ...current, centerType: event.target.value }))}
                      required
                    >
                      <option value="CLINIC">مركز صحي صغير</option>
                      <option value="MEDICAL_CENTER">مركز صحي متوسط</option>
                      <option value="HOSPITAL">مستشفى</option>
                    </select>
                  )}
                </label>
              </div>
            </fieldset>

            <fieldset className="center-form-section">
              <legend>الموقع وبيانات التواصل</legend>
              <div className="form-grid">
                <label className="field">
                  <span>المنطقة</span>
                  <input
                    value={form.region}
                    onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>المدينة</span>
                  <input
                    value={form.city}
                    onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                    required
                  />
                </label>
                <label className="field field-span-2">
                  <span>العنوان</span>
                  <input
                    value={form.address}
                    onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>الهاتف</span>
                  <input
                    className="technical-input"
                    dir="ltr"
                    type="tel"
                    value={form.phone}
                    onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>البريد الإلكتروني</span>
                  <input
                    className="technical-input"
                    dir="ltr"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    onInvalid={(event) => event.currentTarget.setCustomValidity("يرجى إدخال بريد إلكتروني صحيح.")}
                    onInput={(event) => event.currentTarget.setCustomValidity("")}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="center-form-section">
              <legend>الخدمات والربط</legend>
              <div className="form-grid">
                <div className="field field-span-2">
                  <span>التخصصات</span>
                  {specialtyOptions.length > 0 ? (
                    <div className="checkbox-list">
                      {specialtyOptions.map((specialty) => (
                        <label
                          className="checkbox-option"
                          key={specialty.id === null ? `existing-${specialty.normalizedName}` : `master-${specialty.id}`}
                        >
                          <input
                            checked={isSpecialtySelected(form.specialties, specialty)}
                            onChange={() => toggleSpecialty(specialty)}
                            type="checkbox"
                          />
                          <span>{specialty.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="field-hint">لا توجد تخصصات مرجعية حاليا. أضف التخصصات من صفحة البيانات المرجعية أولا.</p>
                  )}
                </div>

                <label className="field field-span-2">
                  <span>رابط واجهة API</span>
                  <input
                    className="technical-input"
                    dir="ltr"
                    type="url"
                    value={form.apiEndpoint}
                    onChange={(event) => setForm((current) => ({ ...current, apiEndpoint: event.target.value }))}
                    onInvalid={(event) =>
                      event.currentTarget.setCustomValidity("يرجى إدخال رابط API صحيح يبدأ بـ http:// أو https://")
                    }
                    onInput={(event) => event.currentTarget.setCustomValidity("")}
                    pattern="https?://.+"
                    placeholder="http://localhost:4200/api"
                  />
                </label>
                <div className="field field-span-2">
                  <span>مفتاح API</span>
                  <input
                    autoComplete="new-password"
                    className="technical-input"
                    dir="ltr"
                    type="password"
                    value={form.apiKey}
                    onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                    placeholder={editingCenterId ? "اتركه فارغا للاحتفاظ بالمفتاح الحالي" : "أدخل مفتاحا جديدا عند الحاجة"}
                  />
                  <p className="field-hint">
                    {form.apiKey
                      ? "سيتم استبدال المفتاح الحالي عند حفظ النموذج."
                      : "المفتاح الحالي لا يعرض أبدا، وترك الحقل فارغا يحافظ عليه دون تغيير."}
                  </p>
                </div>
                <label className="connection-toggle field-span-2">
                  <input
                    checked={form.isConnected}
                    onChange={(event) => setForm((current) => ({ ...current, isConnected: event.target.checked }))}
                    type="checkbox"
                  />
                  <span className="connection-toggle-copy">
                    <strong>متصل ومسموح له بتبادل البيانات</strong>
                    <small>يسمح للمركز بالمزامنة وتبادل البيانات مع النظام المركزي.</small>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="button-row">
              <button className="primary-button" type="submit">
                {editingCenterId ? "حفظ تعديلات المركز" : "إضافة المركز"}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setEditingCenterId(null);
                  setForm(defaultCenterForm);
                  setIsFormOpen(false);
                }}
              >
                إغلاق النموذج
              </button>
            </div>
          </form>
        ) : null}
      </SectionCard>

      <SectionCard
        title="سجل المراكز المتصلة"
        subtitle="ابحث عن المراكز، وعدل حالة الاتصال، وحدث البيانات دون كشف مفاتيح API."
      >
        {selectedCenter ? (
          <div className="filter-summary">
            <div>
              <strong>{selectedCenter.name}</strong>
              <p className="muted">
                {focus === "load"
                  ? "تم فتحه من مؤشرات الحمل في التقارير."
                  : focus === "visits"
                    ? "تم فتحه من تحليل الزيارات أو الإشعارات."
                    : "يوجد فلتر مباشر على هذا المركز."}
              </p>
            </div>
            <button className="ghost-button" type="button" onClick={() => setSearchParams({})}>
              عرض جميع المراكز
            </button>
          </div>
        ) : null}

        <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
          <input
            className="toolbar-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث برمز المركز أو الاسم أو المدينة أو النوع أو الهاتف أو البريد أو التخصص"
          />
        </form>

        {visibleCenters.length === 0 ? (
          <div className="empty-state compact">لا يوجد مركز يطابق الفلاتر الحالية.</div>
        ) : (
          <div className="card-grid">
            {visibleCenters.map((center) => {
              const isHighlighted =
                center.id === selectedCenterId || (selectedCenterCode && center.code === selectedCenterCode);

              return (
                <article
                  key={center.id}
                  className={`profile-tile center-card${isHighlighted ? " highlighted-tile" : ""}`}
                >
                  <div className="tile-heading">
                    <div>
                      <p className="eyebrow technical-value" dir="ltr">{center.code}</p>
                      <h3>{center.name}</h3>
                    </div>
                    <StatusBadge status={center.isConnected ? "connected" : "suspended"} />
                  </div>
                  <p>{joinMeta([toArabicLabel(center.type), center.city])}</p>
                  <div className="center-contact muted">
                    <span>{center.address}</span>
                    <span className="technical-value" dir="ltr">{center.phone}</span>
                    {center.email ? <span className="technical-value" dir="ltr">{center.email}</span> : null}
                  </div>
                  <div className="center-metrics">
                    <span className="center-metric">
                      <strong>{formatCount(center.availableDoctors)}/{formatCount(center.totalDoctors)}</strong>
                      <small>أطباء متاحون</small>
                    </span>
                    <span className="center-metric">
                      <strong>{formatCount(center.currentLoad)}</strong>
                      <small>الحمل</small>
                    </span>
                    <span className="center-metric">
                      <strong>{formatCount(center.averageWaitTime)}</strong>
                      <small>دقيقة انتظار</small>
                    </span>
                    <span className="center-metric">
                      <strong>{formatCount(center.patientCount)}</strong>
                      <small>مريض</small>
                    </span>
                  </div>
                  <p className="center-specialties muted">
                    {center.specialties.length > 0
                      ? deduplicateSpecialtyNames(center.specialties).join("، ")
                      : "لا توجد تخصصات مسجلة."}
                  </p>
                  <p className="field-hint">مفتاح API: مخفي ولا يعرض كاملا في الواجهة</p>
                  {center.suspensionReason ? <div className="inline-note">{safeDisplay(center.suspensionReason)}</div> : null}
                  <div className="button-row">
                    <button className="ghost-button" type="button" onClick={() => editCenter(center)}>
                      تعديل
                    </button>
                    <button className="ghost-button" type="button" onClick={() => void toggleConnection(center)}>
                      {center.isConnected ? "تعطيل" : "إعادة التفعيل"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
