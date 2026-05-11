import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";

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

export async function getPatientTimelineForCentral(patientId: number) {
  const patient = await prisma.unifiedPatient.findUnique({
    where: {
      id: patientId
    },
    include: {
      localPatients: {
        include: {
          center: true
        }
      }
    }
  });

  if (!patient) {
    throw new AppError("لم يتم العثور على ملف المريض المطلوب في السجل الموحد.", 404);
  }

  const [visits, labRequests, referrals] = await Promise.all([
    prisma.localVisit.findMany({
      where: {
        patient: {
          is: {
            unifiedPatientId: patient.id
          }
        }
      },
      include: {
        center: true,
        doctor: true,
        prescriptions: true
      },
      orderBy: {
        visitDate: "desc"
      }
    }),
    prisma.labRequestLocal.findMany({
      where: {
        patient: {
          is: {
            unifiedPatientId: patient.id
          }
        }
      },
      include: {
        center: true,
        doctor: true,
        test: true
      },
      orderBy: {
        requestDate: "desc"
      }
    }),
    prisma.centralReferral.findMany({
      where: {
        patientId: patient.id
      },
      include: {
        fromCenter: true,
        toCenter: true
      },
      orderBy: {
        requestedAt: "desc"
      }
    })
  ]);

  const visitEvents = visits.flatMap<TimelineEvent>((visit) => {
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
            `المركز: ${visit.center.centerName}`,
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

  const prescriptionEvents = visits.flatMap<TimelineEvent>((visit) =>
    visit.prescriptions.map((prescription) => ({
      id: `prescription-${prescription.id}`,
      type: "prescription",
      title: `وصفة دوائية: ${prescription.medicineName}`,
      description:
        joinParts([
          `الجرعة: ${prescription.dosage}`,
          `المدة: ${prescription.duration}`,
          `المركز: ${visit.center.centerName}`,
          prescription.instructions ? `التعليمات: ${prescription.instructions}` : null
        ]) || "تمت إضافة وصفة دوائية.",
      date: visit.visitDate.toISOString(),
      createdBy: visit.doctor?.fullName ?? visit.center.centerName,
      sourceTable: "LocalPrescription"
    }))
  );

  const labEvents = labRequests
    .filter((request) => request.resultValue || request.resultDate || request.status === "COMPLETED")
    .map<TimelineEvent>((request) => ({
      id: `lab-${request.id}`,
      type: "lab_result",
      title: `نتيجة فحص ${request.test.testName}`,
      description:
        joinParts([
          `الحالة: ${labStatusLabel(request.status)}`,
          `المركز: ${request.center.centerName}`,
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
    patient.localPatients.map((entry) => ({
      centerId: entry.center.id,
      centerCode: entry.center.centerCode,
      centerName: entry.center.centerName
    }))
  );

  return {
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      unifiedId: patient.unifiedId,
      nationalId: patient.nationalId,
      phone: patient.primaryPhone,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth,
      address: patient.address,
      bloodType: patient.bloodType,
      emergencyContact: patient.localPatients[0]?.emergencyContact ?? null,
      allergies: patient.allergies,
      chronicDiseases: patient.chronicDiseases,
      centersSeenAt,
      visitCount: visits.length,
      labResultsCount: labEvents.length,
      referralCount: referrals.length,
      timelineCount: events.length,
      lastEventAt: events[0]?.date ?? null
    },
    events
  };
}
