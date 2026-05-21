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
      setSuccessMessage(editingMedicineId ? "Medicine updated and sync requested." : "Medicine added and sync requested.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save medicine.");
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
      setSuccessMessage(editingLabId ? "Lab test updated and sync requested." : "Lab test added and sync requested.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save lab test.");
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
        editingSpecialtyId ? "Specialty updated and sync requested." : "Specialty added and sync requested."
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save specialty.");
    }
  }

  async function deleteMasterDataRecord(path: string, label: string) {
    if (!window.confirm(`Delete ${label}? This will remove it from the database.`)) {
      return;
    }

    try {
      await apiRequest(path, { method: "DELETE" });
      await loadData();
      setError("");
      setSuccessMessage(`${label} deleted and sync requested.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to delete ${label}.`);
    }
  }

  if (!data) {
    return <div className="empty-state">Loading master data...</div>;
  }

  return (
    <div className="page-stack">
      <div className="hero-strip">
        <div>
          <p className="eyebrow">Interactive system records</p>
          <h1>Manage network lists</h1>
        </div>
        <p className="muted">
          Search large lists, add new records, and edit existing medicines, lab tests, and specialties.
          Updates are saved through the API and queued for center synchronization.
        </p>
      </div>

      {successMessage ? <div className="credentials-banner">{successMessage}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="split-grid">
        <SectionCard
          title={editingMedicineId ? "Edit medicine" : "Add medicine"}
          subtitle="Medication records used by pharmacy inventory, prescriptions, and synchronized master data."
        >
          <form className="form-grid" onSubmit={handleMedicineSubmit}>
            <label className="field">
              <span>Generic name</span>
              <input
                value={medicineForm.genericName}
                onChange={(event) => setMedicineForm((current) => ({ ...current, genericName: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Brand name</span>
              <input
                value={medicineForm.brandName}
                onChange={(event) => setMedicineForm((current) => ({ ...current, brandName: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Category</span>
              <input
                value={medicineForm.category}
                onChange={(event) => setMedicineForm((current) => ({ ...current, category: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Unit</span>
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
              <span>Critical medicine</span>
            </label>
            <div className="field-span-2 button-row">
              <button className="primary-button" type="submit">
                {editingMedicineId ? "Save medicine changes" : "Add medicine"}
              </button>
              {editingMedicineId ? (
                <button className="ghost-button" type="button" onClick={resetMedicineForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title={editingLabId ? "Edit lab test" : "Add lab test"}
          subtitle="Diagnostic test records used by lab requests and result reporting."
        >
          <form className="form-grid" onSubmit={handleLabSubmit}>
            <label className="field">
              <span>Test name</span>
              <input
                value={labForm.testName}
                onChange={(event) => setLabForm((current) => ({ ...current, testName: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Category</span>
              <input
                value={labForm.category}
                onChange={(event) => setLabForm((current) => ({ ...current, category: event.target.value }))}
                required
              />
            </label>
            <label className="field field-span-2">
              <span>Normal range</span>
              <input
                value={labForm.normalRange}
                onChange={(event) => setLabForm((current) => ({ ...current, normalRange: event.target.value }))}
              />
            </label>
            <div className="field-span-2 button-row">
              <button className="primary-button" type="submit">
                {editingLabId ? "Save lab test changes" : "Add lab test"}
              </button>
              {editingLabId ? (
                <button className="ghost-button" type="button" onClick={resetLabForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>
      </div>

      <SectionCard title="Medicines list" subtitle={`${filteredMedicines.length} of ${data.medicines.length} records shown.`}>
        <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
          <input
            className="toolbar-input"
            value={medicineQuery}
            onChange={(event) => setMedicineQuery(event.target.value)}
            placeholder="Search by medicine, brand, category, unit, or critical status"
          />
        </form>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Generic</th>
                <th>Brand</th>
                <th>Category</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Version</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMedicines.map((medicine) => (
                <tr key={medicine.id}>
                  <td>{medicine.genericName}</td>
                  <td>{medicine.brandName}</td>
                  <td>{medicine.category}</td>
                  <td>{medicine.unit}</td>
                  <td>{medicine.isCritical ? "Critical" : "Standard"}</td>
                  <td>{medicine.version}</td>
                  <td>
                    <div className="button-row">
                      <button className="ghost-button" type="button" onClick={() => editMedicine(medicine)}>
                        Edit
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => deleteMasterDataRecord(`/central/master-data/medicines/${medicine.id}`, medicine.genericName)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Lab tests list" subtitle={`${filteredLabTests.length} of ${data.labTests.length} records shown.`}>
        <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
          <input
            className="toolbar-input"
            value={labQuery}
            onChange={(event) => setLabQuery(event.target.value)}
            placeholder="Search by test, category, or normal range"
          />
        </form>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Test</th>
                <th>Category</th>
                <th>Normal range</th>
                <th>Version</th>
                <th>Actions</th>
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
                        Edit
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => deleteMasterDataRecord(`/central/master-data/lab-tests/${test.id}`, test.testName)}
                      >
                        Delete
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
        title={editingSpecialtyId ? "Edit specialty" : "Add specialty"}
        subtitle="Specialties used by referrals, doctor records, and appointment matching."
      >
        <form className="form-grid" onSubmit={handleSpecialtySubmit}>
          <label className="field">
            <span>Specialty name</span>
            <input
              value={specialtyForm.specialtyName}
              onChange={(event) => setSpecialtyForm((current) => ({ ...current, specialtyName: event.target.value }))}
              required
            />
          </label>
          <label className="field field-span-2">
            <span>Description</span>
            <textarea
              value={specialtyForm.description}
              onChange={(event) => setSpecialtyForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <div className="field-span-2 button-row">
            <button className="primary-button" type="submit">
              {editingSpecialtyId ? "Save specialty changes" : "Add specialty"}
            </button>
            {editingSpecialtyId ? (
              <button className="ghost-button" type="button" onClick={resetSpecialtyForm}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>

        <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
          <input
            className="toolbar-input"
            value={specialtyQuery}
            onChange={(event) => setSpecialtyQuery(event.target.value)}
            placeholder="Search specialties"
          />
        </form>
        <div className="card-grid">
          {filteredSpecialties.map((specialty) => (
            <article className="profile-tile interactive-card" key={specialty.id}>
              <p className="eyebrow">Specialty</p>
              <h3>{specialty.specialtyName}</h3>
              <p className="muted">{specialty.description || "No description recorded."}</p>
              <div className="button-row">
                <button className="ghost-button" type="button" onClick={() => editSpecialty(specialty)}>
                  Edit
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    deleteMasterDataRecord(`/central/master-data/specialties/${specialty.id}`, specialty.specialtyName)
                  }
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
