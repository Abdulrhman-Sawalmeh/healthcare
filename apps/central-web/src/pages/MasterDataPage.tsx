import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { MasterDataBundle } from "../types";

type MedicineRecord = MasterDataBundle["medicines"][number];
type LabTestRecord = MasterDataBundle["labTests"][number];
type SpecialtyRecord = MasterDataBundle["specialties"][number];

const defaultMedicineForm = {
  genericName: "",
  brandName: "",
  category: "",
  unit: "",
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
  const normalizedTerm = term.trim().toLowerCase();

  if (!normalizedTerm) {
    return true;
  }

  return values.some((value) => String(value ?? "").toLowerCase().includes(normalizedTerm));
}

export function MasterDataPage() {
  const [data, setData] = useState<MasterDataBundle | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [medicineQuery, setMedicineQuery] = useState("");
  const [labQuery, setLabQuery] = useState("");
  const [specialtyQuery, setSpecialtyQuery] = useState("");
  const [editingMedicineId, setEditingMedicineId] = useState<number | null>(null);
  const [editingLabId, setEditingLabId] = useState<number | null>(null);
  const [editingSpecialtyId, setEditingSpecialtyId] = useState<number | null>(null);
  const [medicineForm, setMedicineForm] = useState(defaultMedicineForm);
  const [labForm, setLabForm] = useState(defaultLabForm);
  const [specialtyForm, setSpecialtyForm] = useState(defaultSpecialtyForm);

  async function loadData() {
    const payload = await apiRequest<MasterDataBundle>("/central/master-data");
    setData(payload);
  }

  useEffect(() => {
    loadData().catch((cause: Error) => setError(cause.message));
  }, []);

  const filteredMedicines = useMemo(
    () =>
      data?.medicines.filter((medicine) =>
        includesTerm(
          [medicine.genericName, medicine.brandName, medicine.category, medicine.unit, medicine.isCritical],
          medicineQuery
        )
      ) ?? [],
    [data, medicineQuery]
  );

  const filteredLabTests = useMemo(
    () =>
      data?.labTests.filter((test) => includesTerm([test.testName, test.category, test.normalRange], labQuery)) ?? [],
    [data, labQuery]
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
  }

  function resetLabForm() {
    setLabForm(defaultLabForm);
    setEditingLabId(null);
  }

  function resetSpecialtyForm() {
    setSpecialtyForm(defaultSpecialtyForm);
    setEditingSpecialtyId(null);
  }

  function editMedicine(medicine: MedicineRecord) {
    setEditingMedicineId(medicine.id);
    setMedicineForm({
      genericName: medicine.genericName,
      brandName: medicine.brandName,
      category: medicine.category,
      unit: medicine.unit,
      isCritical: medicine.isCritical
    });
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
    setError("");
    setSuccessMessage("");
  }

  function editSpecialty(specialty: SpecialtyRecord) {
    setEditingSpecialtyId(specialty.id);
    setSpecialtyForm({
      specialtyName: specialty.specialtyName,
      description: specialty.description ?? ""
    });
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
      resetMedicineForm();
      await loadData();
      setError("");
      setSuccessMessage(editingMedicineId ? "تم تحديث الدواء وطلب المزامنة." : "تمت إضافة الدواء وطلب المزامنة.");
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
      resetLabForm();
      await loadData();
      setError("");
      setSuccessMessage(editingLabId ? "تم تحديث فحص المختبر وطلب المزامنة." : "تمت إضافة فحص المختبر وطلب المزامنة.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ فحص المختبر.");
    }
  }

  async function handleSpecialtySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = editingSpecialtyId
      ? `/central/master-data/specialties/${editingSpecialtyId}`
      : "/central/master-data/specialties";
    const method = editingSpecialtyId ? "PUT" : "POST";

    try {
      await apiRequest(path, {
        method,
        body: JSON.stringify(specialtyForm)
      });
      resetSpecialtyForm();
      await loadData();
      setError("");
      setSuccessMessage(
        editingSpecialtyId ? "تم تحديث التخصص وطلب المزامنة." : "تمت إضافة التخصص وطلب المزامنة."
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ التخصص.");
    }
  }

  async function deleteMasterDataRecord(path: string, label: string) {
    if (!window.confirm(`هل تريد حذف ${label}؟ سيتم حذفه من قاعدة البيانات.`)) {
      return;
    }

    try {
      await apiRequest(path, { method: "DELETE" });
      await loadData();
      setError("");
      setSuccessMessage(`تم حذف ${label} وطلب المزامنة.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `تعذر حذف ${label}.`);
    }
  }

  if (!data) {
    return <div className="empty-state">جاري تحميل البيانات المرجعية...</div>;
  }

  return (
    <div className="page-stack">
      <div className="hero-strip">
        <div>
          <p className="eyebrow">سجلات النظام التفاعلية</p>
          <h1>إدارة قوائم الشبكة</h1>
        </div>
        <p className="muted">
          ابحث داخل القوائم الكبيرة، وأضف سجلات جديدة، وعدّل الأدوية والفحوصات والتخصصات الحالية.
          تُحفظ التحديثات عبر واجهة API وتُرسل للمراكز ضمن طلبات المزامنة.
        </p>
      </div>

      {successMessage ? <div className="credentials-banner">{successMessage}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="split-grid">
        <SectionCard
          title={editingMedicineId ? "تعديل دواء" : "إضافة دواء"}
          subtitle="سجلات الأدوية المستخدمة في مخزون الصيدلية والوصفات والبيانات المرجعية المتزامنة."
        >
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
              <input
                value={medicineForm.unit}
                onChange={(event) => setMedicineForm((current) => ({ ...current, unit: event.target.value }))}
                required
              />
            </label>
            <label className="field checkbox-field field-span-2">
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
              {editingMedicineId ? (
                <button className="ghost-button" type="button" onClick={resetMedicineForm}>
                  إلغاء التعديل
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title={editingLabId ? "تعديل فحص مختبر" : "إضافة فحص مختبر"}
          subtitle="سجلات الفحوصات التشخيصية المستخدمة في طلبات المختبر وتقارير النتائج."
        >
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
              {editingLabId ? (
                <button className="ghost-button" type="button" onClick={resetLabForm}>
                  إلغاء التعديل
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>
      </div>

      <SectionCard title="قائمة الأدوية" subtitle={`يتم عرض ${filteredMedicines.length} من أصل ${data.medicines.length} سجل.`}>
        <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
          <input
            className="toolbar-input"
            value={medicineQuery}
            onChange={(event) => setMedicineQuery(event.target.value)}
            placeholder="ابحث باسم الدواء أو الاسم التجاري أو الفئة أو الوحدة أو حالة الأهمية"
          />
        </form>
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
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredMedicines.map((medicine) => (
                <tr key={medicine.id}>
                  <td>{medicine.genericName}</td>
                  <td>{medicine.brandName}</td>
                  <td>{medicine.category}</td>
                  <td>{medicine.unit}</td>
                  <td>{medicine.isCritical ? "حرج" : "عادي"}</td>
                  <td>{medicine.version}</td>
                  <td>
                    <div className="button-row">
                      <button className="ghost-button" type="button" onClick={() => editMedicine(medicine)}>
                        تعديل
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => deleteMasterDataRecord(`/central/master-data/medicines/${medicine.id}`, medicine.genericName)}
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

      <SectionCard title="قائمة فحوصات المختبر" subtitle={`يتم عرض ${filteredLabTests.length} من أصل ${data.labTests.length} سجل.`}>
        <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
          <input
            className="toolbar-input"
            value={labQuery}
            onChange={(event) => setLabQuery(event.target.value)}
            placeholder="ابحث باسم الفحص أو الفئة أو المدى الطبيعي"
          />
        </form>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>الفحص</th>
                <th>الفئة</th>
                <th>المدى الطبيعي</th>
                <th>الإصدار</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredLabTests.map((test) => (
                <tr key={test.id}>
                  <td>{test.testName}</td>
                  <td>{test.category}</td>
                  <td>{test.normalRange || "-"}</td>
                  <td>{test.version}</td>
                  <td>
                    <div className="button-row">
                      <button className="ghost-button" type="button" onClick={() => editLabTest(test)}>
                        تعديل
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => deleteMasterDataRecord(`/central/master-data/lab-tests/${test.id}`, test.testName)}
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
        title={editingSpecialtyId ? "تعديل تخصص" : "إضافة تخصص"}
        subtitle="التخصصات المستخدمة في الإحالات وسجلات الأطباء ومطابقة المواعيد."
      >
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
            {editingSpecialtyId ? (
              <button className="ghost-button" type="button" onClick={resetSpecialtyForm}>
                إلغاء التعديل
              </button>
            ) : null}
          </div>
        </form>

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
              <p className="muted">{specialty.description || "لا يوجد وصف مسجل."}</p>
              <div className="button-row">
                <button className="ghost-button" type="button" onClick={() => editSpecialty(specialty)}>
                  تعديل
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    deleteMasterDataRecord(`/central/master-data/specialties/${specialty.id}`, specialty.specialtyName)
                  }
                >
                  حذف
                </button>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
