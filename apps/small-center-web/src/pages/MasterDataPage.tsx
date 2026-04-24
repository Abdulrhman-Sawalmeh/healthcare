import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { MasterDataBundle } from "../types";

export function MasterDataPage() {
  const [data, setData] = useState<MasterDataBundle | null>(null);
  const [error, setError] = useState("");
  const [medicineForm, setMedicineForm] = useState({
    genericName: "",
    brandName: "",
    category: "",
    unit: "",
    isCritical: false
  });
  const [labForm, setLabForm] = useState({
    testName: "",
    category: "",
    normalRange: ""
  });
  const [specialtyForm, setSpecialtyForm] = useState({
    specialtyName: "",
    description: ""
  });

  async function loadData() {
    const payload = await apiRequest<MasterDataBundle>("/central/master-data");
    setData(payload);
  }

  useEffect(() => {
    loadData().catch((cause: Error) => setError(cause.message));
  }, []);

  async function handleMedicineSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await apiRequest("/central/master-data/medicines", {
        method: "POST",
        body: JSON.stringify(medicineForm)
      });

      setMedicineForm({
        genericName: "",
        brandName: "",
        category: "",
        unit: "",
        isCritical: false
      });
      await loadData();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر نشر الدواء.");
    }
  }

  async function handleLabSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await apiRequest("/central/master-data/lab-tests", {
        method: "POST",
        body: JSON.stringify(labForm)
      });

      setLabForm({
        testName: "",
        category: "",
        normalRange: ""
      });
      await loadData();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر نشر الفحص المخبري.");
    }
  }

  async function handleSpecialtySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await apiRequest("/central/master-data/specialties", {
        method: "POST",
        body: JSON.stringify(specialtyForm)
      });

      setSpecialtyForm({
        specialtyName: "",
        description: ""
      });
      await loadData();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر نشر التخصص الطبي.");
    }
  }

  if (!data) {
    return <div className="empty-state">جارٍ تحميل البيانات المرجعية...</div>;
  }

  return (
    <div className="page-stack">
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="split-grid">
        <SectionCard title="القائمة المرجعية للأدوية" subtitle="يتم توزيعها على جميع المراكز المتصلة.">
          <form className="form-grid" onSubmit={handleMedicineSubmit}>
            <label className="field">
              <span>الاسم العلمي</span>
              <input
                value={medicineForm.genericName}
                onChange={(event) =>
                  setMedicineForm((current) => ({ ...current, genericName: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>الاسم التجاري</span>
              <input
                value={medicineForm.brandName}
                onChange={(event) =>
                  setMedicineForm((current) => ({ ...current, brandName: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>التصنيف العلاجي</span>
              <input
                value={medicineForm.category}
                onChange={(event) =>
                  setMedicineForm((current) => ({ ...current, category: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>الوحدة</span>
              <input
                value={medicineForm.unit}
                onChange={(event) =>
                  setMedicineForm((current) => ({ ...current, unit: event.target.value }))
                }
              />
            </label>
            <label className="field checkbox-field field-span-2">
              <input
                checked={medicineForm.isCritical}
                onChange={(event) =>
                  setMedicineForm((current) => ({ ...current, isCritical: event.target.checked }))
                }
                type="checkbox"
              />
              <span>دواء حرج عالي الأهمية</span>
            </label>
            <button className="primary-button field-span-2" type="submit">
              نشر الدواء
            </button>
          </form>

          <div className="stack-list">
            {data.medicines.map((medicine) => (
              <article className="stack-item" key={medicine.id}>
                <strong>{medicine.genericName}</strong>
                <p className="muted">
                  {medicine.brandName} • {medicine.category} • الإصدار {medicine.version}
                </p>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="القائمة المرجعية للفحوصات" subtitle="دليل تشخيصي موحد على مستوى الشبكة.">
          <form className="form-grid" onSubmit={handleLabSubmit}>
            <label className="field">
              <span>اسم الفحص</span>
              <input
                value={labForm.testName}
                onChange={(event) =>
                  setLabForm((current) => ({ ...current, testName: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>التصنيف</span>
              <input
                value={labForm.category}
                onChange={(event) =>
                  setLabForm((current) => ({ ...current, category: event.target.value }))
                }
              />
            </label>
            <label className="field field-span-2">
              <span>المدى المرجعي الطبيعي</span>
              <input
                value={labForm.normalRange}
                onChange={(event) =>
                  setLabForm((current) => ({ ...current, normalRange: event.target.value }))
                }
              />
            </label>
            <button className="primary-button field-span-2" type="submit">
              نشر الفحص
            </button>
          </form>

          <div className="stack-list">
            {data.labTests.map((test) => (
              <article className="stack-item" key={test.id}>
                <strong>{test.testName}</strong>
                <p className="muted">
                  {test.category} • {test.normalRange || "لا يوجد مدى مرجعي"} • الإصدار {test.version}
                </p>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="قائمة التخصصات الطبية" subtitle="التخصصات القياسية التي يستخدمها محرك الإحالة الذكي.">
        <form className="form-grid" onSubmit={handleSpecialtySubmit}>
          <label className="field">
            <span>اسم التخصص</span>
            <input
              value={specialtyForm.specialtyName}
              onChange={(event) =>
                setSpecialtyForm((current) => ({ ...current, specialtyName: event.target.value }))
              }
            />
          </label>
          <label className="field field-span-2">
            <span>الوصف</span>
            <textarea
              value={specialtyForm.description}
              onChange={(event) =>
                setSpecialtyForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <button className="primary-button field-span-2" type="submit">
            نشر التخصص
          </button>
        </form>

        <div className="card-grid">
          {data.specialties.map((specialty) => (
            <article className="profile-tile" key={specialty.id}>
              <p className="eyebrow">تخصص طبي</p>
              <h3>{specialty.specialtyName}</h3>
              <p className="muted">{specialty.description || "لا يوجد وصف مسجل."}</p>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
