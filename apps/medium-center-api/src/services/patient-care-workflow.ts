import { FollowUpReminderStatus, MedicationRefillStatus, Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";

export const activeRefillStatuses: MedicationRefillStatus[] = [
  "REQUESTED",
  "DOCTOR_APPROVED",
  "PHARMACY_PREPARING",
  "READY_FOR_PICKUP"
];

export const refillRequestInclude = {
  patient: {
    select: {
      id: true,
      fullName: true,
      unifiedId: true,
      phone: true
    }
  },
  prescription: {
    include: {
      visit: {
        include: {
          doctor: {
            select: {
              id: true,
              fullName: true
            }
          }
        }
      }
    }
  },
  doctor: {
    select: {
      id: true,
      fullName: true
    }
  },
  pharmacyUser: {
    select: {
      id: true,
      fullName: true
    }
  }
} satisfies Prisma.MedicationRefillRequestInclude;

export const followUpReminderInclude = {
  patient: {
    select: {
      id: true,
      fullName: true,
      unifiedId: true,
      phone: true
    }
  },
  doctor: {
    select: {
      id: true,
      fullName: true
    }
  },
  visit: {
    select: {
      id: true,
      visitDate: true,
      visitType: true,
      diagnosis: true
    }
  }
} satisfies Prisma.FollowUpReminderInclude;

export type MedicationRefillRequestWithDetails = Prisma.MedicationRefillRequestGetPayload<{
  include: typeof refillRequestInclude;
}>;

export type FollowUpReminderWithDetails = Prisma.FollowUpReminderGetPayload<{
  include: typeof followUpReminderInclude;
}>;

type EligiblePrescriptionWithDetails = Prisma.LocalPrescriptionGetPayload<{
  include: {
    visit: {
      include: {
        doctor: {
          select: {
            id: true;
            fullName: true;
          };
        };
      };
    };
    refillRequests: {
      orderBy: {
        createdAt: "desc";
      };
      take: 1;
    };
  };
}>;

function normalizeIdentifier(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\s+/g, "") : null;
}

export function isActiveRefillStatus(status: MedicationRefillStatus | string) {
  return activeRefillStatuses.includes(status as MedicationRefillStatus);
}

export function mapMedicationRefillRequest(request: MedicationRefillRequestWithDetails) {
  const prescription = request.prescription;
  const visit = prescription.visit;

  return {
    id: request.id,
    centerId: request.centerId,
    patientId: request.patientId,
    patientName: request.patient.fullName,
    patientUnifiedId: request.patient.unifiedId,
    prescriptionId: request.prescriptionId,
    medicineName: prescription.medicineName,
    dosage: prescription.dosage,
    quantity: prescription.quantity,
    duration: prescription.duration,
    instructions: prescription.instructions,
    visitId: visit.id,
    visitDate: visit.visitDate,
    doctorId: request.doctorId ?? visit.doctorId,
    doctorName: request.doctor?.fullName ?? visit.doctor?.fullName ?? null,
    pharmacyUserId: request.pharmacyUserId,
    pharmacyUserName: request.pharmacyUser?.fullName ?? null,
    requestedAt: request.requestedAt,
    status: request.status,
    rejectionReason: request.rejectionReason,
    notes: request.notes,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
  };
}

export function mapEligiblePrescription(prescription: EligiblePrescriptionWithDetails) {
  const latestRefillRequest = prescription.refillRequests[0] ?? null;
  const safeStatusMessage: Record<string, string> = {
    NEW: "تم استلام الوصفة في الصيدلية.",
    UNDER_REVIEW: "الوصفة قيد المراجعة في الصيدلية.",
    PREPARING: "يجري تجهيز الوصفة.",
    READY_FOR_PICKUP: "الوصفة جاهزة للاستلام من صيدلية المركز.",
    DISPENSED: "تم صرف الوصفة.",
    UNAVAILABLE: "بعض الأدوية غير متوفرة حالياً، وسيتم تحديث الحالة لاحقاً.",
    NEEDS_DOCTOR_REVIEW: "الوصفة تحتاج مراجعة من الطبيب بسبب توفر الدواء.",
    CANCELLED: "تم إلغاء الوصفة من الطبيب."
  };

  return {
    id: prescription.id,
    visitId: prescription.visitId,
    medicineName: prescription.medicineName,
    dosage: prescription.dosage,
    quantity: prescription.quantity,
    duration: prescription.duration,
    instructions: prescription.instructions,
    issuedAt: prescription.issuedAt,
    dispensed: prescription.dispensed,
    pharmacyStatus: prescription.pharmacyStatus,
    pharmacyUpdatedAt: prescription.pharmacyUpdatedAt,
    readyForPickupAt: prescription.readyForPickupAt,
    dispensedAt: prescription.dispensedAt,
    safeStatusMessage:
      safeStatusMessage[prescription.pharmacyStatus] ?? "يجري تحديث حالة الوصفة.",
    doctorId: prescription.visit.doctorId,
    doctorName: prescription.visit.doctor?.fullName ?? null,
    visitDate: prescription.visit.visitDate,
    latestRefillStatus: latestRefillRequest?.status ?? null
  };
}

export function mapFollowUpReminder(reminder: FollowUpReminderWithDetails) {
  return {
    id: reminder.id,
    centerId: reminder.centerId,
    patientId: reminder.patientId,
    patientName: reminder.patient.fullName,
    patientUnifiedId: reminder.patient.unifiedId,
    doctorId: reminder.doctorId,
    doctorName: reminder.doctor.fullName,
    visitId: reminder.visitId,
    visitSummary: reminder.visit?.diagnosis ?? null,
    visitDate: reminder.visit?.visitDate ?? null,
    dueDate: reminder.dueDate,
    reason: reminder.reason,
    status: reminder.status,
    notes: reminder.notes,
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt,
    completedAt: reminder.completedAt,
    cancelledAt: reminder.cancelledAt
  };
}

export async function resolvePortalLocalPatient(patientProfileId: string) {
  const patient = await prisma.patientProfile.findUnique({
    where: { id: patientProfileId },
    include: {
      user: true,
      center: true
    }
  });

  if (!patient) {
    return null;
  }

  const centralCenter = await prisma.centralCenter.findUnique({
    where: {
      centerCode: patient.center.code
    },
    select: {
      id: true
    }
  });

  if (!centralCenter) {
    return {
      patient,
      centerId: null,
      localPatient: null
    };
  }

  const emailIdentifier = normalizeIdentifier(patient.user.email.split("@")[0]);

  const localPatient = await prisma.localPatient.findFirst({
    where: {
      centerId: centralCenter.id,
      OR: [
        ...(patient.user.phone ? [{ phone: patient.user.phone }] : []),
        ...(emailIdentifier
          ? [
              {
                unifiedPatient: {
                  nationalId: emailIdentifier
                }
              }
            ]
          : []),
        {
          fullName: patient.user.fullName
        }
      ]
    }
  });

  return {
    patient,
    centerId: centralCenter.id,
    localPatient
  };
}

export async function getPortalMedicationRefillBundle(patientProfileId: string) {
  const scope = await resolvePortalLocalPatient(patientProfileId);

  if (!scope?.centerId || !scope.localPatient) {
    return {
      requests: [],
      prescriptions: [],
      eligiblePrescriptions: []
    };
  }

  const [requests, prescriptions] = await Promise.all([
    prisma.medicationRefillRequest.findMany({
      where: {
        centerId: scope.centerId,
        patientId: scope.localPatient.id
      },
      include: refillRequestInclude,
      orderBy: {
        requestedAt: "desc"
      }
    }),
    prisma.localPrescription.findMany({
      where: {
        visit: {
          centerId: scope.centerId,
          patientId: scope.localPatient.id
        }
      },
      include: {
        visit: {
          include: {
            doctor: {
              select: {
                id: true,
                fullName: true
              }
            }
          }
        },
        refillRequests: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      },
      orderBy: {
        issuedAt: "desc"
      },
      take: 50
    })
  ]);

  const activePrescriptionIds = new Set(
    requests.filter((request) => isActiveRefillStatus(request.status)).map((request) => request.prescriptionId)
  );

  return {
    requests: requests.map(mapMedicationRefillRequest),
    prescriptions: prescriptions.map(mapEligiblePrescription),
    eligiblePrescriptions: prescriptions
      .filter((prescription) => !activePrescriptionIds.has(prescription.id))
      .map(mapEligiblePrescription)
  };
}

export async function getPortalFollowUpReminders(patientProfileId: string) {
  const scope = await resolvePortalLocalPatient(patientProfileId);

  if (!scope?.centerId || !scope.localPatient) {
    return [];
  }

  const reminders = await prisma.followUpReminder.findMany({
    where: {
      centerId: scope.centerId,
      patientId: scope.localPatient.id
    },
    include: followUpReminderInclude,
    orderBy: [
      {
        dueDate: "asc"
      },
      {
        createdAt: "desc"
      }
    ]
  });

  return reminders.map(mapFollowUpReminder);
}

export function normalizeReminderStatus(status: FollowUpReminderStatus, dueDate: Date) {
  if (status === "PENDING" && dueDate.getTime() < Date.now()) {
    return "MISSED";
  }

  return status;
}
