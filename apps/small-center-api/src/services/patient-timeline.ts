import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";
import { getPatientPortalAccount } from "./patient-accounts";

type TimelineEventType =
  | "appointment"
  | "diagnosis"
  | "prescription"
  | "lab_result"
  | "referral"
  | "note";

type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  title: string;
  description: string;
  date: string;
  createdBy: string;
  sourceTable: string;
};

type TimelineCenter = {
  centerId: number;
  centerCode: string;
  centerName: string;
};

const visitTypeLabels: Record<string, string> = {
  CONSULTATION: "استشارة",
  FOLLOW_UP: "متابعة",
  EMERGENCY: "طوارئ",
  LAB: "مختبر"
};

const referralStatusLabels: Record<string, string> = {
  PENDING: "قيد المراجعة",
  ACCEPTED: "مقبولة",
  REJECTED: "مرفوضة",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة"
};

const labStatusLabels: Record<string, string> = {
  PENDING: "قيد الانتظار",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة"
};

function joinParts(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" • ");
}

function uniqueCenters(centers: TimelineCenter[]) {
  return centers.filter(
    (center, index, items) => items.findIndex((entry) => entry.centerId === center.centerId) === index
  );
}

function sortEvents(events: TimelineEvent[]) {
  return [...events].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

function visitLabel(visitType: string) {
  return visitTypeLabels[visitType] ?? visitType;
}

function referralStatusLabel(status: string) {
  return referralStatusLabels[status] ?? status;
}

function labStatusLabel(status: string) {
  return labStatusLabels[status] ?? status;
}

export async function getPatientTimelineForCenter(centerId: number, patientId: number) {
  const patient = await prisma.localPatient.findFirst({
    where: {
      id: patientId,
      centerId
    },
    include: {
      center: true,
      unifiedPatient: {
        include: {
          localPatients: {
            include: {
              center: true
            }
          }
        }
      },
      visits: {
        include: {
          center: true,
          doctor: true,
          prescriptions: true
        },
        orderBy: {
          visitDate: "desc"
        }
      },
      labRequests: {
        include: {
          center: true,
          doctor: true,
          test: true
        },
        orderBy: {
          requestDate: "desc"
        }
      }
    }
  });

  if (!patient) {
    throw new AppError("لم يتم العثور على ملف المريض المطلوب داخل هذا المركز.", 404);
  }

  const referrals = patient.unifiedPatientId
    ? await prisma.centralReferral.findMany({
        where: {
          patientId: patient.unifiedPatientId
        },
        include: {
          fromCenter: true,
          toCenter: true
        },
        orderBy: {
          requestedAt: "desc"
        }
      })
    : [];
  const portalAccount = await getPatientPortalAccount({
    centerCode: patient.center.centerCode,
    nationalId: patient.unifiedPatient?.nationalId,
    primaryPhone: patient.phone
  });

  const visitEvents = patient.visits.flatMap<TimelineEvent>((visit) => {
    const actor = visit.doctor?.fullName ?? visit.center.centerName;
    const visitDate = visit.visitDate.toISOString();
    const visitDetails = joinParts([
      `النوع: ${visitLabel(visit.visitType)}`,
      `المركز: ${visit.center.centerName}`,
      visit.visitTime ? `الوقت: ${visit.visitTime}` : null,
      visit.symptoms ? `الأعراض: ${visit.symptoms}` : null
    ]);

    return [
      {
        id: `appointment-${visit.id}`,
        type: "appointment",
        title: `موعد ${visitLabel(visit.visitType)}`,
        description: visitDetails,
        date: visitDate,
        createdBy: actor,
        sourceTable: "LocalVisit"
      },
      {
        id: `diagnosis-${visit.id}`,
        type: "diagnosis",
        title: `تشخيص: ${visit.diagnosis}`,
        description:
          joinParts([
            `الموعد: ${visitLabel(visit.visitType)}`,
            visit.bloodPressure ? `الضغط: ${visit.bloodPressure}` : null,
            visit.temperature ? `الحرارة: ${visit.temperature}` : null,
            visit.heartRate ? `النبض: ${visit.heartRate}` : null
          ]) || "تم تسجيل تشخيص سريري جديد.",
        date: visitDate,
        createdBy: actor,
        sourceTable: "LocalVisit"
      },
      ...(visit.notes
        ? [
            {
              id: `note-visit-${visit.id}`,
              type: "note" as const,
              title: "ملاحظة سريرية",
              description: visit.notes,
              date: visitDate,
              createdBy: actor,
              sourceTable: "LocalVisit"
            }
          ]
        : [])
    ];
  });

  const prescriptionEvents = patient.visits.flatMap<TimelineEvent>((visit) =>
    visit.prescriptions.map((prescription) => ({
      id: `prescription-${prescription.id}`,
      type: "prescription",
      title: `وصفة دوائية: ${prescription.medicineName}`,
      description:
        joinParts([
          `الجرعة: ${prescription.dosage}`,
          `المدة: ${prescription.duration}`,
          prescription.instructions ? `التعليمات: ${prescription.instructions}` : null
        ]) || "تمت إضافة وصفة دوائية.",
      date: visit.visitDate.toISOString(),
      createdBy: visit.doctor?.fullName ?? visit.center.centerName,
      sourceTable: "LocalPrescription"
    }))
  );

  const labEvents = patient.labRequests
    .filter((request) => request.resultValue || request.resultDate || request.status === "COMPLETED")
    .map<TimelineEvent>((request) => ({
      id: `lab-${request.id}`,
      type: "lab_result",
      title: `نتيجة فحص ${request.test.testName}`,
      description:
        joinParts([
          `الحالة: ${labStatusLabel(request.status)}`,
          request.resultValue ? `النتيجة: ${request.resultValue}` : null,
          `القسم: ${request.test.category}`
        ]) || "تم تحديث نتيجة فحص مخبري.",
      date: (request.resultDate ?? request.requestDate).toISOString(),
      createdBy: request.doctor.fullName,
      sourceTable: "LabRequestLocal"
    }));

  const referralEvents = referrals.flatMap<TimelineEvent>((referral) => {
    const targetCenter = referral.toCenter?.centerName ?? "بانتظار التوجيه";
    const requestedAt = referral.requestedAt.toISOString();

    return [
      {
        id: `referral-${referral.id}`,
        type: "referral",
        title: `إحالة إلى ${referral.requiredSpecialty}`,
        description:
          joinParts([
            `من ${referral.fromCenter.centerName}`,
            `إلى ${targetCenter}`,
            `الحالة: ${referralStatusLabel(referral.status)}`,
            referral.reason
          ]) || "تم إنشاء إحالة جديدة للمريض.",
        date: requestedAt,
        createdBy: referral.fromCenter.centerName,
        sourceTable: "CentralReferral"
      },
      ...(referral.notesFromSender
        ? [
            {
              id: `note-referral-sender-${referral.id}`,
              type: "note" as const,
              title: "ملاحظات جهة الإحالة",
              description: referral.notesFromSender,
              date: requestedAt,
              createdBy: referral.fromCenter.centerName,
              sourceTable: "CentralReferral"
            }
          ]
        : []),
      ...(referral.notesFromReceiver
        ? [
            {
              id: `note-referral-receiver-${referral.id}`,
              type: "note" as const,
              title: "ملاحظات الجهة المستقبلة",
              description: referral.notesFromReceiver,
              date: (referral.respondedAt ?? referral.requestedAt).toISOString(),
              createdBy: referral.toCenter?.centerName ?? targetCenter,
              sourceTable: "CentralReferral"
            }
          ]
        : [])
    ];
  });

  const events = sortEvents([...visitEvents, ...prescriptionEvents, ...labEvents, ...referralEvents]);
  const centersSeenAt = uniqueCenters(
    patient.unifiedPatient?.localPatients.length
      ? patient.unifiedPatient.localPatients.map((entry) => ({
          centerId: entry.center.id,
          centerCode: entry.center.centerCode,
          centerName: entry.center.centerName
        }))
      : [
          {
            centerId: patient.center.id,
            centerCode: patient.center.centerCode,
            centerName: patient.center.centerName
          }
        ]
  );

  return {
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      unifiedId: patient.unifiedId,
      nationalId: patient.unifiedPatient?.nationalId ?? null,
      email: portalAccount?.email ?? null,
      phone: patient.phone,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth,
      address: patient.address,
      bloodType: patient.bloodType,
      emergencyContact: patient.emergencyContact,
      allergies: patient.allergies,
      chronicDiseases: patient.chronicDiseases,
      centersSeenAt,
      visitCount: patient.visits.length,
      labResultsCount: labEvents.length,
      referralCount: referrals.length,
      timelineCount: events.length,
      lastEventAt: events[0]?.date ?? null
    },
    events
  };
}
