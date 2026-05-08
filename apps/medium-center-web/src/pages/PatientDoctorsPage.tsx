import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { PortalDoctorRecord } from "../types";

export function PatientDoctorsPage() {
  const [doctors, setDoctors] = useState<PortalDoctorRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<PortalDoctorRecord[]>("/portal/doctors")
      .then(setDoctors)
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="screen-center">جارٍ تحميل قائمة الأطباء...</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">قائمة الأطباء</p>
          <h1>اختيار الطبيب المناسب</h1>
          <p className="muted">يمكنك مراجعة تخصص كل طبيب ثم الانتقال مباشرة إلى الحجز أو المحادثة.</p>
        </div>
      </section>

      <section className="card-grid">
        {doctors.map((doctor) => (
          <article className="profile-tile" key={doctor.id}>
            <p className="eyebrow">{doctor.department.name}</p>
            <h3>{doctor.fullName}</h3>
            <p>{doctor.specialization}</p>
            <div className="tile-stats">
              <span>{doctor.yearsExperience} سنوات خبرة</span>
              <span>{doctor.phone ?? "لا يوجد هاتف مباشر"}</span>
            </div>
            <div className="chip-row">
              <Link className="primary-button" to="/appointments">
                حجز موعد
              </Link>
              <Link className="ghost-button" to="/messages">
                بدء محادثة
              </Link>
            </div>
          </article>
        ))}
        {doctors.length === 0 ? <div className="empty-state">لا يوجد أطباء ظاهرون في هذا المركز.</div> : null}
      </section>
    </div>
  );
}
