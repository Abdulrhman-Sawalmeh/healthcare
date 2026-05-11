import { FormEvent, useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/arabic";
import { PharmacyItem } from "../types";

const defaultForm = {
  medicineName: "",
  batchNumber: "",
  quantity: "",
  unit: "",
  expiryDate: "",
  sellingPrice: "",
  reorderLevel: ""
};

export function PharmacyPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PharmacyItem[]>([]);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm);

  const canManage = user?.role === "CENTER_MANAGER" || user?.role === "PHARMACIST";

  async function loadItems() {
    const payload = await apiRequest<PharmacyItem[]>("/center/pharmacy");
    setItems(payload);
  }

  useEffect(() => {
    loadItems()
      .then(() => setError(""))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  function resetForm() {
    setForm(defaultForm);
    setEditingItemId(null);
  }

  function startEditing(item: PharmacyItem) {
    setEditingItemId(item.id);
    setForm({
      medicineName: item.medicineName,
      batchNumber: item.batchNumber,
      quantity: String(item.quantity),
      unit: item.unit,
      expiryDate: item.expiryDate.slice(0, 10),
      sellingPrice: String(item.sellingPrice),
      reorderLevel: String(item.reorderLevel)
    });
    setError("");
    setSuccessMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = editingItemId ? `/center/pharmacy/${editingItemId}` : "/center/pharmacy";
    const method = editingItemId ? "PUT" : "POST";

    try {
      setSubmitting(true);
      await apiRequest(path, {
        method,
        body: JSON.stringify({
          medicineName: form.medicineName,
          batchNumber: form.batchNumber,
          quantity: Number(form.quantity),
          unit: form.unit,
          expiryDate: form.expiryDate,
          sellingPrice: Number(form.sellingPrice),
          reorderLevel: Number(form.reorderLevel)
        })
      });

      resetForm();
      await loadItems();
      setError("");
      setSuccessMessage(editingItemId ? "تم تحديث الصنف الدوائي." : "تمت إضافة الصنف الدوائي.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ الصنف الدوائي.");
      setSuccessMessage("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(itemId: number) {
    if (!window.confirm("هل تريد حذف هذا الصنف الدوائي من مخزون المركز؟")) {
      return;
    }

    try {
      setDeletingItemId(itemId);
      await apiRequest(`/center/pharmacy/${itemId}`, {
        method: "DELETE"
      });
      if (editingItemId === itemId) {
        resetForm();
      }
      await loadItems();
      setError("");
      setSuccessMessage("تم حذف الصنف الدوائي.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف الصنف الدوائي.");
      setSuccessMessage("");
    } finally {
      setDeletingItemId(null);
    }
  }

  return (
    <div className="page-stack">
      {error ? <div className="error-banner">{error}</div> : null}
      {successMessage ? <div className="empty-state compact">{successMessage}</div> : null}

      {canManage ? (
        <SectionCard
          title={editingItemId ? "تعديل صنف دوائي" : "إضافة صنف دوائي"}
          subtitle="إدارة المخزون المحلي للأدوية مع الكمية وسعر البيع وحد إعادة الطلب."
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>اسم الدواء</span>
              <input
                value={form.medicineName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, medicineName: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>الوحدة</span>
              <input
                value={form.unit}
                onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
                placeholder="علبة"
                required
              />
            </label>
            <label className="field">
              <span>رقم التشغيلة</span>
              <input
                value={form.batchNumber}
                onChange={(event) =>
                  setForm((current) => ({ ...current, batchNumber: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>الكمية</span>
              <input
                min="0"
                type="number"
                value={form.quantity}
                onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>تاريخ الانتهاء</span>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, expiryDate: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>سعر البيع</span>
              <input
                min="0"
                step="0.01"
                type="number"
                value={form.sellingPrice}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sellingPrice: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>حد إعادة الطلب</span>
              <input
                min="0"
                type="number"
                value={form.reorderLevel}
                onChange={(event) =>
                  setForm((current) => ({ ...current, reorderLevel: event.target.value }))
                }
                required
              />
            </label>

            <div className="field-span-2 button-row">
              <button className="primary-button" disabled={submitting} type="submit">
                {submitting ? "جارٍ الحفظ..." : editingItemId ? "حفظ التعديلات" : "إضافة الصنف"}
              </button>
              {editingItemId ? (
                <button className="ghost-button" onClick={resetForm} type="button">
                  إلغاء التعديل
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title="مخزون الصيدلية"
        subtitle="واجهة مخصصة لإدارة المخزون الدوائي ومتابعة الأصناف منخفضة الكمية."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>الدواء</th>
                <th>رقم التشغيلة</th>
                <th>الكمية</th>
                <th>تاريخ الانتهاء</th>
                <th>السعر</th>
                <th>حالة المخزون</th>
                {canManage ? <th>الإجراءات</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.medicineName}</strong>
                    <span>{item.unit}</span>
                  </td>
                  <td>{item.batchNumber}</td>
                  <td>
                    <strong>{item.quantity}</strong>
                    <span>إعادة الطلب عند {item.reorderLevel}</span>
                  </td>
                  <td>{formatDate(item.expiryDate)}</td>
                  <td>{item.sellingPrice.toFixed(2)}</td>
                  <td>
                    <StatusBadge status={item.isLowStock ? "warning" : "available"} />
                  </td>
                  {canManage ? (
                    <td>
                      <div className="table-actions">
                        <button className="ghost-button" onClick={() => startEditing(item)} type="button">
                          تعديل
                        </button>
                        <button
                          className="danger-button"
                          disabled={deletingItemId === item.id}
                          onClick={() => handleDelete(item.id)}
                          type="button"
                        >
                          {deletingItemId === item.id ? "جارٍ الحذف..." : "حذف"}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
