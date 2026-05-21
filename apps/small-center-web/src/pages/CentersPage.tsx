import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { joinMeta, toArabicLabel } from "../lib/arabic";
import { CenterRecord } from "../types";

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
  specialties: "",
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
    specialties: center.specialties.join(", "),
    isConnected: center.isConnected,
    apiEndpoint: "",
    apiKey: ""
  };
}

function normalizeCenterPayload(form: typeof defaultCenterForm) {
  return {
    ...form,
    latitude: Number(form.latitude || 0),
    longitude: Number(form.longitude || 0),
    specialties: form.specialties
      .split(",")
      .map((specialty) => specialty.trim())
      .filter(Boolean)
  };
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [query, setQuery] = useState("");
  const [editingCenterId, setEditingCenterId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultCenterForm);
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedCenterId = Number(searchParams.get("centerId") ?? "");
  const selectedCenterCode = searchParams.get("centerCode") ?? "";
  const focus = searchParams.get("focus") ?? "";

  async function loadCenters() {
    const payload = await apiRequest<CenterRecord[]>("/central/centers");
    setCenters(payload);
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
      setError("");
      setSuccessMessage(editingCenterId ? "Center record updated." : "Center record added.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save center record.");
    }
  }

  async function toggleConnection(center: CenterRecord) {
    const nextState = !center.isConnected;

    try {
      const updated = await apiRequest<CenterRecord>(`/central/centers/${center.id}/connection`, {
        method: "PATCH",
        body: JSON.stringify({
          isConnected: nextState,
          reason: nextState ? undefined : "Connection suspended from the central control panel."
        })
      });

      setCenters((current) => current.map((item) => (item.id === center.id ? updated : item)));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update connection status.");
    }
  }

  async function deleteCenter(center: CenterRecord) {
    if (!window.confirm(`Delete ${center.name}? This may fail if the center already has patients, visits, or referrals.`)) {
      return;
    }

    try {
      await apiRequest(`/central/centers/${center.id}`, { method: "DELETE" });
      setCenters((current) => current.filter((item) => item.id !== center.id));
      setError("");
      setSuccessMessage("Center record deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete center record.");
    }
  }

  function editCenter(center: CenterRecord) {
    setEditingCenterId(center.id);
    setForm(centerToForm(center));
    setError("");
    setSuccessMessage("");
  }

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
    return <div className="empty-state">Loading centers...</div>;
  }

  return (
    <div className="page-stack">
      <SectionCard
        title={editingCenterId ? "Edit center" : "Add center"}
        subtitle="Create and maintain the connected hospitals, medical centers, and clinics used by referrals and network reports."
      >
        {successMessage ? <div className="credentials-banner">{successMessage}</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>Code</span>
            <input
              value={form.centerCode}
              onChange={(event) => setForm((current) => ({ ...current, centerCode: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              value={form.centerName}
              onChange={(event) => setForm((current) => ({ ...current, centerName: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select
              value={form.centerType}
              onChange={(event) => setForm((current) => ({ ...current, centerType: event.target.value }))}
            >
              <option value="CLINIC">Clinic</option>
              <option value="MEDICAL_CENTER">Medical center</option>
              <option value="HOSPITAL">Hospital</option>
            </select>
          </label>
          <label className="field">
            <span>Region</span>
            <input
              value={form.region}
              onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>City</span>
            <input
              value={form.city}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>Latitude</span>
            <input
              type="number"
              step="any"
              value={form.latitude}
              onChange={(event) => setForm((current) => ({ ...current, latitude: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input
              type="number"
              step="any"
              value={form.longitude}
              onChange={(event) => setForm((current) => ({ ...current, longitude: event.target.value }))}
            />
          </label>
          <label className="field field-span-2">
            <span>Address</span>
            <input
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              required
            />
          </label>
          <label className="field field-span-2">
            <span>Specialties</span>
            <input
              value={form.specialties}
              onChange={(event) => setForm((current) => ({ ...current, specialties: event.target.value }))}
              placeholder="Cardiology, Pediatrics, Internal medicine"
            />
          </label>
          <label className="field field-span-2">
            <span>API endpoint</span>
            <input
              value={form.apiEndpoint}
              onChange={(event) => setForm((current) => ({ ...current, apiEndpoint: event.target.value }))}
              placeholder="https://center-api.example.com/api"
            />
          </label>
          <label className="field field-span-2">
            <span>API key</span>
            <input
              value={form.apiKey}
              onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
            />
          </label>
          <label className="field checkbox-field field-span-2">
            <input
              checked={form.isConnected}
              onChange={(event) => setForm((current) => ({ ...current, isConnected: event.target.checked }))}
              type="checkbox"
            />
            <span>Connected and allowed to exchange data</span>
          </label>
          <div className="field-span-2 button-row">
            <button className="primary-button" type="submit">
              {editingCenterId ? "Save center changes" : "Add center"}
            </button>
            {editingCenterId ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setEditingCenterId(null);
                  setForm(defaultCenterForm);
                }}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Connected centers registry"
        subtitle="Search, update connection status, edit details, or remove unused center records."
      >
        {selectedCenter ? (
          <div className="filter-summary">
            <div>
              <strong>{selectedCenter.name}</strong>
              <p className="muted">
                {focus === "load"
                  ? "Opened from load indicators in reports."
                  : focus === "visits"
                    ? "Opened from visit analysis or notifications."
                    : "A direct center filter is active."}
              </p>
            </div>
            <button className="ghost-button" type="button" onClick={() => setSearchParams({})}>
              Show all centers
            </button>
          </div>
        ) : null}

        <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
          <input
            className="toolbar-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search center code, name, city, type, phone, email, or specialty"
          />
        </form>

        {visibleCenters.length === 0 ? (
          <div className="empty-state compact">No center matches the current filters.</div>
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
                    <span>{center.availableDoctors}/{center.totalDoctors} doctors available</span>
                    <span>Load {center.currentLoad}</span>
                    <span>Wait {center.averageWaitTime} min</span>
                  </div>
                  <p className="muted">{center.specialties.join(", ") || "No specialties recorded."}</p>
                  {center.suspensionReason ? <div className="inline-note">{center.suspensionReason}</div> : null}
                  <div className="button-row">
                    <button className="ghost-button" type="button" onClick={() => editCenter(center)}>
                      Edit
                    </button>
                    <button className="ghost-button" type="button" onClick={() => void toggleConnection(center)}>
                      {center.isConnected ? "Suspend" : "Reactivate"}
                    </button>
                    <button className="ghost-button" type="button" onClick={() => void deleteCenter(center)}>
                      Delete
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
