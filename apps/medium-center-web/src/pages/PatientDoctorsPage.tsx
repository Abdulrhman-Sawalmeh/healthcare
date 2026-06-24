import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { requestAppointmentSuggestions } from "../api/appointment-suggestions";
import { ApiError, apiRequest } from "../api/client";
import { formatDateTime } from "../lib/arabic";
import { PortalAppointmentSuggestionRecord, PortalDoctorRecord } from "../types";

function buildAppointmentLink(doctorId: string, scheduledAt?: string) {
  const searchParams = new URLSearchParams({ doctorId });

  if (scheduledAt) {
    searchParams.set("scheduledAt", scheduledAt);
  }

  return `/appointments?${searchParams.toString()}`;
}

function isSameDay(dateValue: string) {
  const candidate = new Date(dateValue);
  const now = new Date();

  return (
    candidate.getFullYear() === now.getFullYear() &&
    candidate.getMonth() === now.getMonth() &&
    candidate.getDate() === now.getDate()
  );
}

export function PatientDoctorsPage() {
  const [doctors, setDoctors] = useState<PortalDoctorRecord[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [availableSlots, setAvailableSlots] = useState<PortalAppointmentSuggestionRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSpecialty, setActiveSpecialty] = useState("الكل");
  const [sortMode, setSortMode] = useState<"EXPERIENCE" | "NAME" | "SPECIALTY" | "TODAY" | "NEXT_SLOT">("EXPERIENCE");
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [error, setError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityInfo, setAvailabilityInfo] = useState("");
  const [pendingScrollTarget, setPendingScrollTarget] = useState<"profile" | "availability" | null>(null);
  const doctorSpotlightRef = useRef<HTMLElement | null>(null);
  const doctorAvailabilityRef = useRef<HTMLDivElement | null>(null);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    async function loadDoctors() {
      setLoading(true);
      setError("");

      try {
        const payload = await apiRequest<PortalDoctorRecord[]>("/portal/doctors");
        setDoctors(payload);
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : "تعذر تحميل قائمة الأطباء.");
      } finally {
        setLoading(false);
      }
    }

    void loadDoctors();
  }, []);

  const selectedDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === selectedDoctorId),
    [doctors, selectedDoctorId]
  );

  const specialtyFilters = useMemo(
    () => ["الكل", ...new Set(doctors.map((doctor) => doctor.specialization))],
    [doctors]
  );

  const filteredDoctors = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();

    const results = doctors.filter((doctor) => {
      const matchesSearch =
        query.length === 0 ||
        doctor.fullName.toLowerCase().includes(query) ||
        doctor.specialization.toLowerCase().includes(query) ||
        doctor.department.name.toLowerCase().includes(query);

      const matchesSpecialty = activeSpecialty === "الكل" || doctor.specialization === activeSpecialty;

      return matchesSearch && matchesSpecialty;
    });

    return results.sort((left, right) => {
      if (sortMode === "NAME") {
        return left.fullName.localeCompare(right.fullName, "ar");
      }

      if (sortMode === "SPECIALTY") {
        return left.specialization.localeCompare(right.specialization, "ar") || left.fullName.localeCompare(right.fullName, "ar");
      }

      if (sortMode === "TODAY" || sortMode === "NEXT_SLOT") {
        if (left.id === selectedDoctorId) return -1;
        if (right.id === selectedDoctorId) return 1;
        return right.yearsExperience - left.yearsExperience;
      }

      return right.yearsExperience - left.yearsExperience;
    });
  }, [doctors, deferredSearchQuery, activeSpecialty, sortMode, selectedDoctorId]);

  useEffect(() => {
    async function loadDoctorAvailability(doctor: PortalDoctorRecord) {
      setAvailabilityLoading(true);
      setAvailabilityError("");
      setAvailabilityInfo("");

      try {
        const payload = await requestAppointmentSuggestions({
          doctorId: doctor.id,
          preferredDate: new Date().toISOString(),
          appointmentType: "CLINIC",
          priority: "NORMAL"
        });

        setAvailableSlots(payload);

        if (payload.length === 0) {
          setAvailabilityInfo("لا توجد مواعيد متاحة قريبًا لهذا الطبيب حاليًا.");
        }
      } catch (cause) {
        setAvailableSlots([]);
        setAvailabilityError(
          cause instanceof ApiError ? cause.message : "تعذر تحميل المواعيد المتاحة لهذا الطبيب."
        );
      } finally {
        setAvailabilityLoading(false);
      }
    }

    if (!selectedDoctor) {
      setAvailabilityLoading(false);
      setAvailableSlots([]);
      setAvailabilityError("");
      setAvailabilityInfo("");
      return;
    }

    void loadDoctorAvailability(selectedDoctor);
  }, [selectedDoctor]);

  const nextAvailableSlot = availableSlots[0];
  const sameDaySlots = availableSlots.filter((slot) => isSameDay(slot.scheduledAt)).length;
  const uniqueDepartments = new Set(doctors.map((doctor) => doctor.department.id)).size;
  const featuredDoctor = selectedDoctor ?? filteredDoctors[0];

  function scrollToSection(target: HTMLElement | null) {
    window.setTimeout(() => {
      target?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 0);
  }

  function selectDoctor(doctorId: string, target: "profile" | "availability") {
    setSelectedDoctorId(doctorId);
    setPendingScrollTarget(target);
  }

  useEffect(() => {
    if (!pendingScrollTarget || !selectedDoctor) {
      return;
    }

    scrollToSection(
      pendingScrollTarget === "availability" ? doctorAvailabilityRef.current : doctorSpotlightRef.current
    );
    setPendingScrollTarget(null);
  }, [pendingScrollTarget, selectedDoctor]);

  if (loading) {
    return <div className="screen-center">جارٍ تحميل قائمة الأطباء...</div>;
  }

  return (
    <div className="page-stack doctor-directory-page">
      <section className="hero-strip booking-hero">
        <div className="booking-hero-content">
          <div>
            <p className="eyebrow">دليل أطباء المركز</p>
            <h1>اختر الطبيب بأسلوب بحث وحجز احترافي</h1>
            <p className="muted">
              مستوحى من تجارب الحجز العالمية: ابحث، صفِّ النتائج، افتح ملف الطبيب، ثم احجز من المواعيد المتاحة
              مباشرة.
            </p>
          </div>
        </div>

        <div className="booking-stat-grid">
          <article className="booking-stat-card">
            <span>إجمالي الأطباء</span>
            <strong>{doctors.length}</strong>
            <p>موجودون في المركز</p>
          </article>
          <article className="booking-stat-card">
            <span>التخصصات</span>
            <strong>{specialtyFilters.length - 1}</strong>
            <p>يمكن التصفية بينها</p>
          </article>
          <article className="booking-stat-card">
            <span>الأقسام</span>
            <strong>{uniqueDepartments}</strong>
            <p>ضمن شبكة الرعاية الحالية</p>
          </article>
          <article className="booking-stat-card">
            <span>مواعيد اليوم</span>
            <strong>{sameDaySlots}</strong>
            <p>{selectedDoctor ? "للطبيب المحدد" : "اختر طبيبًا لرؤيتها"}</p>
          </article>
        </div>
      </section>

      <section className="section-card directory-filter-card">
        <div className="directory-toolbar">
          <div className="field">
            <span>ابحث عن الطبيب أو التخصص</span>
            <input
              className="toolbar-input"
              type="search"
              value={searchQuery}
              placeholder="مثال: قلب، باطني، د. ليلى..."
              onChange={(event) => {
                setSearchQuery(event.target.value);
              }}
            />
          </div>

          <label className="field directory-sort-field">
            <span>ترتيب النتائج</span>
            <select
              value={sortMode}
              onChange={(event) => {
                setSortMode(event.target.value as "EXPERIENCE" | "NAME" | "SPECIALTY" | "TODAY" | "NEXT_SLOT");
              }}
            >
              <option value="EXPERIENCE">الأكثر خبرة</option>
              <option value="NAME">الاسم</option>
              <option value="NEXT_SLOT">أقرب موعد متاح</option>
              <option value="SPECIALTY">حسب التخصص</option>
              <option value="TODAY">حسب التوفر اليوم</option>
            </select>
          </label>
        </div>

        <div className="chip-row">
          {specialtyFilters.map((specialty) => (
            <button
              key={specialty}
              className={`timeline-filter ${activeSpecialty === specialty ? "active" : ""}`}
              type="button"
              onClick={() => {
                setActiveSpecialty(specialty);
              }}
            >
              {specialty}
            </button>
          ))}
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      {featuredDoctor ? (
        <section className="section-card featured-doctor-card">
          <div>
            <p className="eyebrow">الترشيح الحالي</p>
            <h3>{featuredDoctor.fullName}</h3>
            <p className="muted">{featuredDoctor.specialization}</p>
          </div>

          <div className="assistant-badges">
            <span className="assistant-badge">{featuredDoctor.department.name}</span>
            <span className="assistant-badge">{featuredDoctor.yearsExperience} سنوات خبرة</span>
            <span className="assistant-badge">
              {selectedDoctor ? "الطبيب المحدد" : "أفضل نتيجة ضمن الفلتر الحالي"}
            </span>
          </div>

          <p className="inline-note">
            {nextAvailableSlot
              ? `مناسب لأن أقرب وقت ظاهر هو ${formatDateTime(nextAvailableSlot.scheduledAt)}`
              : "مناسب لأنه يطابق التخصص والبحث الحالي."}
          </p>

          <div className="button-row">
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                selectDoctor(featuredDoctor.id, "availability");
              }}
            >
              عرض المواعيد المتاحة
            </button>
            <Link className="ghost-button" to={buildAppointmentLink(featuredDoctor.id)}>
              الانتقال للحجز
            </Link>
          </div>
        </section>
      ) : null}

      <section className="doctor-directory-layout">
        <div className="card-grid doctor-directory-grid">
          {filteredDoctors.map((doctor) => {
            const isSelected = selectedDoctorId === doctor.id;

            return (
              <article className={`profile-tile ${isSelected ? "is-selected" : ""}`} key={doctor.id}>
                <p className="eyebrow">{doctor.department.name}</p>
                <button
                  className="doctor-name-button"
                  type="button"
                  onClick={() => {
                    if (selectedDoctorId === doctor.id) {
                      setSelectedDoctorId("");
                      return;
                    }

                    selectDoctor(doctor.id, "profile");
                  }}
                >
                  {doctor.fullName}
                </button>
                <p>{doctor.specialization}</p>
                <div className="tile-stats">
                  <span>{doctor.yearsExperience} سنوات خبرة</span>
                  <span>{doctor.phone ?? "لا يوجد هاتف مباشر"}</span>
                </div>

                <div className="chip-row">
                  <Link className="primary-button" to={buildAppointmentLink(doctor.id)}>
                    حجز موعد
                  </Link>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      if (selectedDoctorId === doctor.id) {
                        setSelectedDoctorId("");
                        return;
                      }

                      selectDoctor(doctor.id, "profile");
                    }}
                  >
                    {isSelected ? "إخفاء الملف" : "عرض الملف"}
                  </button>
                </div>
              </article>
            );
          })}

          {filteredDoctors.length === 0 ? (
            <div className="empty-state">لا توجد نتائج مطابقة للبحث أو التصفية الحالية.</div>
          ) : null}
        </div>

        <aside className="section-card doctor-spotlight-panel" ref={doctorSpotlightRef}>
          {selectedDoctor ? (
            <>
              <div className="section-header">
                <div>
                  <p className="eyebrow">ملف الطبيب</p>
                  <h3>{selectedDoctor.fullName}</h3>
                  <p className="muted">{selectedDoctor.specialization}</p>
                </div>
                <span className="tag">{selectedDoctor.department.name}</span>
              </div>

              <div className="detail-grid">
                <div className="detail-field">
                  <span>القسم</span>
                  <strong>{selectedDoctor.department.name}</strong>
                </div>
                <div className="detail-field">
                  <span>سنوات الخبرة</span>
                  <strong>{selectedDoctor.yearsExperience} سنوات</strong>
                </div>
                <div className="detail-field">
                  <span>الهاتف</span>
                  <strong>{selectedDoctor.phone ?? "غير متوفر"}</strong>
                </div>
                <div className="detail-field">
                  <span>البريد الإلكتروني</span>
                  <strong>{selectedDoctor.email}</strong>
                </div>
              </div>

              <div className="doctor-spotlight-actions">
                <Link
                  className="primary-button"
                  to={buildAppointmentLink(selectedDoctor.id, nextAvailableSlot?.scheduledAt)}
                >
                  حجز أسرع موعد
                </Link>
                <Link className="ghost-button" to={buildAppointmentLink(selectedDoctor.id)}>
                  فتح نموذج الحجز
                </Link>
              </div>

              <div className="info-row" ref={doctorAvailabilityRef}>
                <div>
                  <strong>المواعيد المتاحة</strong>
                  <p className="muted">أقرب مواعيد قابلة للحجز الآن مع هذا الطبيب.</p>
                </div>
                {nextAvailableSlot ? <span className="tag">الأسرع {formatDateTime(nextAvailableSlot.scheduledAt)}</span> : null}
              </div>

              {availabilityLoading ? <div className="empty-state compact">جارٍ تحميل المواعيد المتاحة...</div> : null}
              {availabilityError ? <div className="error-banner">{availabilityError}</div> : null}
              {availabilityInfo ? <div className="inline-note">{availabilityInfo}</div> : null}

              {!availabilityLoading ? (
                <div className="stack-list compact">
                  {availableSlots.map((slot, index) => (
                    <article className="stack-item" key={`${slot.doctor.id}-${slot.scheduledAt}`}>
                      <div className="info-row">
                        <strong>{formatDateTime(slot.scheduledAt)}</strong>
                        {index === 0 ? <span className="tag">الأسرع</span> : null}
                      </div>
                      <div className="tile-stats">
                        <span>{slot.doctor.department.name}</span>
                        <span>{slot.doctor.specialization}</span>
                      </div>
                      <p className="muted">{slot.note}</p>
                      <Link className="ghost-button" to={buildAppointmentLink(slot.doctor.id, slot.scheduledAt)}>
                        حجز هذا الموعد
                      </Link>
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="doctor-spotlight-empty">
              <p className="eyebrow">الملف الذكي</p>
              <h3>اضغط على اسم الطبيب لعرض ملفه الكامل</h3>
              <p className="muted">
                ستظهر هنا معلومات الطبيب، التخصص، وسائل التواصل، والمواعيد المتاحة الجاهزة للحجز.
              </p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
