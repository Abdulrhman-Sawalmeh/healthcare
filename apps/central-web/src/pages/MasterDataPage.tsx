import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { formatCount, formatDateTime, formatMedicineUnit, normalizeArabicText, safeDisplay } from "../lib/arabic";
import { MasterDataBundle } from "../types";

type MedicineRecord = MasterDataBundle["medicines"][number];
type LabTestRecord = MasterDataBundle["labTests"][number];
type SpecialtyRecord = MasterDataBundle["specialties"][number];
type OpenForm = "medicine" | "lab" | "specialty" | null;

const medicineUnitOptions = ["قرص", "كبسولة", "مل", "أمبول", "جرعة", "قارورة", "عبوة", "كريم", "قطرات"];

const defaultMedicineForm = {
  genericName: "",
  brandName: "",
  category: "",
  unit: "قرص",
  isCritical: false
};

const defaultLabForm = {
  testName: "",
  category: "",
  normalRange: ""
};

const defaultSpecialtyForm = {
  specialtyName: "",
  description: ""
};

function includesTerm(values: Array<string | number | boolean | null | undefined>, term: string) {
  const normalizedTerm = normalizeArabicText(term).toLowerCase();

  if (!normalizedTerm) {
    return true;
  }

  return values.some((value) => String(value ?? "").toLowerCase().includes(normalizedTerm));
}

function normalizeName(value: string) {
  return normalizeArabicText(value).toLowerCase();
}

export function MasterDataPage() {
  const [data, setData] = useState<MasterDataBundle | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [medicineQuery, setMedicineQuery] = useState("");
  const [medicineCategoryFilter, setMedicineCategoryFilter] = useState("");
  const [medicineStatusFilter, setMedicineStatusFilter] = useState("");
  const [medicineUnitFilter, setMedicineUnitFilter] = useState("");
  const [labQuery, setLabQuery] = useState("");
  const [labCategoryFilter, setLabCategoryFilter] = useState("");
  const [specialtyQuery, setSpecialtyQuery] = useState("");
  const [editingMedicineId, setEditingMedicineId] = useState<number | null>(null);
  const [editingLabId, setEditingLabId] = useState<number | null>(null);
  const [editingSpecialtyId, setEditingSpecialtyId] = useState<number | null>(null);
  const [medicineForm, setMedicineForm] = useState(defaultMedicineForm);
  const [labForm, setLabForm] = useState(defaultLabForm);
  const [specialtyForm, setSpecialtyForm] = useState(defaultSpecialtyForm);
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [pendingDelete, setPendingDelete] = useState<{ path: string; label: string } | null>(null);

  async function loadData() {
    const payload = await apiRequest<MasterDataBundle>("/central/master-data");
    setData(payload);
  }

  useEffect(() => {
    loadData().catch((cause: Error) => setError(cause.message));
  }, []);

  const medicineCategories = useMemo(
    () => Array.from(new Set(data?.medicines.map((medicine) => medicine.category) ?? [])).sort((a, b) => a.localeCompare(b, "ar")),
    [data]
  );
  const medicineUnits = useMemo(
    () =>
      Array.from(new Set(data?.medicines.map((medicine) => formatMedicineUnit(medicine.unit)) ?? [])).sort((a, b) =>
        a.localeCompare(b, "ar")
      ),
    [data]
  );
  const labCategories = useMemo(
    () => Array.from(new Set(data?.labTests.map((test) => test.category) ?? [])).sort((a, b) => a.localeCompare(b, "ar")),
    [data]
  );

  const filteredMedicines = useMemo(
    () =>
      data?.medicines.filter((medicine) => {
        if (!includesTerm([medicine.genericName, medicine.brandName, medicine.category, formatMedicineUnit(medicine.unit), medicine.isCritical], medicineQuery)) {
          return false;
        }

        if (medicineCategoryFilter && medicine.category !== medicineCategoryFilter) {
          return false;
        }

        if (medicineStatusFilter === "critical" && !medicine.isCritical) {
          return false;
        }

        if (medicineStatusFilter === "normal" && medicine.isCritical) {
          return false;
        }

        if (medicineUnitFilter && formatMedicineUnit(medicine.unit) !== medicineUnitFilter) {
          return false;
        }

        return true;
      }) ?? [],
    [data, medicineCategoryFilter, medicineQuery, medicineStatusFilter, medicineUnitFilter]
  );

  const filteredLabTests = useMemo(
    () =>
      data?.labTests.filter((test) => {
        if (!includesTerm([test.testName, test.category, test.normalRange], labQuery)) {
          return false;
        }

        if (labCategoryFilter && test.category !== labCategoryFilter) {
          return false;
        }

        return true;
      }) ?? [],
    [data, labCategoryFilter, labQuery]
  );

  const filteredSpecialties = useMemo(
    () =>
      data?.specialties.filter((specialty) =>
        includesTerm([specialty.specialtyName, specialty.description], specialtyQuery)
      ) ?? [],
    [data, specialtyQuery]
  );

  function resetMedicineForm() {
    setMedicineForm(defaultMedicineForm);
    setEditingMedicineId(null);
    setOpenForm(null);
  }

  function resetLabForm() {
    setLabForm(defaultLabForm);
    setEditingLabId(null);
    setOpenForm(null);
  }

  function resetSpecialtyForm() {
    setSpecialtyForm(defaultSpecialtyForm);
    setEditingSpecialtyId(null);
    setOpenForm(null);
  }

  function editMedicine(medicine: MedicineRecord) {
    setEditingMedicineId(medicine.id);
    setMedicineForm({
      genericName: medicine.genericName,
      brandName: medicine.brandName,
      category: medicine.category,
      unit: formatMedicineUnit(medicine.unit),
      isCritical: medicine.isCritical
    });
    setOpenForm("medicine");
    setError("");
    setSuccessMessage("");
  }

  function editLabTest(test: LabTestRecord) {
    setEditingLabId(test.id);
    setLabForm({
      testName: test.testName,
      category: test.category,
      normalRange: test.normalRange ?? ""
    });
    setOpenForm("lab");
    setError("");
    setSuccessMessage("");
  }

  function editSpecialty(specialty: SpecialtyRecord) {
    setEditingSpecialtyId(specialty.id);
    setSpecialtyForm({
      specialtyName: specialty.specialtyName,
      description: specialty.description ?? ""
    });
    setOpenForm("specialty");
    setError("");
    setSuccessMessage("");
  }

  async function handleMedicineSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = editingMedicineId
      ? `/central/master-data/medicines/${editingMedicineId}`
      : "/central/master-data/medicines";
    const method = editingMedicineId ? "PUT" : "POST";

    try {
      await apiRequest(path, {
        method,
        body: JSON.stringify(medicineForm)
      });
      await loadData();
      setError("");
      setSuccessMessage(editingMedicineId ? "تم تحديث الدواء وطلب المزامنة." : "تمت إضافة الدواء وطلب المزامنة.");
      resetMedicineForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ الدواء.");
    }
  }

  async function handleLabSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = editingLabId ? `/central/master-data/lab-tests/${editingLabId}` : "/central/master-data/lab-tests";
    const method = editingLabId ? "PUT" : "POST";

    try {
      await apiRequest(path, {
        method,
        body: JSON.stringify(labForm)
      });
      await loadData();
      setError("");
      setSuccessMessage(editingLabId ? "تم تحديث فحص المختبر وطلب المزامنة." : "تمت إضافة فحص المختبر وطلب المزامنة.");
      resetLabForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ فحص المختبر.");
    }
  }

  async function handleSpecialtySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = normalizeName(specialtyForm.specialtyName);
    const duplicate = data?.specialties.some(
      (specialty) => specialty.id !== editingSpecialtyId && normalizeName(specialty.specialtyName) === normalizedName
    );

    if (duplicate) {
      setError("هذا التخصص موجود بالفعل. لا يمكن إنشاء تخصص مكرر.");
      return;
    }

    const path = editingSpecialtyId
      ? `/central/master-data/specialties/${editingSpecialtyId}`
      : "/central/master-data/specialties";
    const method = editingSpecialtyId ? "PUT" : "POST";

    try {
      await apiRequest(path, {
        method,
        body: JSON.stringify(specialtyForm)
      });
      await loadData();
      setError("");
      setSuccessMessage(
        editingSpecialtyId ? "تم تحديث التخصص وطلب المزامنة." : "تمت إضافة التخصص وطلب المزامنة."
      );
      resetSpecialtyForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ التخصص.");
    }
  }

  async function deleteMasterDataRecord(path: string, label: string) {
    try {
      await apiRequest(path, { method: "DELETE" });
      await loadData();
      setError("");
      setPendingDelete(null);
      setSuccessMessage(`تم حذف ${label} وطلب المزامنة.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `تعذر حذف ${label}.`);
      setPendingDelete(null);
    }
  }

  if (!data) {
    return <div className="empty-state">جاري تحميل البيانات المرجعية...</div>;
  }

  return (
    <div className="page-stack">
      <div className="hero-strip">
        <div>
          <p className="eyebrow">سجلات الشبكة المرجعية</p>
          <h1>إدارة البيانات المرجعية</h1>
        </div>
        <p className="muted">
          أضف وعدل الأدوية والفحوصات والتخصصات المستخدمة في الإحالات والمزامنة دون إنشاء تكرارات غير واضحة.
        </p>
      </div>

      <div className="summary-grid">
        <div className="summary-card">
          <span>عدد الأدوية</span>
          <strong>{formatCount(data.medicines.length)}</strong>
        </div>
        <div className="summary-card">
          <span>عدد الفحوصات</span>
          <strong>{formatCount(data.labTests.length)}</strong>
        </div>
        <div className="summary-card">
          <span>عدد التخصصات</span>
          <strong>{formatCount(data.specialties.length)}</strong>
        </div>
      </div>

      {successMessage ? <div className="credentials-banner">{successMessage}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <SectionCard
        title="إضافة وتعديل السجلات"
        subtitle="النماذج مخفية افتراضيا لتبقى الصفحة سهلة القراءة أثناء العرض."
        action={
          <div className="button-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setEditingMedicineId(null);
                setMedicineForm(defaultMedicineForm);
                setOpenForm("medicine");
              }}
            >
              + إضافة دواء
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setEditingLabId(null);
                setLabForm(defaultLabForm);
                setOpenForm("lab");
              }}
            >
              + إضافة فحص
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setEditingSpecialtyId(null);
                setSpecialtyForm(defaultSpecialtyForm);
                setOpenForm("specialty");
              }}
            >
              + إضافة تخصص
            </button>
          </div>
        }
      >
        {openForm === "medicine" ? (
          <form className="form-grid" onSubmit={handleMedicineSubmit}>
            <label className="field">
              <span>الاسم العلمي</span>
              <input
                value={medicineForm.genericName}
                onChange={(event) => setMedicineForm((current) => ({ ...current, genericName: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>الاسم التجاري</span>
              <input
                value={medicineForm.brandName}
                onChange={(event) => setMedicineForm((current) => ({ ...current, brandName: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>الفئة</span>
              <input
                value={medicineForm.category}
                onChange={(event) => setMedicineForm((current) => ({ ...current, category: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>الوحدة</span>
              <select
                value={medicineForm.unit}
                onChange={(event) => setMedicineForm((current) => ({ ...current, unit: event.target.value }))}
              >
                {medicineUnitOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-option field-span-2">
              <input
                checked={medicineForm.isCritical}
                onChange={(event) => setMedicineForm((current) => ({ ...current, isCritical: event.target.checked }))}
                type="checkbox"
              />
              <span>دواء حرج</span>
            </label>
            <div className="field-span-2 button-row">
              <button className="primary-button" type="submit">
                {editingMedicineId ? "حفظ تعديلات الدواء" : "إضافة الدواء"}
              </button>
              <button className="ghost-button" type="button" onClick={resetMedicineForm}>
                إغلاق
              </button>
            </div>
          </form>
        ) : null}

        {openForm === "lab" ? (
          <form className="form-grid" onSubmit={handleLabSubmit}>
            <label className="field">
              <span>اسم الفحص</span>
              <input
                value={labForm.testName}
                onChange={(event) => setLabForm((current) => ({ ...current, testName: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>الفئة</span>
              <input
                value={labForm.category}
                onChange={(event) => setLabForm((current) => ({ ...current, category: event.target.value }))}
                required
              />
            </label>
            <label className="field field-span-2">
              <span>المدى الطبيعي</span>
              <input
                value={labForm.normalRange}
                onChange={(event) => setLabForm((current) => ({ ...current, normalRange: event.target.value }))}
              />
            </label>
            <div className="field-span-2 button-row">
              <button className="primary-button" type="submit">
                {editingLabId ? "حفظ تعديلات الفحص" : "إضافة الفحص"}
              </button>
              <button className="ghost-button" type="button" onClick={resetLabForm}>
                إغلاق
              </button>
            </div>
          </form>
        ) : null}

        {openForm === "specialty" ? (
          <form className="form-grid" onSubmit={handleSpecialtySubmit}>
            <label className="field">
              <span>اسم التخصص</span>
              <input
                value={specialtyForm.specialtyName}
                onChange={(event) => setSpecialtyForm((current) => ({ ...current, specialtyName: event.target.value }))}
                required
              />
            </label>
            <label className="field field-span-2">
              <span>الوصف</span>
              <textarea
                value={specialtyForm.description}
                onChange={(event) => setSpecialtyForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <div className="field-span-2 button-row">
              <button className="primary-button" type="submit">
                {editingSpecialtyId ? "حفظ تعديلات التخصص" : "إضافة التخصص"}
              </button>
              <button className="ghost-button" type="button" onClick={resetSpecialtyForm}>
                إغلاق
              </button>
            </div>
          </form>
        ) : null}

        {!openForm ? <div className="empty-state compact">اختر نوع السجل الذي تريد إضافته أو تعديله.</div> : null}
      </SectionCard>

      <SectionCard title="قائمة الأدوية" subtitle={`يتم عرض ${formatCount(filteredMedicines.length)} من أصل ${formatCount(data.medicines.length)} سجل.`}>
        <div className="filter-grid">
          <label className="field field-span-full">
            <span>بحث</span>
            <input
              className="toolbar-input"
              value={medicineQuery}
              onChange={(event) => setMedicineQuery(event.target.value)}
              placeholder="ابحث باسم الدواء أو الاسم التجاري أو الفئة أو الوحدة"
            />
          </label>
          <label className="field">
            <span>الفئة</span>
            <select value={medicineCategoryFilter} onChange={(event) => setMedicineCategoryFilter(event.target.value)}>
              <option value="">كل الفئات</option>
              {medicineCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>الحالة</span>
            <select value={medicineStatusFilter} onChange={(event) => setMedicineStatusFilter(event.target.value)}>
              <option value="">كل الحالات</option>
              <option value="critical">دواء حرج</option>
              <option value="normal">عادي</option>
            </select>
          </label>
          <label className="field">
            <span>الوحدة</span>
            <select value={medicineUnitFilter} onChange={(event) => setMedicineUnitFilter(event.target.value)}>
              <option value="">كل الوحدات</option>
              {medicineUnits.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>الاسم العلمي</th>
                <th>الاسم التجاري</th>
                <th>الفئة</th>
                <th>الوحدة</th>
                <th>الحالة</th>
                <th>الإصدار</th>
                <th>آخر تحديث</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredMedicines.map((medicine) => (
                <tr key={medicine.id}>
                  <td>{medicine.genericName}</td>
                  <td>{medicine.brandName}</td>
                  <td>{medicine.category}</td>
                  <td>{formatMedicineUnit(medicine.unit)}</td>
                  <td>{medicine.isCritical ? "حرج" : "عادي"}</td>
                  <td>{formatCount(medicine.version)}</td>
                  <td>{formatDateTime(medicine.updatedAt)}</td>
                  <td>
                    <div className="button-row">
                      <button className="ghost-button" type="button" onClick={() => editMedicine(medicine)}>
                        تعديل
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() => setPendingDelete({ path: `/central/master-data/medicines/${medicine.id}`, label: medicine.genericName })}
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="قائمة فحوصات المختبر" subtitle={`يتم عرض ${formatCount(filteredLabTests.length)} من أصل ${formatCount(data.labTests.length)} سجل.`}>
        <div className="filter-grid">
          <label className="field field-span-full">
            <span>بحث</span>
            <input
              className="toolbar-input"
              value={labQuery}
              onChange={(event) => setLabQuery(event.target.value)}
              placeholder="ابحث باسم الفحص أو الفئة أو المدى الطبيعي"
            />
          </label>
          <label className="field">
            <span>الفئة</span>
            <select value={labCategoryFilter} onChange={(event) => setLabCategoryFilter(event.target.value)}>
              <option value="">كل الفئات</option>
              {labCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>الفحص</th>
                <th>الفئة</th>
                <th>المدى الطبيعي</th>
                <th>الإصدار</th>
                <th>آخر تحديث</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredLabTests.map((test) => (
                <tr key={test.id}>
                  <td>{test.testName}</td>
                  <td>{test.category}</td>
                  <td>{safeDisplay(test.normalRange, "لا يوجد")}</td>
                  <td>{formatCount(test.version)}</td>
                  <td>{formatDateTime(test.updatedAt)}</td>
                  <td>
                    <div className="button-row">
                      <button className="ghost-button" type="button" onClick={() => editLabTest(test)}>
                        تعديل
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() => setPendingDelete({ path: `/central/master-data/lab-tests/${test.id}`, label: test.testName })}
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="قائمة التخصصات"
        subtitle={`يتم عرض ${formatCount(filteredSpecialties.length)} من أصل ${formatCount(data.specialties.length)} سجل.`}
      >
        <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
          <input
            className="toolbar-input"
            value={specialtyQuery}
            onChange={(event) => setSpecialtyQuery(event.target.value)}
            placeholder="ابحث في التخصصات"
          />
        </form>
        <div className="card-grid">
          {filteredSpecialties.map((specialty) => (
            <article className="profile-tile interactive-card" key={specialty.id}>
              <p className="eyebrow">تخصص</p>
              <h3>{specialty.specialtyName}</h3>
              <p className="muted">{safeDisplay(specialty.description, "لا يوجد وصف مسجل.")}</p>
              <p className="field-hint">آخر تحديث: {formatDateTime(specialty.updatedAt)}</p>
              <div className="button-row">
                <button className="ghost-button" type="button" onClick={() => editSpecialty(specialty)}>
                  تعديل
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() =>
                    setPendingDelete({ path: `/central/master-data/specialties/${specialty.id}`, label: specialty.specialtyName })
                  }
                >
                  حذف
                </button>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      {pendingDelete ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="master-delete-title">
          <div className="modal-card compact">
            <div className="modal-header">
              <div>
                <p className="eyebrow">تأكيد حذف</p>
                <h2 id="master-delete-title">حذف سجل مرجعي</h2>
              </div>
              <button className="ghost-button modal-close-button" type="button" onClick={() => setPendingDelete(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                سيتم حذف {pendingDelete.label} من البيانات المرجعية. إذا كان السجل مستخدما في وصفات أو فحوصات أو إحالات
                فقد يرفض الخادم الحذف لحماية السجلات التاريخية.
              </p>
              <div className="button-row">
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void deleteMasterDataRecord(pendingDelete.path, pendingDelete.label)}
                >
                  تأكيد الحذف
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
