import { AppointmentStatus, SubscriptionStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { recordAuditLog } from "../services/audit-log";
import { notifyRole } from "../services/internal-notifications";
import {
  expireStalePatientConsents,
  mapPatientConsent,
  resolveConsentTargetLabel
} from "../services/patient-access-control";
import {
  activeRefillStatuses,
  getPortalFollowUpReminders,
  getPortalMedicationRefillBundle,
  mapMedicationRefillRequest,
  refillRequestInclude,
  resolvePortalLocalPatient
} from "../services/patient-care-workflow";
import { asyncHandler } from "../utils/async-handler";
import {
  mapAppointment,
  mapDoctor,
  mapPatient,
  mapReferral,
  mapSubscription,
  mapThread
} from "../utils/serializers";
import { requireProfileId } from "../utils/scope";
import { appointmentsRouter } from "./appointments";
import { centersRouter } from "./centers";
import { communicationsRouter } from "./communications";
import { doctorsRouter } from "./doctors";
import { notificationsRouter } from "./notifications";
import { patientsRouter } from "./patients";
import { referralsRouter } from "./referrals";
import { subscriptionsRouter } from "./subscriptions";

const router = Router();

const consentScopeSchema = z.enum([
  "BASIC_INFO",
  "VISITS",
  "LAB_RESULTS",
  "PRESCRIPTIONS",
  "FULL_SUMMARY"
]);

const consentSchema = z.object({
  targetType: z.enum(["DOCTOR", "CENTER"]),
  targetId: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
  scope: consentScopeSchema,
  expiresAt: z.coerce.date()
});

const appointmentInclude = {
  center: true,
  department: true,
  patient: {
    include: {
      user: true
    }
  },
  doctor: {
    include: {
      user: true,
      department: true
    }
  }
} as const;

const referralInclude = {
  fromCenter: true,
  toCenter: true,
  patient: {
    include: {
      user: true
    }
  },
  fromDoctor: {
    include: {
      user: true
    }
  },
  toDoctor: {
    include: {
      user: true
    }
  },
  department: true
} as const;

const subscriptionInclude = {
  center: true,
  plan: true,
  patient: {
    include: {
      user: true
    }
  },
  payments: {
    orderBy: {
      createdAt: "desc"
    }
  }
} as const;

const threadInclude = {
  patient: {
    include: {
      user: true
    }
  },
  doctor: {
    include: {
      user: true,
      department: true
    }
  },
  messages: {
    include: {
      sender: true
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} as const;

const localResultReportInclude = {
  center: true,
  author: {
    include: {
      doctorProfile: true
    }
  },
  labRequest: {
    include: {
      test: true
    }
  }
} as const;

const medicationRefillRequestSchema = z.object({
  prescriptionId: z.coerce.number().int().positive(),
  notes: z.string().trim().max(500).optional()
});

function mapAppointmentAsClinicalReport(
  appointment: Parameters<typeof mapAppointment>[0]
) {
  const mapped = mapAppointment(appointment);

  return {
    ...mapped,
    source: "APPOINTMENT",
    summary: appointment.notes ?? null,
    reportUrl: null,
    findings: null,
    recommendations: null,
    recommendedFollowUp: null,
    attachment: null
  };
}

function mapLocalResultReport(
  report: {
    id: number;
    title: string;
    category: string;
    summary: string;
    reportUrl: string | null;
    findings: string | null;
    recommendations: string | null;
    recommendedFollowUp: string | null;
    createdAt: Date;
    authorId: number;
    attachmentFileName: string | null;
    attachmentMimeType: string | null;
    attachmentBase64: string | null;
    center: {
      id: number;
      centerName: string;
    };
    author: {
      fullName: string;
      doctorProfile: {
        specialization: string;
      } | null;
    };
    labRequest?: {
      id: number;
      status: string;
      priority?: string | null;
      requestDate: Date;
      resultDate: Date | null;
      resultValue: string | null;
      resultNotes: string | null;
      unit: string | null;
      normalRange: string | null;
      abnormalFlag: string | null;
      reportUrl: string | null;
      imageUrl: string | null;
      patientNotes: string | null;
      test: {
        testName: string;
        category: string;
      };
    } | null;
  },
  patient: {
    id: string;
    fullName: string;
    medicalRecordNumber: string;
  },
  includeAttachmentData: boolean
) {
  return {
    id: `local-report-${report.id}`,
    status: "AVAILABLE",
    type: report.category,
    scheduledAt: report.createdAt,
    reason: report.title,
    notes: report.summary,
    source: "RESULT_REPORT",
    summary: report.summary,
    reportUrl: report.reportUrl,
    findings: report.findings,
    recommendations: report.recommendations,
    recommendedFollowUp: report.recommendedFollowUp,
    center: {
      id: String(report.center.id),
      name: report.center.centerName
    },
    department: {
      id: `specialty-${report.authorId}`,
      name: report.author.doctorProfile?.specialization ?? "التقرير الطبي"
    },
    patient,
    doctor: {
      id: String(report.authorId),
      fullName: report.author.fullName,
      specialization: report.author.doctorProfile?.specialization ?? "طبيب معالج"
    },
    attachment:
      report.attachmentFileName && report.attachmentMimeType
        ? {
            fileName: report.attachmentFileName,
            mimeType: report.attachmentMimeType,
            contentBase64: includeAttachmentData ? report.attachmentBase64 : null
          }
        : null,
    labRequest: report.labRequest
      ? {
          id: report.labRequest.id,
          status: report.labRequest.status,
          priority: report.labRequest.priority ?? null,
          requestedAt: report.labRequest.requestDate,
          resultedAt: report.labRequest.resultDate,
          resultValue: report.labRequest.resultValue,
          resultNotes: report.labRequest.resultNotes,
          unit: report.labRequest.unit,
          normalRange: report.labRequest.normalRange,
          abnormalFlag: report.labRequest.abnormalFlag,
          reportUrl: report.labRequest.reportUrl,
          imageUrl: report.labRequest.imageUrl,
          patientNotes: report.labRequest.patientNotes,
          testName: report.labRequest.test.testName,
          category: report.labRequest.test.category
        }
      : null
  };
}

async function getPatientLocalResultReports(
  patient: {
    id: string;
    medicalRecordNumber: string;
    center: {
      code: string;
    };
    user: {
      phone: string | null;
      fullName: string;
    };
  },
  includeAttachmentData: boolean
) {
  const centralCenter = await prisma.centralCenter.findUnique({
    where: {
      centerCode: patient.center.code
    },
    select: {
      id: true
    }
  });

  if (!centralCenter) {
    return [];
  }

  const localPatient = await prisma.localPatient.findFirst({
    where: {
      centerId: centralCenter.id,
      OR: [
        ...(patient.user.phone ? [{ phone: patient.user.phone }] : []),
        {
          fullName: patient.user.fullName
        }
      ]
    }
  });

  if (!localPatient) {
    return [];
  }

  const reports = await prisma.localResultReport.findMany({
    where: {
      centerId: centralCenter.id,
      patientId: localPatient.id,
      shareWithPatient: true,
      OR: [
        {
          labRequest: null
        },
        {
          labRequest: {
            status: "PUBLISHED_TO_PATIENT"
          }
        }
      ]
    },
    include: localResultReportInclude,
    orderBy: {
      createdAt: "desc"
    }
  });

  return reports.map((report) =>
    mapLocalResultReport(
      report,
      {
        id: patient.id,
        fullName: patient.user.fullName,
        medicalRecordNumber: patient.medicalRecordNumber
      },
      includeAttachmentData
    )
  );
}

router.get(
  "/consent-targets",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientProfileId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");
    const scope = await resolvePortalLocalPatient(patientProfileId);

    if (!scope?.centerId || !scope.localPatient) {
      throw new AppError("Local patient record was not found for this portal account.", 404);
    }

    const [centers, doctors] = await Promise.all([
      prisma.centralCenter.findMany({
        where: { isConnected: true },
        select: {
          id: true,
          centerCode: true,
          centerName: true,
          city: true
        },
        orderBy: { centerName: "asc" },
        take: 100
      }),
      prisma.centerUserAccount.findMany({
        where: {
          isActive: true,
          role: "DOCTOR"
        },
        include: {
          center: {
            select: {
              centerName: true,
              centerCode: true
            }
          },
          doctorProfile: {
            select: {
              specialization: true
            }
          }
        },
        orderBy: { fullName: "asc" },
        take: 100
      })
    ]);

    res.json({
      centers: centers.map((center) => ({
        id: String(center.id),
        label: center.centerName,
        subtitle: `${center.centerCode} - ${center.city}`
      })),
      doctors: doctors.map((doctor) => ({
        id: String(doctor.id),
        label: doctor.fullName,
        subtitle: `${doctor.doctorProfile?.specialization ?? "Doctor"} - ${doctor.center.centerName}`
      }))
    });
  })
);

router.get(
  "/consents",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientProfileId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");
    const scope = await resolvePortalLocalPatient(patientProfileId);

    if (!scope?.centerId || !scope.localPatient) {
      throw new AppError("Local patient record was not found for this portal account.", 404);
    }

    await expireStalePatientConsents(scope.localPatient.id);

    const consents = await prisma.patientConsent.findMany({
      where: {
        patientId: scope.localPatient.id,
        status: "ACTIVE",
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: { createdAt: "desc" }
    });
    const labels = await Promise.all(
      consents.map((consent) => resolveConsentTargetLabel(consent.targetType, consent.targetId))
    );

    res.json(consents.map((consent, index) => mapPatientConsent(consent, labels[index])));
  })
);

router.post(
  "/consents",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientProfileId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");
    const scope = await resolvePortalLocalPatient(patientProfileId);
    const payload = consentSchema.parse(req.body);
    const now = new Date();
    const maxExpiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    if (!scope?.centerId || !scope.localPatient) {
      throw new AppError("Local patient record was not found for this portal account.", 404);
    }

    if (payload.expiresAt <= now) {
      throw new AppError("Consent expiration must be in the future.", 400);
    }

    if (payload.expiresAt > maxExpiry) {
      throw new AppError("Consent can be granted for up to 90 days.", 400);
    }

    const targetLabel = await resolveConsentTargetLabel(payload.targetType, payload.targetId);

    if (!targetLabel) {
      throw new AppError("Consent target was not found or is inactive.", 404);
    }

    await expireStalePatientConsents(scope.localPatient.id);

    const consent = await prisma.$transaction(async (tx) => {
      await tx.patientConsent.updateMany({
        where: {
          patientId: scope.localPatient!.id,
          targetType: payload.targetType,
          targetId: payload.targetId,
          scope: payload.scope,
          status: "ACTIVE"
        },
        data: {
          status: "REVOKED",
          revokedAt: now
        }
      });

      return tx.patientConsent.create({
        data: {
          centerId: scope.centerId,
          patientId: scope.localPatient!.id,
          grantedByPatientProfileId: patientProfileId,
          targetType: payload.targetType,
          targetId: payload.targetId,
          scope: payload.scope,
          expiresAt: payload.expiresAt
        }
      });
    });

    await recordAuditLog(req, {
      action: "PATIENT_CONSENT_GRANTED",
      entityType: "PatientConsent",
      entityId: consent.id,
      centerId: scope.centerId,
      newValue: {
        patientId: scope.localPatient.id,
        targetType: consent.targetType,
        targetId: consent.targetId,
        scope: consent.scope,
        expiresAt: consent.expiresAt.toISOString()
      }
    });

    res.status(201).json(mapPatientConsent(consent, targetLabel));
  })
);

router.patch(
  "/consents/:consentId/revoke",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientProfileId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");
    const consentId = Number(req.params.consentId);
    const scope = await resolvePortalLocalPatient(patientProfileId);

    if (!Number.isInteger(consentId) || consentId <= 0) {
      throw new AppError("Consent ID must be a positive integer.", 400);
    }

    if (!scope?.centerId || !scope.localPatient) {
      throw new AppError("Local patient record was not found for this portal account.", 404);
    }

    const consent = await prisma.patientConsent.findFirst({
      where: {
        id: consentId,
        patientId: scope.localPatient.id
      }
    });

    if (!consent) {
      throw new AppError("Consent was not found for this patient.", 404);
    }

    const revoked = await prisma.patientConsent.update({
      where: { id: consent.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date()
      }
    });
    const targetLabel = await resolveConsentTargetLabel(revoked.targetType, revoked.targetId);

    await recordAuditLog(req, {
      action: "PATIENT_CONSENT_REVOKED",
      entityType: "PatientConsent",
      entityId: revoked.id,
      centerId: scope.centerId,
      oldValue: { status: consent.status },
      newValue: {
        status: revoked.status,
        revokedAt: revoked.revokedAt?.toISOString()
      }
    });

    res.json(mapPatientConsent(revoked, targetLabel));
  })
);

router.get(
  "/summary",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");

    const patient = await prisma.patientProfile.findUnique({
      where: { id: patientId },
      include: {
        user: true,
        center: true
      }
    });

    if (!patient) {
      throw new AppError("Patient profile not found.", 404);
    }

    const [appointments, referrals, subscriptions, notifications, doctors, threads, localReports] = await Promise.all([
      prisma.appointment.findMany({
        where: { patientId },
        include: appointmentInclude,
        orderBy: {
          scheduledAt: "asc"
        }
      }),
      prisma.referral.findMany({
        where: { patientId },
        include: referralInclude,
        orderBy: {
          createdAt: "desc"
        }
      }),
      prisma.subscription.findMany({
        where: { patientId },
        include: subscriptionInclude,
        orderBy: {
          createdAt: "desc"
        }
      }),
      prisma.notification.findMany({
        where: {
          userId: patient.userId
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 6
      }),
      prisma.doctorProfile.findMany({
        where: {
          centerId: patient.centerId
        },
        include: {
          user: true,
          center: true,
          department: true
        },
        orderBy: {
          createdAt: "desc"
        }
      }),
      prisma.messageThread.findMany({
        where: {
          patientId
        },
        include: threadInclude,
        orderBy: {
          updatedAt: "desc"
        }
      }),
      getPatientLocalResultReports(patient, false)
    ]);

    const upcomingAppointments = appointments.filter(
      (appointment) =>
        appointment.scheduledAt >= new Date() &&
        appointment.status !== AppointmentStatus.CANCELLED
    );
    const completedReports = appointments.filter(
      (appointment) => appointment.status === AppointmentStatus.COMPLETED
    );
    const clinicalReports = [
      ...completedReports.map(mapAppointmentAsClinicalReport),
      ...localReports
    ].sort((left, right) => new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime());
    const activeReferrals = referrals.filter((referral) => referral.status !== "COMPLETED");
    const activeSubscriptions = subscriptions.filter(
      (subscription) => subscription.status === SubscriptionStatus.ACTIVE
    );

    res.json({
      patient: mapPatient({
        ...patient,
        appointments,
        referrals
      }),
      stats: {
        upcomingAppointments: upcomingAppointments.length,
        completedReports: clinicalReports.length,
        activeReferrals: activeReferrals.length,
        unreadNotifications: notifications.filter((notification) => !notification.isRead).length,
        activeSubscriptions: activeSubscriptions.length,
        careTeamCount: doctors.length
      },
      nextAppointment: upcomingAppointments[0] ? mapAppointment(upcomingAppointments[0]) : null,
      recentReports: clinicalReports.slice(0, 3),
      careTeam: doctors.slice(0, 4).map(mapDoctor),
      recentThreads: threads.slice(0, 3).map((thread) => mapThread(thread)),
      recentNotifications: notifications,
      subscriptions: subscriptions.map(mapSubscription)
    });
  })
);

router.get(
  "/medical-record",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");

    const patient = await prisma.patientProfile.findUnique({
      where: { id: patientId },
      include: {
        user: true,
        center: true,
        appointments: {
          include: appointmentInclude,
          orderBy: {
            scheduledAt: "desc"
          }
        },
        referrals: {
          include: referralInclude,
          orderBy: {
            createdAt: "desc"
          }
        },
        subscriptions: {
          include: subscriptionInclude,
          orderBy: {
            createdAt: "desc"
          }
        }
      }
    });

    if (!patient) {
      throw new AppError("Patient profile not found.", 404);
    }

    const [localReports, refillBundle, followUpReminders] = await Promise.all([
      getPatientLocalResultReports(patient, true),
      getPortalMedicationRefillBundle(patientId),
      getPortalFollowUpReminders(patientId)
    ]);
    const clinicalReports = [
      ...patient.appointments
        .filter((appointment) => appointment.status === AppointmentStatus.COMPLETED)
        .map(mapAppointmentAsClinicalReport),
      ...localReports
    ].sort((left, right) => new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime());

    res.json({
      patient: mapPatient(patient),
      profile: {
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        chronicConditions: patient.chronicConditions,
        insuranceNumber: patient.insuranceNumber,
        emergencyContact: patient.emergencyContact,
        center: {
          id: patient.center.id,
          code: patient.center.code,
          name: patient.center.name,
          city: patient.center.city,
          address: patient.center.address,
          phone: patient.center.phone
        }
      },
      clinicalReports,
      upcomingAppointments: patient.appointments
        .filter(
          (appointment) =>
            appointment.scheduledAt >= new Date() &&
            appointment.status !== AppointmentStatus.CANCELLED
        )
        .map(mapAppointment),
      referrals: patient.referrals.map(mapReferral),
      subscriptions: patient.subscriptions.map(mapSubscription),
      medicationRefills: refillBundle.requests,
      eligiblePrescriptions: refillBundle.eligiblePrescriptions,
      followUpReminders
    });
  })
);

router.get(
  "/refill-requests",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");

    res.json(await getPortalMedicationRefillBundle(patientId));
  })
);

router.post(
  "/refill-requests",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientProfileId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");
    const payload = medicationRefillRequestSchema.parse(req.body);
    const scope = await resolvePortalLocalPatient(patientProfileId);

    if (!scope?.centerId || !scope.localPatient) {
      throw new AppError("Local patient record was not found for this portal account.", 404);
    }

    const prescription = await prisma.localPrescription.findFirst({
      where: {
        id: payload.prescriptionId,
        visit: {
          centerId: scope.centerId,
          patientId: scope.localPatient.id
        }
      },
      include: {
        visit: {
          include: {
            doctor: true
          }
        }
      }
    });

    if (!prescription) {
      throw new AppError("Prescription is not available for refill from this patient account.", 404);
    }

    const activeRequest = await prisma.medicationRefillRequest.findFirst({
      where: {
        centerId: scope.centerId,
        patientId: scope.localPatient.id,
        prescriptionId: prescription.id,
        status: {
          in: activeRefillStatuses
        }
      }
    });

    if (activeRequest) {
      throw new AppError("There is already an active refill request for this prescription.", 409);
    }

    const request = await prisma.medicationRefillRequest.create({
      data: {
        centerId: scope.centerId,
        patientId: scope.localPatient.id,
        prescriptionId: prescription.id,
        notes: payload.notes
      },
      include: refillRequestInclude
    });

    await notifyRole({
      centerId: scope.centerId,
      role: "DOCTOR",
      type: "MEDICATION_REFILL_REQUEST",
      title: "طلب تجديد دواء جديد",
      message: `${scope.localPatient.fullName} طلب تجديد وصفة ${prescription.medicineName}.`
    });

    res.status(201).json(mapMedicationRefillRequest(request));
  })
);

router.get(
  "/follow-up-reminders",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");

    res.json(await getPortalFollowUpReminders(patientId));
  })
);

router.use("/appointments", appointmentsRouter);
router.use("/centers", centersRouter);
router.use("/communications", communicationsRouter);
router.use("/doctors", doctorsRouter);
router.use("/notifications", notificationsRouter);
router.use("/patients", patientsRouter);
router.use("/referrals", referralsRouter);
router.use("/subscriptions", subscriptionsRouter);

export const portalRouter = router;
