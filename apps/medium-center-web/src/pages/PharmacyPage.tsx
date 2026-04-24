import { useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate } from "../lib/arabic";
import { PharmacyItem } from "../types";

export function PharmacyPage() {
  const [items, setItems] = useState<PharmacyItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<PharmacyItem[]>("/center/pharmacy")
      .then((payload) => {
        setItems(payload);
        setError("");
      })
      .catch((cause: Error) => setError(cause.message));
  }, []);

  return (
    <div className="page-stack">
      <SectionCard
        title="مخزون الصيدلية"
        subtitle="واجهة مخصصة لإدارة المخزون الدوائي ومتابعة الأصناف منخفضة الكمية."
      >
        {error ? <div className="error-banner">{error}</div> : null}
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>الدواء</th>
                <th>رقم التشغيلة</th>
                <th>الكمية</th>
                <th>تاريخ الانتهاء</th>
                <th>حالة المخزون</th>
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
                  <td>
                    <StatusBadge status={item.isLowStock ? "warning" : "available"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
