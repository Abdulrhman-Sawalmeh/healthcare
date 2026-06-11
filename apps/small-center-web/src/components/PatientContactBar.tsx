type PatientContactBarProps = {
  centerName?: string | null;
  phone?: string | null;
};

function normalizeTel(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

export function PatientContactBar({ centerName, phone }: PatientContactBarProps) {
  const cleanPhone = phone?.trim();

  if (!cleanPhone) {
    return null;
  }

  const telHref = `tel:${normalizeTel(cleanPhone)}`;

  return (
    <section className="patient-contact-bar" aria-label="Contact center">
      <div className="patient-contact-label">
        <span>Contact Us</span>
        <span className="patient-contact-search" aria-hidden="true">
          &#128269;
        </span>
      </div>
      <a className="patient-contact-phone" href={telHref}>
        <span aria-hidden="true">&#9742;</span>
        <strong>{cleanPhone}</strong>
      </a>
      <a className="patient-contact-action" href={telHref}>
        اتصل بالمركز
        {centerName ? <small>{centerName}</small> : null}
      </a>
    </section>
  );
}
