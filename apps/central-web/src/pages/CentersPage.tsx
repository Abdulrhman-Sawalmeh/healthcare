import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatCount, joinMeta, safeDisplay, toArabicLabel } from "../lib/arabic";
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
  latitude: "0",
  longitude: "0",
  specialties: [] as string[],
  isConnected: true,
  apiEndpoint: "",
  apiKey: ""
};

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
    latitude: "0",
    longitude: "0",
    specialties: center.specialties,
    isConnected: center.isConnected,
    apiEndpoint: "",
    apiKey: ""
  };
}

function normalizeCenterPayload(form: typeof defaultCenterForm) {
  const payload: Record<string, unknown> = {
    ...form,
    latitude: Number(form.latitude || 0),
    longitude: Number(form.longitude || 0),
    specialties: form.specialties
  };

  if (!form.apiKey.trim()) {
    delete payload.apiKey;
  }

  return payload;
}

function maskSecret(value?: string | null) {
  if (!value) {
    return "لا يوجد";
  }

  return `••••••••${value.slice(-4)}`;
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
  const [pendingDelete, setPendingDelete] = useState<CenterRecord | null>(null);
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
        body: JSON.stringify(normalizeCenterPayload(form))
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

  async function deleteCenter(center: CenterRecord) {
    try {
      await apiRequest(`/central/centers/${center.id}`, { method: "DELETE" });
      setCenters((current) => current.filter((item) => item.id !== center.id));
      setPendingDelete(null);
      setError("");
      setSuccessMessage("تم حذف بيانات المركز.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف بيانات المركز.");
      setPendingDelete(null);
    }
  }

  function editCenter(center: CenterRecord) {
    setEditingCenterId(center.id);
    setForm(centerToForm(center));
    setIsFormOpen(true);
    setError("");
    setSuccessMessage("");
  }

  function toggleSpecialty(specialty: string) {
    setForm((current) => ({
      ...current,
      specialties: current.specialties.includes(specialty)
        ? current.specialties.filter((item) => item !== specialty)
        : [...current.specialties, specialty]
    }));
  }

  const specialtyOptions = useMemo(() => {
    const masterSpecialties = masterData?.specialties.map((specialty) => specialty.specialtyName) ?? [];
    const existingSpecialties = centers.flatMap((center) => center.specialties);
    return Array.from(new Set([...masterSpecialties, ...existingSpecialties])).sort((a, b) =>
      a.localeCompare(b, "ar")
    );
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
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>رمز المركز</span>
              <input
                value={form.centerCode}
                onChange={(event) => setForm((current) => ({ ...current, centerCode: event.target.value }))}
                required
              />
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
              <select
                value={form.centerType}
                onChange={(event) => setForm((current) => ({ ...current, centerType: event.target.value }))}
              >
                <option value="CLINIC">مركز صحي صغير</option>
                <option value="MEDICAL_CENTER">مركز صحي متوسط</option>
                <option value="HOSPITAL">مستشفى</option>
              </select>
            </label>
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
            <label className="field">
              <span>الهاتف</span>
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>البريد الإلكتروني</span>
              <input
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>خط العرض</span>
              <input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(event) => setForm((current) => ({ ...current, latitude: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>خط الطول</span>
              <input
                type="number"
                step="any"
                value={form.longitude}
                onChange={(event) => setForm((current) => ({ ...current, longitude: event.target.value }))}
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

            <div className="field field-span-2">
              <span>التخصصات</span>
              {specialtyOptions.length > 0 ? (
                <div className="checkbox-list">
                  {specialtyOptions.map((specialty) => (
                    <label className="checkbox-option" key={specialty}>
                      <input
                        checked={form.specialties.includes(specialty)}
                        onChange={() => toggleSpecialty(specialty)}
                        type="checkbox"
                      />
                      <span>{specialty}</span>
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
                value={form.apiEndpoint}
                onChange={(event) => setForm((current) => ({ ...current, apiEndpoint: event.target.value }))}
                placeholder="https://center-api.example.com/api"
              />
            </label>
            <div className="field field-span-2">
              <span>مفتاح API</span>
              <input
                type="password"
                value={form.apiKey}
                onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                placeholder={editingCenterId ? "اتركه فارغا للاحتفاظ بالمفتاح الحالي" : "أدخل مفتاحا جديدا عند الحاجة"}
              />
              <p className="field-hint">
                {form.apiKey ? `المفتاح المدخل: ${maskSecret(form.apiKey)}` : "لا يتم عرض مفاتيح API الحالية كاملة داخل الواجهة."}
              </p>
              {form.apiKey ? (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(form.apiKey)}
                >
                  نسخ المفتاح
                </button>
              ) : null}
            </div>
            <label className="field checkbox-field field-span-2">
              <input
                checked={form.isConnected}
                onChange={(event) => setForm((current) => ({ ...current, isConnected: event.target.checked }))}
                type="checkbox"
              />
              <span>متصل ومسموح له بتبادل البيانات</span>
            </label>
            <div className="field-span-2 button-row">
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
        ) : (
          <div className="empty-state compact">نموذج إضافة المركز مخفي. استخدم زر “+ إضافة مركز جديد” عند الحاجة.</div>
        )}
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
                <article key={center.id} className={`profile-tile${isHighlighted ? " highlighted-tile" : ""}`}>
                  <div className="tile-heading">
                    <div>
                      <p className="eyebrow">{center.code}</p>
                      <h3>{center.name}</h3>
                    </div>
                    <StatusBadge status={center.isConnected ? "connected" : "suspended"} />
                  </div>
                  <p>{joinMeta([toArabicLabel(center.type), center.city])}</p>
                  <p className="muted">{joinMeta([center.address, center.phone, center.email])}</p>
                  <div className="tile-stats">
                    <span>{formatCount(center.availableDoctors)}/{formatCount(center.totalDoctors)} أطباء متاحون</span>
                    <span>الحمل {formatCount(center.currentLoad)}</span>
                    <span>الانتظار {formatCount(center.averageWaitTime)} دقيقة</span>
                    <span>{formatCount(center.patientCount)} مريض</span>
                  </div>
                  <p className="muted">
                    {center.specialties.length > 0 ? center.specialties.join("، ") : "لا توجد تخصصات مسجلة."}
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
                    <button className="danger-button" type="button" onClick={() => setPendingDelete(center)}>
                      حذف نهائي
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      {pendingDelete ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-center-title">
          <div className="modal-card compact">
            <div className="modal-header">
              <div>
                <p className="eyebrow">تأكيد حساس</p>
                <h2 id="delete-center-title">حذف مركز نهائيا</h2>
              </div>
              <button className="ghost-button modal-close-button" type="button" onClick={() => setPendingDelete(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                حذف {pendingDelete.name} قد يفشل إذا كان مرتبطا بمرضى أو زيارات أو إحالات. يفضل تعطيل المركز إذا كان
                الهدف إيقاف الاتصال فقط.
              </p>
              <div className="button-row">
                <button className="danger-button" type="button" onClick={() => void deleteCenter(pendingDelete)}>
                  تأكيد الحذف النهائي
                </button>
                <button className="ghost-button" type="button" onClick={() => setPendingDelete(null)}>
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
