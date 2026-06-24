import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authorize, authorizeWorkspace, authenticate } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { recordAuditLog } from "../services/audit-log";
import {
  createCenterDoctor,
  deleteCenterDoctor,
  getCenterDoctorsBundle,
  updateCenterDoctor
} from "../services/doctor-accounts";
import {
  enqueueOutgoingNotification,
  processOutgoingNotifications,
  syncCenterVisitsNow
} from "../services/notification-processor";
import { notifyRole } from "../services/internal-notifications";
import {
  activeRefillStatuses,
  followUpReminderInclude,
  mapFollowUpReminder,
  mapMedicationRefillRequest,
  refillRequestInclude
} from "../services/patient-care-workflow";
import {
  getCenterLabData,
  getCenterNotifications,
  getCenterPatients,
  getCenterPharmacyData,
  getCenterVisits,
  getCenterWorkspaceData
} from "../services/network-queries";
import { ensurePatientPortalAccount } from "../services/patient-accounts";
import {
  buildPrescriptionQrValue,
  createPrescriptionVerificationCode,
  hashPrescriptionVerificationCode
} from "../services/prescription-verification";
import {
  checkPrescriptionSafety,
  savePrescriptionWarnings,
  validatePrescriptionSafetyOverride
} from "../services/prescription-safety";
import { notifyLocalPatient, notifyPatientAboutResultReport } from "../services/result-report-notifications";
import {
  buildPatientQrImageUrl,
  buildPatientQrValue,
  createPatientQrToken,
  parsePatientQrToken
} from "../services/patient-qr";
import { asyncHandler } from "../utils/async-handler";
import { visitWorkflowRouter } from "./visit-workflow";

const router = Router();

router.use(authenticate, authorizeWorkspace("center"));
router.use("/visit-workflow", visitWorkflowRouter);
router.use("/queue", visitWorkflowRouter);

function getCenterId(req: Parameters<typeof asyncHandler>[0] extends never ? never : any) {
  return Number(req.auth?.centerId);
}

function getActorCenterUserId(req: Parameters<typeof asyncHandler>[0] extends never ? never : any) {
  const actorId = Number(req.auth?.sub);

  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new AppError("Center user session is invalid.", 401);
  }

  return actorId;
}

function parsePositiveParam(value: string | string[] | undefined, label: string) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(`${label} must be a positive integer.`, 400);
  }

  return parsed;
}

type PatientCardRecord = Awaited<ReturnType<typeof getPatientCardRecord>>;

async function getPatientCardRecord(centerId: number, patientId: number) {
  return prisma.localPatient.findFirst({
    where: {
      id: patientId,
      centerId
    },
    include: {
      center: {
        select: {
          id: true,
          centerName: true,
          centerCode: true,
          phone: true
        }
      },
      unifiedPatient: {
        select: {
          nationalId: true
        }
      }
    }
  });
}

function mapPatientQrCard(patient: NonNullable<PatientCardRecord>) {
  const qrValue = buildPatientQrValue(patient.qrToken);

  return {
    patient: {
      id: patient.id,
      internalId: patient.id,
      unifiedId: patient.unifiedId,
      fullName: patient.fullName,
      nationalId: patient.unifiedPatient?.nationalId ?? null,
      phone: patient.phone,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      bloodType: patient.bloodType,
      center: {
        id: patient.center.id,
        name: patient.center.centerName,
        code: patient.center.centerCode,
        phone: patient.center.phone
      }
    },
    qrToken: patient.qrToken,
    qrValue,
    qrImageUrl: buildPatientQrImageUrl(qrValue),
    verificationPath: `/patients/qr/${patient.qrToken}`
  };
}

const patientSchema = z.object({
  fullName: z.string().min(3),
  dateOfBirth: z.coerce.date().refine((value) => value <= new Date(), {
    message: "تاريخ الميلاد لا يمكن أن يكون في المستقبل."
  }),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]),
  primaryPhone: z.string().min(6),
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().email("أدخل البريد الإلكتروني الصحيح للمريض.")
  ),
  address: z.string().min(5),
  emergencyContact: z.string().optional(),
  bloodType: z.string().optional(),
  allergies: z.array(z.string()).default([]),
  chronicDiseases: z.array(z.string()).default([]),
  nationalId: z.string().min(6)
});

const patientUpdateSchema = patientSchema.omit({ email: true });

const visitSchema = z.object({
  patientId: z.coerce.number(),
  doctorId: z.coerce.number().optional(),
  visitDate: z.coerce.date(),
  visitTime: z.string().optional(),
  visitType: z.enum(["CONSULTATION", "EMERGENCY", "FOLLOW_UP", "LAB"]),
  symptoms: z.string().optional(),
  bloodPressure: z.string().optional(),
  temperature: z.coerce.number().optional(),
  heartRate: z.coerce.number().optional(),
  diagnosis: z.string().min(3),
  notes: z.string().optional(),
  prescriptions: z
    .array(
      z.object({
        medicineName: z.string().min(2),
        dosage: z.string().min(2),
        duration: z.string().min(2),
        instructions: z.string().optional()
      })
    )
    .default([]),
  overridePrescriptionWarnings: z.boolean().optional(),
  overrideReason: z.string().trim().optional()
});

const reportAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(3),
  contentBase64: z.string().min(1)
});

const reportUrlSchema = z
  .string()
  .trim()
  .url("أدخل رابط تقرير صالح يبدأ بـ http أو https.")
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "أدخل رابط تقرير صالح يبدأ بـ http أو https."
  });

const reportSchema = z.object({
  title: z.string().min(2),
  category: z
    .enum([
      "GENERAL",
      "LAB",
      "IMAGING",
      "RADIOLOGY",
      "PATHOLOGY",
      "CARDIOLOGY",
      "MICROBIOLOGY",
      "PROCEDURE",
      "FOLLOW_UP",
      "DISCHARGE"
    ])
    .default("GENERAL"),
  reportUrl: reportUrlSchema,
  summary: z.string().trim().optional(),
  findings: z.string().optional(),
  recommendations: z.string().optional(),
  recommendedFollowUp: z.string().optional(),
  shareWithPatient: z.boolean().default(true),
  attachment: reportAttachmentSchema.nullish()
});

const referralSchema = z.object({
  localPatientId: z.coerce.number().optional(),
  patientUnifiedId: z.string().optional(),
  requiredSpecialty: z.string().min(2),
  priority: z.enum(["NORMAL", "URGENT", "EMERGENCY"]).default("NORMAL"),
  reason: z.string().min(5),
  requiresOr: z.boolean().default(false),
  requiredMedicineIds: z.array(z.coerce.number()).default([]),
  preferredRegion: z.string().optional(),
  maxDistanceKm: z.coerce.number().optional(),
  notesFromSender: z.string().optional(),
  processNow: z.boolean().default(true)
});

const referralRejectSchema = z.object({
  reason: z.string().trim().min(3)
});

const referralAssignDoctorSchema = z.object({
  doctorId: z.coerce.number().int().positive()
});

const referralStartVisitSchema = z.object({
  symptoms: z.string().trim().optional(),
  diagnosis: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  visitType: z.enum(["CONSULTATION", "EMERGENCY", "FOLLOW_UP", "LAB"]).default("CONSULTATION")
});

const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  reportUrlSchema.optional()
);

const labPrioritySchema = z.enum(["NORMAL", "URGENT", "CRITICAL"]);
const labStatusSchema = z.enum([
  "NEW",
  "PENDING",
  "PENDING_SAMPLE",
  "SAMPLE_RECEIVED",
  "IN_PROGRESS",
  "RESULT_READY",
  "SENT_TO_DOCTOR",
  "NEEDS_CORRECTION",
  "PUBLISHED_TO_PATIENT",
  "INVALID_SAMPLE",
  "COMPLETED",
  "CANCELLED"
]);

const labRequestSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  doctorId: z.coerce.number().int().positive().optional(),
  visitId: z.coerce.number().int().positive().optional(),
  testId: z.coerce.number().int().positive(),
  priority: labPrioritySchema.default("NORMAL"),
  reason: z.string().trim().min(2).max(1000).optional(),
  clinicalNotes: z.string().trim().max(1000).optional(),
  sampleType: z.string().trim().max(120).optional(),
  fastingRequired: z.boolean().default(false),
  externalTest: z.boolean().default(false)
});

const labStatusUpdateSchema = z.object({
  status: z.enum(["PENDING_SAMPLE", "SAMPLE_RECEIVED", "IN_PROGRESS", "INVALID_SAMPLE", "CANCELLED"]),
  note: z.string().trim().max(1000).optional()
});

const labResultSchema = z
  .object({
    action: z.enum(["SAVE_DRAFT", "MARK_READY", "SEND_TO_DOCTOR"]).default("SAVE_DRAFT"),
    resultValue: z.string().trim().optional(),
    resultNotes: z.string().trim().optional(),
    unit: z.string().trim().max(60).optional(),
    normalRange: z.string().trim().max(120).optional(),
    abnormalFlag: z.enum(["NORMAL", "ABNORMAL", "CRITICAL"]).default("NORMAL"),
    criticalNote: z.string().trim().max(1000).optional(),
    reportUrl: optionalUrlSchema,
    imageUrl: optionalUrlSchema,
    doctorNotes: z.string().trim().max(1200).optional(),
    resultFileName: z.string().trim().max(255).optional(),
    resultMimeType: z.string().trim().max(120).optional(),
    resultBase64: z.string().trim().optional()
  })
  .superRefine((payload, context) => {
    const hasStructuredResult = Boolean(payload.resultValue || payload.resultNotes);
    const hasReportLink = Boolean(payload.reportUrl || payload.imageUrl);
    const hasAttachment = Boolean(payload.resultFileName && payload.resultMimeType && payload.resultBase64);

    if (!hasStructuredResult && !hasReportLink && !hasAttachment) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب إدخال نتيجة منظمة أو رابط/ملف للتقرير قبل حفظ نتيجة المختبر."
      });
    }

    if (payload.abnormalFlag === "CRITICAL" && !payload.criticalNote) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب إضافة ملاحظة للحالة الحرجة قبل إرسال النتيجة."
      });
    }
  });

const labPublishSchema = z.object({
  doctorNotes: z.string().trim().max(1200).optional(),
  patientNotes: z.string().trim().max(1200).optional()
});

const labCorrectionSchema = z.object({
  reason: z.string().trim().min(3).max(1200)
});

const labRequestDetailInclude = {
  patient: true,
  doctor: {
    include: {
      doctorProfile: true
    }
  },
  test: true,
  visit: true,
  resultReport: true
} as const;

const labWorkPendingStatuses = [
  "NEW",
  "PENDING",
  "PENDING_SAMPLE",
  "SAMPLE_RECEIVED",
  "IN_PROGRESS",
  "RESULT_READY",
  "NEEDS_CORRECTION"
] as const;

function hasLabResultContent(request: {
  resultValue: string | null;
  resultNotes: string | null;
  reportUrl: string | null;
  imageUrl: string | null;
  resultFileName: string | null;
  resultMimeType: string | null;
  resultBase64: string | null;
}) {
  return Boolean(
    request.resultValue ||
      request.resultNotes ||
      request.reportUrl ||
      request.imageUrl ||
      (request.resultFileName && request.resultMimeType && request.resultBase64)
  );
}

async function findLabRequest(centerId: number, requestId: number) {
  return prisma.labRequestLocal.findFirst({
    where: {
      id: requestId,
      centerId
    },
    include: labRequestDetailInclude
  });
}

function assertDoctorCanUseLabRequest(req: Parameters<typeof asyncHandler>[0] extends never ? never : any, request: Awaited<ReturnType<typeof findLabRequest>>) {
  if (!request) {
    throw new AppError("طلب المختبر غير موجود داخل هذا المركز.", 404);
  }

  const actorId = getActorCenterUserId(req);
  if (req.auth?.role === "DOCTOR" && request.doctorId !== actorId && request.visit?.doctorId !== actorId) {
    throw new AppError("لا يمكنك مراجعة طلب مختبر لطبيب آخر.", 403);
  }
}

async function completeLabWorkflowTaskIfReady(tx: Prisma.TransactionClient, visitId: number, completedById: number, resultSummary?: string | null) {
  const remaining = await tx.labRequestLocal.count({
    where: {
      visitId,
      status: {
        in: [...labWorkPendingStatuses]
      }
    }
  });

  if (remaining > 0) {
    return;
  }

  const task = await tx.visitWorkflowTask.findFirst({
    where: {
      visitId,
      taskType: "LAB_TEST",
      status: {
        in: ["PENDING", "IN_PROGRESS"]
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (task) {
    await tx.visitWorkflowTask.update({
      where: {
        id: task.id
      },
      data: {
        status: "COMPLETED",
        completedById,
        completedAt: new Date(),
        resultSummary: resultSummary ?? undefined
      }
    });
  }
}

const medicationRefillStatusValues = [
  "REQUESTED",
  "DOCTOR_APPROVED",
  "PHARMACY_PREPARING",
  "READY_FOR_PICKUP",
  "COLLECTED",
  "REJECTED"
] as const;

const followUpReminderStatusValues = ["PENDING", "DONE", "CANCELLED", "MISSED"] as const;

const refillDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("APPROVE"),
    notes: z.string().trim().max(500).optional()
  }),
  z.object({
    decision: z.literal("REJECT"),
    rejectionReason: z.string().trim().min(3).max(500),
    notes: z.string().trim().max(500).optional()
  })
]);

const refillPharmacyStatusSchema = z.object({
  status: z.enum(["PHARMACY_PREPARING", "READY_FOR_PICKUP", "COLLECTED"]),
  notes: z.string().trim().max(500).optional()
});

const followUpReminderSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  doctorId: z.coerce.number().int().positive().optional(),
  visitId: z.coerce.number().int().positive().optional(),
  dueDate: z.coerce.date(),
  reason: z.string().trim().min(3).max(500),
  notes: z.string().trim().max(1000).optional()
});

const followUpReminderUpdateSchema = z
  .object({
    status: z.enum(["PENDING", "DONE", "CANCELLED", "MISSED"]).optional(),
    dueDate: z.coerce.date().optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    notes: z.string().trim().max(1000).optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one reminder field must be provided."
  });

const centralReferralInclude = {
  patient: true,
  fromCenter: true,
  toCenter: true,
  assignedDoctor: true,
  acceptedByManager: true,
  rejectedByManager: true,
  createdVisit: true
} as const;

type CentralReferralPayload = Prisma.CentralReferralGetPayload<{
  include: typeof centralReferralInclude;
}>;

function mapCentralReferral(referral: CentralReferralPayload) {
  return {
    id: referral.id,
    patientName: referral.patient.fullName,
    patientUnifiedId: referral.patient.unifiedId,
    fromCenter: referral.fromCenter.centerName,
    fromCenterId: referral.fromCenterId,
    toCenter: referral.toCenter?.centerName ?? "بانتظار اختيار الجهة المستقبلة",
    toCenterId: referral.toCenterId,
    requiredSpecialty: referral.requiredSpecialty,
    priority: referral.priority,
    status: referral.status,
    reason: referral.reason,
    selectedCenterReason: referral.selectedCenterReason,
    rejectionReason: referral.rejectionReason,
    managerDecisionReason: referral.managerDecisionReason,
    matchingScore: referral.matchingScore,
    estimatedWaitTimeMinutes: referral.estimatedWaitTimeMinutes,
    requestedAt: referral.requestedAt,
    respondedAt: referral.respondedAt,
    decisionAt: referral.decisionAt,
    assignedAt: referral.assignedAt,
    visitCreatedAt: referral.visitCreatedAt,
    completedAt: referral.completedAt,
    notesFromSender: referral.notesFromSender,
    notesFromReceiver: referral.notesFromReceiver,
    assignedDoctor: referral.assignedDoctor
      ? {
          id: referral.assignedDoctor.id,
          fullName: referral.assignedDoctor.fullName
        }
      : null,
    acceptedByManager: referral.acceptedByManager
      ? {
          id: referral.acceptedByManager.id,
          fullName: referral.acceptedByManager.fullName
        }
      : null,
    rejectedByManager: referral.rejectedByManager
      ? {
          id: referral.rejectedByManager.id,
          fullName: referral.rejectedByManager.fullName
        }
      : null,
    createdVisitId: referral.createdVisit?.id ?? null
  };
}

const receivingReviewStatuses = ["AUTO_SELECTED", "PENDING_RECEIVING_MANAGER", "ACCEPTED"] as const;
const receivingInboxStatuses = [...receivingReviewStatuses, "RECEIVING_MANAGER_ACCEPTED"] as const;

const doctorAccountSchema = z.object({
  username: z
    .string()
    .trim()
    .min(4, "رقم الهوية / اسم الدخول مطلوب.")
    .regex(/^[\p{L}\p{N}._@-]+$/u, "رقم الهوية / اسم الدخول يحتوي على رموز غير مسموحة.")
    .optional(),
  password: z.string().optional(),
  fullName: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().trim().email("البريد الإلكتروني مطلوب وصالح لاستعادة كلمة المرور."),
  nationalId: z.string().min(4),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]),
  specialization: z.string().min(2),
  yearsExperience: z.coerce.number().int().min(0),
  licenseNumber: z.string().min(2),
  qualification: z.string().optional(),
  shiftDays: z.array(z.enum(["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"])).default([]),
  shiftStartTime: z.string().optional(),
  shiftEndTime: z.string().optional(),
  consultationRoom: z.string().optional(),
  hireDate: z.coerce.date().optional(),
  bio: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true)
});

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    res.json(await getCenterWorkspaceData(getCenterId(req), req.auth!.role));
  })
);

router.get(
  "/audit-logs",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const limit = Math.min(Number(req.query.limit ?? 80), 200);
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;

    const logs = await prisma.auditLog.findMany({
      where: {
        centerId,
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {})
      },
      include: {
        center: {
          select: {
            centerName: true,
            centerCode: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: limit
    });

    res.json(logs);
  })
);

router.get(
  "/prescriptions/verify/:code",
  authorize("CENTER_MANAGER", "DOCTOR", "PHARMACIST", "LAB_TECH", "NURSE"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const rawCode = String(req.params.code ?? "").trim();
    const code = rawCode.startsWith("healthcare-prescription:")
      ? rawCode.replace("healthcare-prescription:", "")
      : rawCode;

    const prescription = await prisma.localPrescription.findFirst({
      where: {
        verificationCode: code,
        visit: {
          centerId
        }
      },
      include: {
        visit: {
          include: {
            center: true,
            patient: true,
            doctor: {
              select: {
                id: true,
                fullName: true,
                role: true
              }
            }
          }
        }
      }
    });
    const authentic = Boolean(
      prescription &&
        (!prescription.verificationHash || prescription.verificationHash === hashPrescriptionVerificationCode(code))
    );

    await recordAuditLog(req, {
      action: "VERIFY_PRESCRIPTION",
      entityType: "LocalPrescription",
      entityId: prescription?.id,
      centerId,
      newValue: {
        code,
        authentic
      }
    });

    res.json({
      authentic,
      qrValue: buildPrescriptionQrValue(code),
      prescription: prescription
        ? {
            id: prescription.id,
            verificationCode: prescription.verificationCode,
            issuedAt: prescription.issuedAt,
            medicineName: prescription.medicineName,
            dosage: prescription.dosage,
            duration: prescription.duration,
            quantity: prescription.quantity,
            instructions: prescription.instructions,
            dispensed: prescription.dispensed,
            visit: {
              id: prescription.visit.id,
              visitDate: prescription.visit.visitDate,
              diagnosis: prescription.visit.diagnosis,
              patientName: prescription.visit.patient.fullName,
              patientUnifiedId: prescription.visit.patient.unifiedId,
              doctorName: prescription.visit.doctor?.fullName ?? "غير محدد",
              centerName: prescription.visit.center.centerName,
              centerCode: prescription.visit.center.centerCode
            }
          }
        : null
    });
  })
);

router.get(
  "/doctors",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    res.json(await getCenterDoctorsBundle(getCenterId(req)));
  })
);

router.post(
  "/doctors",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const payload = doctorAccountSchema.extend({ password: z.string().min(8) }).parse(req.body);
    const result = await createCenterDoctor({
        ...payload,
        centerId: getCenterId(req),
        username: payload.username ?? "",
        createdById: Number(req.auth!.sub)
      });

    await recordAuditLog(req, {
      action: "CREATE_DOCTOR",
      entityType: "CenterUserAccount",
      entityId: result.doctor.id,
      newValue: {
        username: result.doctor.username,
        fullName: result.doctor.fullName,
        specialization: result.doctor.profile?.specialization
      }
    });

    res.status(201).json(result);
  })
);

router.put(
  "/doctors/:doctorId",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const payload = doctorAccountSchema.parse(req.body);
    const result = await updateCenterDoctor({
        ...payload,
        centerId: getCenterId(req),
        doctorId: Number(req.params.doctorId),
        username: payload.username ?? ""
      });

    await recordAuditLog(req, {
      action: "UPDATE_DOCTOR",
      entityType: "CenterUserAccount",
      entityId: result.doctor.id,
      newValue: {
        username: result.doctor.username,
        fullName: result.doctor.fullName,
        isActive: result.doctor.isActive
      }
    });

    res.json(result);
  })
);

router.delete(
  "/doctors/:doctorId",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const doctorId = Number(req.params.doctorId);
    const result = await deleteCenterDoctor(getCenterId(req), doctorId);

    await recordAuditLog(req, {
      action: "DISABLE_DOCTOR",
      entityType: "CenterUserAccount",
      entityId: doctorId
    });

    res.json(result);
  })
);

router.get(
  "/patients",
  authorize("CENTER_MANAGER", "RECEPTIONIST", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    res.json(await getCenterPatients(getCenterId(req), search));
  })
);

router.get(
  "/patients/search",
  authorize("CENTER_MANAGER", "RECEPTIONIST", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const term = String(req.query.term ?? req.query.phone ?? "").trim();
    const centerId = getCenterId(req);
    const limit = Math.min(Number(req.query.limit ?? 8), 12);

    if (!term) {
      return res.json({
        found: false,
        localPatient: null,
        patient: null,
        localMatches: [],
        patientMatches: [],
        recentVisits: []
      });
    }

    const [localPatients, unifiedPatients] = await Promise.all([
      prisma.localPatient.findMany({
        where: {
          centerId,
          OR: [
            { fullName: { contains: term, mode: "insensitive" } },
            { phone: { contains: term } },
            { unifiedId: { contains: term, mode: "insensitive" } },
            {
              unifiedPatient: {
                is: {
                  OR: [
                    { nationalId: { contains: term } },
                    { fullName: { contains: term, mode: "insensitive" } },
                    { primaryPhone: { contains: term } }
                  ]
                }
              }
            }
          ]
        },
        include: {
          unifiedPatient: true,
          visits: {
            orderBy: {
              visitDate: "desc"
            },
            take: 3
          }
        },
        orderBy: [{ fullName: "asc" }],
        take: limit
      }),
      prisma.unifiedPatient.findMany({
        where: {
          OR: [
            { fullName: { contains: term, mode: "insensitive" } },
            { primaryPhone: { contains: term } },
            { nationalId: { contains: term } },
            { unifiedId: { contains: term, mode: "insensitive" } }
          ]
        },
        include: {
          unifiedVisits: {
            include: {
              center: true
            },
            orderBy: {
              visitDate: "desc"
            },
            take: 5
          }
        },
        orderBy: [{ fullName: "asc" }],
        take: limit
      })
    ]);
    const localPatient = localPatients[0] ?? null;
    const unifiedPatient = unifiedPatients[0] ?? null;
    const localMatches = localPatients.map((patient) => ({
      id: patient.id,
      fullName: patient.fullName,
      phone: patient.phone,
      nationalId: patient.unifiedPatient?.nationalId ?? null
    }));
    const patientMatches = unifiedPatients.map((patient) => ({
      id: patient.id,
      unifiedId: patient.unifiedId,
      nationalId: patient.nationalId,
      fullName: patient.fullName,
      primaryPhone: patient.primaryPhone,
      address: patient.address,
      chronicDiseases: patient.chronicDiseases
    }));

    res.json({
      found: localMatches.length > 0 || patientMatches.length > 0,
      localPatient: localPatient
        ? {
            id: localPatient.id,
            fullName: localPatient.fullName,
            phone: localPatient.phone,
            nationalId: localPatient.unifiedPatient?.nationalId ?? null
          }
        : null,
      patient: unifiedPatient
        ? {
            id: unifiedPatient.id,
            unifiedId: unifiedPatient.unifiedId,
            nationalId: unifiedPatient.nationalId,
            fullName: unifiedPatient.fullName,
            primaryPhone: unifiedPatient.primaryPhone,
            address: unifiedPatient.address,
            chronicDiseases: unifiedPatient.chronicDiseases
          }
        : null,
      localMatches,
      patientMatches,
      recentVisits: unifiedPatient?.unifiedVisits ?? []
    });
  })
);

router.get(
  "/patients/:patientId/card",
  authorize("CENTER_MANAGER", "RECEPTIONIST", "DOCTOR", "NURSE", "LAB_TECH", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const patientId = Number(req.params.patientId);
    const patient = await getPatientCardRecord(centerId, patientId);

    if (!patient) {
      return res.status(404).json({ message: "تعذر العثور على بطاقة المريض داخل هذا المركز." });
    }

    await recordAuditLog(req, {
      action: "VIEW_PATIENT_QR_CARD",
      entityType: "LocalPatient",
      entityId: patient.id,
      centerId,
      newValue: {
        qrToken: patient.qrToken,
        patientId: patient.id
      }
    });

    res.json(mapPatientQrCard(patient));
  })
);

router.get(
  "/patients/qr/:qrToken",
  authorize("CENTER_MANAGER", "RECEPTIONIST", "DOCTOR", "NURSE", "LAB_TECH", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const qrToken = parsePatientQrToken(String(req.params.qrToken ?? ""));
    const patient = await prisma.localPatient.findFirst({
      where: {
        centerId,
        qrToken
      },
      include: {
        center: {
          select: {
            id: true,
            centerName: true,
            centerCode: true,
            phone: true
          }
        },
        unifiedPatient: {
          select: {
            nationalId: true
          }
        }
      }
    });

    await recordAuditLog(req, {
      action: "VERIFY_PATIENT_QR_CARD",
      entityType: "LocalPatient",
      entityId: patient?.id,
      centerId,
      newValue: {
        matched: Boolean(patient)
      }
    });

    if (!patient) {
      return res.status(404).json({ message: "رمز بطاقة المريض غير صالح أو لا يتبع لهذا المركز." });
    }

    res.json(mapPatientQrCard(patient));
  })
);

router.post(
  "/patients/:patientId/regenerate-qr",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const patientId = Number(req.params.patientId);
    const existingPatient = await getPatientCardRecord(centerId, patientId);

    if (!existingPatient) {
      return res.status(404).json({ message: "تعذر العثور على بطاقة المريض داخل هذا المركز." });
    }

    const patient = await prisma.localPatient.update({
      where: { id: existingPatient.id },
      data: {
        qrToken: createPatientQrToken()
      },
      include: {
        center: {
          select: {
            id: true,
            centerName: true,
            centerCode: true,
            phone: true
          }
        },
        unifiedPatient: {
          select: {
            nationalId: true
          }
        }
      }
    });

    await recordAuditLog(req, {
      action: "REGENERATE_PATIENT_QR_CARD",
      entityType: "LocalPatient",
      entityId: patient.id,
      centerId,
      oldValue: {
        qrToken: existingPatient.qrToken
      },
      newValue: {
        qrToken: patient.qrToken
      }
    });

    res.json(mapPatientQrCard(patient));
  })
);

router.post(
  "/patients",
  authorize("RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const payload = patientSchema.parse(req.body);

    let unifiedPatient = await prisma.unifiedPatient.findFirst({
      where: {
        OR: [
          { primaryPhone: payload.primaryPhone },
          ...(payload.nationalId ? [{ nationalId: payload.nationalId }] : [])
        ]
      }
    });

    const hadUnifiedPatient = Boolean(unifiedPatient);

    if (unifiedPatient) {
      unifiedPatient = await prisma.unifiedPatient.update({
        where: {
          id: unifiedPatient.id
        },
        data: {
          nationalId: payload.nationalId,
          fullName: payload.fullName,
          dateOfBirth: payload.dateOfBirth,
          gender: payload.gender,
          primaryPhone: payload.primaryPhone,
          address: payload.address,
          bloodType: payload.bloodType,
          allergies: payload.allergies,
          chronicDiseases: payload.chronicDiseases
        }
      });
    } else {
      unifiedPatient = await prisma.unifiedPatient.create({
        data: {
          unifiedId: `P-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`,
          nationalId: payload.nationalId,
          fullName: payload.fullName,
          dateOfBirth: payload.dateOfBirth,
          gender: payload.gender,
          primaryPhone: payload.primaryPhone,
          address: payload.address,
          bloodType: payload.bloodType,
          allergies: payload.allergies,
          chronicDiseases: payload.chronicDiseases
        }
      });
    }

    let localPatient = await prisma.localPatient.findFirst({
      where: {
        centerId,
        OR: [{ unifiedPatientId: unifiedPatient.id }, { phone: payload.primaryPhone }]
      }
    });

    if (localPatient) {
      localPatient = await prisma.localPatient.update({
        where: {
          id: localPatient.id
        },
        data: {
          unifiedPatientId: unifiedPatient.id,
          unifiedId: unifiedPatient.unifiedId,
          fullName: payload.fullName,
          dateOfBirth: payload.dateOfBirth,
          gender: payload.gender,
          phone: payload.primaryPhone,
          address: payload.address,
          emergencyContact: payload.emergencyContact,
          bloodType: payload.bloodType,
          allergies: payload.allergies,
          chronicDiseases: payload.chronicDiseases
        }
      });
    } else {
      localPatient = await prisma.localPatient.create({
        data: {
          centerId,
          unifiedPatientId: unifiedPatient.id,
          unifiedId: unifiedPatient.unifiedId,
          fullName: payload.fullName,
          dateOfBirth: payload.dateOfBirth,
          gender: payload.gender,
          phone: payload.primaryPhone,
          address: payload.address,
          emergencyContact: payload.emergencyContact,
          bloodType: payload.bloodType,
          allergies: payload.allergies,
          chronicDiseases: payload.chronicDiseases,
          createdLocally: !hadUnifiedPatient
        }
      });
    }

    const portalAccount = await ensurePatientPortalAccount({
      centerId,
      fullName: payload.fullName,
      nationalId: payload.nationalId,
      email: payload.email,
      primaryPhone: payload.primaryPhone,
      dateOfBirth: payload.dateOfBirth,
      gender: payload.gender,
      emergencyContact: payload.emergencyContact,
      chronicDiseases: payload.chronicDiseases
    });

    await recordAuditLog(req, {
      action: hadUnifiedPatient ? "UPDATE_PATIENT" : "CREATE_PATIENT",
      entityType: "LocalPatient",
      entityId: localPatient.id,
      centerId,
      newValue: {
        fullName: localPatient.fullName,
        unifiedId: localPatient.unifiedId,
        phone: localPatient.phone
      }
    });

    res.status(201).json({
      success: true,
      unifiedId: unifiedPatient.unifiedId,
      patient: localPatient,
      portalAccount
    });
  })
);

router.put(
  "/patients/:patientId",
  authorize("RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const patientId = parsePositiveParam(req.params.patientId, "Patient ID");
    const payload = patientUpdateSchema.parse(req.body);
    const existingPatient = await prisma.localPatient.findFirst({
      where: {
        id: patientId,
        centerId
      },
      include: {
        unifiedPatient: true
      }
    });

    if (!existingPatient) {
      throw new AppError("ملف المريض غير موجود داخل هذا المركز.", 404);
    }

    const updatedPatient = await prisma.$transaction(async (tx) => {
      let unifiedPatient = existingPatient.unifiedPatient;

      if (unifiedPatient) {
        unifiedPatient = await tx.unifiedPatient.update({
          where: { id: unifiedPatient.id },
          data: {
            nationalId: payload.nationalId,
            fullName: payload.fullName,
            dateOfBirth: payload.dateOfBirth,
            gender: payload.gender,
            primaryPhone: payload.primaryPhone,
            address: payload.address,
            bloodType: payload.bloodType,
            allergies: payload.allergies,
            chronicDiseases: payload.chronicDiseases
          }
        });
      }

      return tx.localPatient.update({
        where: {
          id: existingPatient.id
        },
        data: {
          unifiedPatientId: unifiedPatient?.id ?? existingPatient.unifiedPatientId,
          unifiedId: unifiedPatient?.unifiedId ?? existingPatient.unifiedId,
          fullName: payload.fullName,
          dateOfBirth: payload.dateOfBirth,
          gender: payload.gender,
          phone: payload.primaryPhone,
          address: payload.address,
          emergencyContact: payload.emergencyContact,
          bloodType: payload.bloodType,
          allergies: payload.allergies,
          chronicDiseases: payload.chronicDiseases
        }
      });
    });

    await recordAuditLog(req, {
      action: "UPDATE_PATIENT",
      entityType: "LocalPatient",
      entityId: updatedPatient.id,
      centerId,
      newValue: {
        fullName: updatedPatient.fullName,
        unifiedId: updatedPatient.unifiedId,
        phone: updatedPatient.phone
      }
    });

    res.json(updatedPatient);
  })
);

router.delete(
  "/patients/:patientId",
  authorize("RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const patientId = parsePositiveParam(req.params.patientId, "Patient ID");
    const existingPatient = await prisma.localPatient.findFirst({
      where: {
        id: patientId,
        centerId
      },
      include: {
        _count: {
          select: {
            visits: true,
            labRequests: true,
            resultReports: true
          }
        }
      }
    });

    if (!existingPatient) {
      throw new AppError("ملف المريض غير موجود داخل هذا المركز.", 404);
    }

    if (
      existingPatient._count.visits > 0 ||
      existingPatient._count.labRequests > 0 ||
      existingPatient._count.resultReports > 0
    ) {
      throw new AppError("لا يمكن حذف ملف مريض مرتبط بزيارات أو نتائج. يمكن إبقاء الملف للعرض والمتابعة.", 409);
    }

    await prisma.localPatient.delete({
      where: {
        id: existingPatient.id
      }
    });

    await recordAuditLog(req, {
      action: "DELETE_PATIENT",
      entityType: "LocalPatient",
      entityId: patientId,
      centerId
    });

    res.json({ success: true });
  })
);

router.get(
  "/visits",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    res.json(await getCenterVisits(getCenterId(req)));
  })
);

router.post(
  "/visits",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const payload = visitSchema.parse(req.body);
    const safetyWarnings = await checkPrescriptionSafety({
      centerId,
      patientId: payload.patientId,
      prescriptions: payload.prescriptions.map((prescription) => ({
        medicineName: prescription.medicineName
      }))
    });

    validatePrescriptionSafetyOverride({
      warnings: safetyWarnings,
      overrideWarnings: payload.overridePrescriptionWarnings,
      overrideReason: payload.overrideReason
    });

    const visit = await prisma.$transaction(async (tx) => {
      const createdVisit = await tx.localVisit.create({
        data: {
          centerId,
          patientId: payload.patientId,
          doctorId:
            payload.doctorId ??
            (req.auth?.role === "DOCTOR" ? Number(req.auth.sub) : undefined),
          visitDate: payload.visitDate,
          visitTime: payload.visitTime,
          visitType: payload.visitType,
          symptoms: payload.symptoms,
          bloodPressure: payload.bloodPressure,
          temperature: payload.temperature,
          heartRate: payload.heartRate,
          diagnosis: payload.diagnosis,
          notes: payload.notes,
          syncState: "PENDING"
        }
      });

      for (const [index, prescription] of payload.prescriptions.entries()) {
        const verificationCode = createPrescriptionVerificationCode(centerId, createdVisit.id, index);
        const createdPrescription = await tx.localPrescription.create({
          data: {
            visitId: createdVisit.id,
            medicineName: prescription.medicineName,
            dosage: prescription.dosage,
            duration: prescription.duration,
            instructions: prescription.instructions,
            verificationCode,
            verificationHash: hashPrescriptionVerificationCode(verificationCode)
          }
        });

        await savePrescriptionWarnings(tx, {
          patientId: payload.patientId,
          prescriptionId: createdPrescription.id,
          prescriptionIndex: index,
          warnings: safetyWarnings,
          overridden: Boolean(payload.overridePrescriptionWarnings),
          overrideReason: payload.overrideReason
        });
      }

      return createdVisit;
    });

    await recordAuditLog(req, {
      action: "CREATE_VISIT",
      entityType: "LocalVisit",
      entityId: visit.id,
      centerId,
      newValue: {
        patientId: payload.patientId,
        doctorId: visit.doctorId,
        visitType: visit.visitType,
        prescriptionCount: payload.prescriptions.length
      }
    });

    res.status(201).json(visit);
  })
);

router.post(
  "/visits/:visitId/reports",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const visitId = Number(req.params.visitId);
    const payload = reportSchema.parse(req.body);

    const visit = await prisma.localVisit.findFirst({
      where: {
        id: visitId,
        centerId
      },
      select: {
        id: true,
        patientId: true
      }
    });

    if (!visit) {
      return res.status(404).json({ message: "تعذر العثور على الزيارة المطلوبة داخل هذا المركز." });
    }

    const reportSummary = payload.summary?.trim() || "رابط التقرير متاح للمريض.";

    const report = await prisma.localResultReport.create({
      data: {
        centerId,
        patientId: visit.patientId,
        visitId: visit.id,
        authorId: Number(req.auth?.sub),
        title: payload.title,
        category: payload.category,
        summary: reportSummary,
        reportUrl: payload.reportUrl,
        findings: payload.findings,
        recommendations: payload.recommendations,
        recommendedFollowUp: payload.recommendedFollowUp,
        shareWithPatient: payload.shareWithPatient,
        attachmentFileName: payload.attachment ? payload.attachment.fileName : null,
        attachmentMimeType: payload.attachment ? payload.attachment.mimeType : null,
        attachmentBase64: payload.attachment ? payload.attachment.contentBase64 : null
      }
    });

    await recordAuditLog(req, {
      action: "CREATE_RESULT_REPORT",
      entityType: "LocalResultReport",
      entityId: report.id,
      centerId,
      newValue: {
        visitId: visit.id,
        patientId: visit.patientId,
        category: report.category,
        reportUrl: report.reportUrl,
        shareWithPatient: report.shareWithPatient
      }
    });

    await notifyPatientAboutResultReport({
      centerId,
      patientId: visit.patientId,
      reportTitle: report.title,
      reportUrl: report.reportUrl,
      shareWithPatient: report.shareWithPatient
    });

    res.status(201).json(report);
  })
);

router.put(
  "/visits/:visitId/reports/:reportId",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const visitId = Number(req.params.visitId);
    const reportId = Number(req.params.reportId);
    const payload = reportSchema.parse(req.body);

    const existingReport = await prisma.localResultReport.findFirst({
      where: {
        id: reportId,
        visitId,
        centerId
      }
    });

    if (!existingReport) {
      return res.status(404).json({ message: "تعذر العثور على تقرير النتائج المطلوب." });
    }

    const reportSummary = payload.summary?.trim() || "رابط التقرير متاح للمريض.";

    const report = await prisma.localResultReport.update({
      where: {
        id: reportId
      },
      data: {
        title: payload.title,
        category: payload.category,
        summary: reportSummary,
        reportUrl: payload.reportUrl,
        findings: payload.findings,
        recommendations: payload.recommendations,
        recommendedFollowUp: payload.recommendedFollowUp,
        shareWithPatient: payload.shareWithPatient,
        attachmentFileName: payload.attachment ? payload.attachment.fileName : null,
        attachmentMimeType: payload.attachment ? payload.attachment.mimeType : null,
        attachmentBase64: payload.attachment ? payload.attachment.contentBase64 : null
      }
    });

    await recordAuditLog(req, {
      action: "UPDATE_RESULT_REPORT",
      entityType: "LocalResultReport",
      entityId: report.id,
      centerId,
      oldValue: {
        title: existingReport.title,
        category: existingReport.category,
        reportUrl: existingReport.reportUrl,
        shareWithPatient: existingReport.shareWithPatient
      },
      newValue: {
        title: report.title,
        category: report.category,
        reportUrl: report.reportUrl,
        shareWithPatient: report.shareWithPatient
      }
    });

    if (
      report.shareWithPatient &&
      report.reportUrl &&
      (!existingReport.shareWithPatient || existingReport.reportUrl !== report.reportUrl)
    ) {
      await notifyPatientAboutResultReport({
        centerId,
        patientId: existingReport.patientId,
        reportTitle: report.title,
        reportUrl: report.reportUrl,
        shareWithPatient: report.shareWithPatient
      });
    }

    res.json(report);
  })
);

router.delete(
  "/visits/:visitId/reports/:reportId",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const visitId = Number(req.params.visitId);
    const reportId = Number(req.params.reportId);

    const existingReport = await prisma.localResultReport.findFirst({
      where: {
        id: reportId,
        visitId,
        centerId
      }
    });

    if (!existingReport) {
      return res.status(404).json({ message: "تعذر العثور على تقرير النتائج المطلوب." });
    }

    await prisma.localResultReport.delete({
      where: {
        id: reportId
      }
    });

    await recordAuditLog(req, {
      action: "DELETE_RESULT_REPORT",
      entityType: "LocalResultReport",
      entityId: reportId,
      centerId,
      oldValue: {
        title: existingReport.title,
        category: existingReport.category,
        shareWithPatient: existingReport.shareWithPatient
      }
    });

    res.status(204).send();
  })
);

router.get(
  "/refill-requests",
  authorize("CENTER_MANAGER", "DOCTOR", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const patientId = typeof req.query.patientId === "string" ? Number(req.query.patientId) : undefined;
    const requestedStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    const where: Prisma.MedicationRefillRequestWhereInput = {
      centerId
    };

    if (patientId) {
      where.patientId = patientId;
    }

    if (requestedStatus) {
      if (!medicationRefillStatusValues.includes(requestedStatus as (typeof medicationRefillStatusValues)[number])) {
        throw new AppError("Medication refill status is not supported.", 400);
      }

      where.status = requestedStatus as (typeof medicationRefillStatusValues)[number];
    }

    if (req.auth?.role === "DOCTOR") {
      const actorId = getActorCenterUserId(req);
      where.OR = [
        {
          doctorId: actorId
        },
        {
          prescription: {
            visit: {
              doctorId: actorId
            }
          }
        }
      ];
    }

    const requests = await prisma.medicationRefillRequest.findMany({
      where,
      include: refillRequestInclude,
      orderBy: {
        requestedAt: "desc"
      }
    });

    res.json(requests.map(mapMedicationRefillRequest));
  })
);

router.patch(
  "/refill-requests/:requestId/doctor",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const requestId = parsePositiveParam(req.params.requestId, "Refill request ID");
    const payload = refillDecisionSchema.parse(req.body);
    const request = await prisma.medicationRefillRequest.findFirst({
      where: {
        id: requestId,
        centerId
      },
      include: refillRequestInclude
    });

    if (!request) {
      throw new AppError("Medication refill request was not found in this center.", 404);
    }

    if (request.status !== "REQUESTED") {
      throw new AppError("Only requested refills can be approved or rejected by the doctor.", 409);
    }

    if (
      req.auth?.role === "DOCTOR" &&
      request.prescription.visit.doctorId &&
      request.prescription.visit.doctorId !== actorId
    ) {
      throw new AppError("You can only manage refill requests for your own patients.", 403);
    }

    const updated = await prisma.medicationRefillRequest.update({
      where: {
        id: request.id
      },
      data:
        payload.decision === "APPROVE"
          ? {
              status: "DOCTOR_APPROVED",
              doctorId: actorId,
              notes: payload.notes
            }
          : {
              status: "REJECTED",
              doctorId: actorId,
              rejectionReason: payload.rejectionReason,
              notes: payload.notes
            },
      include: refillRequestInclude
    });

    await notifyLocalPatient({
      centerId,
      patientId: request.patientId,
      title: payload.decision === "APPROVE" ? "تمت الموافقة على تجديد الدواء" : "تم رفض طلب تجديد الدواء",
      body:
        payload.decision === "APPROVE"
          ? `وافق الطبيب على تجديد وصفة ${request.prescription.medicineName}. سيتم تجهيزها في الصيدلية.`
          : `تم رفض تجديد وصفة ${request.prescription.medicineName}. ${payload.rejectionReason}`,
      type: "SYSTEM"
    });

    if (payload.decision === "APPROVE") {
      await notifyRole({
        centerId,
        role: "PHARMACIST",
        type: "MEDICATION_REFILL_APPROVED",
        title: "تجديد دواء جاهز للصيدلية",
        message: `${request.patient.fullName} لديه وصفة ${request.prescription.medicineName} معتمدة للتجهيز.`
      });
    }

    await recordAuditLog(req, {
      action: payload.decision === "APPROVE" ? "APPROVE_REFILL_REQUEST" : "REJECT_REFILL_REQUEST",
      entityType: "MedicationRefillRequest",
      entityId: request.id,
      centerId,
      oldValue: {
        status: request.status
      },
      newValue: {
        status: updated.status,
        prescriptionId: updated.prescriptionId
      }
    });

    res.json(mapMedicationRefillRequest(updated));
  })
);

router.patch(
  "/refill-requests/:requestId/status",
  authorize("PHARMACIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const requestId = parsePositiveParam(req.params.requestId, "Refill request ID");
    const payload = refillPharmacyStatusSchema.parse(req.body);
    const request = await prisma.medicationRefillRequest.findFirst({
      where: {
        id: requestId,
        centerId
      },
      include: refillRequestInclude
    });

    if (!request) {
      throw new AppError("Medication refill request was not found in this center.", 404);
    }

    const allowedNextStatuses: Record<string, string[]> = {
      DOCTOR_APPROVED: ["PHARMACY_PREPARING"],
      PHARMACY_PREPARING: ["READY_FOR_PICKUP"],
      READY_FOR_PICKUP: ["COLLECTED"]
    };
    const allowed = allowedNextStatuses[request.status] ?? [];

    if (request.status !== payload.status && !allowed.includes(payload.status)) {
      throw new AppError("Medication refill status transition is not allowed.", 409);
    }

    const updated = await prisma.medicationRefillRequest.update({
      where: {
        id: request.id
      },
      data: {
        status: payload.status,
        pharmacyUserId: actorId,
        notes: payload.notes ?? request.notes
      },
      include: refillRequestInclude
    });

    if (payload.status === "READY_FOR_PICKUP" || payload.status === "COLLECTED") {
      await notifyLocalPatient({
        centerId,
        patientId: request.patientId,
        title: payload.status === "READY_FOR_PICKUP" ? "الدواء جاهز للاستلام" : "تم استلام الدواء",
        body:
          payload.status === "READY_FOR_PICKUP"
            ? `وصفة ${request.prescription.medicineName} جاهزة للاستلام من الصيدلية.`
            : `تم تحديث وصفة ${request.prescription.medicineName} كدواء مستلم.`,
        type: "SYSTEM"
      });
    }

    await recordAuditLog(req, {
      action: "UPDATE_REFILL_STATUS",
      entityType: "MedicationRefillRequest",
      entityId: request.id,
      centerId,
      oldValue: {
        status: request.status
      },
      newValue: {
        status: updated.status,
        pharmacyUserId: actorId
      }
    });

    res.json(mapMedicationRefillRequest(updated));
  })
);

router.get(
  "/follow-up-reminders",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const patientId = typeof req.query.patientId === "string" ? Number(req.query.patientId) : undefined;
    const requestedStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    const where: Prisma.FollowUpReminderWhereInput = {
      centerId
    };

    if (patientId) {
      where.patientId = patientId;
    }

    if (requestedStatus) {
      if (!followUpReminderStatusValues.includes(requestedStatus as (typeof followUpReminderStatusValues)[number])) {
        throw new AppError("Follow-up reminder status is not supported.", 400);
      }

      where.status = requestedStatus as (typeof followUpReminderStatusValues)[number];
    }

    if (req.auth?.role === "DOCTOR") {
      where.doctorId = getActorCenterUserId(req);
    }

    const reminders = await prisma.followUpReminder.findMany({
      where,
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

    res.json(reminders.map(mapFollowUpReminder));
  })
);

router.post(
  "/follow-up-reminders",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const payload = followUpReminderSchema.parse(req.body);
    const patient = await prisma.localPatient.findFirst({
      where: {
        id: payload.patientId,
        centerId
      }
    });

    if (!patient) {
      throw new AppError("Patient was not found in this center.", 404);
    }

    const doctorId = req.auth?.role === "DOCTOR" ? actorId : payload.doctorId ?? actorId;
    const doctor = await prisma.centerUserAccount.findFirst({
      where: {
        id: doctorId,
        centerId,
        role: "DOCTOR",
        isActive: true
      }
    });

    if (!doctor) {
      throw new AppError("A valid doctor account is required for follow-up reminders.", 400);
    }

    const visit = payload.visitId
      ? await prisma.localVisit.findFirst({
          where: {
            id: payload.visitId,
            centerId,
            patientId: payload.patientId
          }
        })
      : null;

    if (payload.visitId && !visit) {
      throw new AppError("Visit was not found for this patient in this center.", 404);
    }

    if (req.auth?.role === "DOCTOR") {
      const hasDoctorVisit = visit
        ? visit.doctorId === actorId
        : await prisma.localVisit.findFirst({
            where: {
              centerId,
              patientId: patient.id,
              doctorId: actorId
            },
            select: {
              id: true
            }
          });

      if (!hasDoctorVisit) {
        throw new AppError("You can only create follow-up reminders for your own patients.", 403);
      }
    }

    const reminder = await prisma.followUpReminder.create({
      data: {
        centerId,
        patientId: patient.id,
        doctorId,
        visitId: visit?.id,
        dueDate: payload.dueDate,
        reason: payload.reason,
        notes: payload.notes
      },
      include: followUpReminderInclude
    });

    await notifyLocalPatient({
      centerId,
      patientId: patient.id,
      title: "تذكير متابعة جديد",
      body: `تمت إضافة تذكير متابعة بتاريخ ${payload.dueDate.toISOString().slice(0, 10)}: ${payload.reason}`,
      type: "SYSTEM"
    });

    await recordAuditLog(req, {
      action: "CREATE_FOLLOW_UP_REMINDER",
      entityType: "FollowUpReminder",
      entityId: reminder.id,
      centerId,
      newValue: {
        patientId: patient.id,
        doctorId,
        dueDate: reminder.dueDate,
        status: reminder.status
      }
    });

    res.status(201).json(mapFollowUpReminder(reminder));
  })
);

router.patch(
  "/follow-up-reminders/:reminderId",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const reminderId = parsePositiveParam(req.params.reminderId, "Follow-up reminder ID");
    const payload = followUpReminderUpdateSchema.parse(req.body);
    const existing = await prisma.followUpReminder.findFirst({
      where: {
        id: reminderId,
        centerId
      },
      include: followUpReminderInclude
    });

    if (!existing) {
      throw new AppError("Follow-up reminder was not found in this center.", 404);
    }

    if (req.auth?.role === "DOCTOR" && existing.doctorId !== actorId) {
      throw new AppError("You can only update your own follow-up reminders.", 403);
    }

    const updateData: Prisma.FollowUpReminderUpdateInput = {
      ...(payload.dueDate ? { dueDate: payload.dueDate } : {}),
      ...(payload.reason ? { reason: payload.reason } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes } : {})
    };

    if (payload.status) {
      updateData.status = payload.status;
      updateData.completedAt = payload.status === "DONE" ? new Date() : payload.status === "PENDING" ? null : existing.completedAt;
      updateData.cancelledAt =
        payload.status === "CANCELLED" ? new Date() : payload.status === "PENDING" ? null : existing.cancelledAt;
    }

    const reminder = await prisma.followUpReminder.update({
      where: {
        id: existing.id
      },
      data: updateData,
      include: followUpReminderInclude
    });

    if (payload.status === "DONE" || payload.status === "CANCELLED") {
      await notifyLocalPatient({
        centerId,
        patientId: existing.patientId,
        title: payload.status === "DONE" ? "تم إكمال تذكير المتابعة" : "تم إلغاء تذكير المتابعة",
        body: `${existing.reason} - الحالة الجديدة: ${payload.status}`,
        type: "SYSTEM"
      });
    }

    await recordAuditLog(req, {
      action: "UPDATE_FOLLOW_UP_REMINDER",
      entityType: "FollowUpReminder",
      entityId: existing.id,
      centerId,
      oldValue: {
        status: existing.status,
        dueDate: existing.dueDate
      },
      newValue: {
        status: reminder.status,
        dueDate: reminder.dueDate
      }
    });

    res.json(mapFollowUpReminder(reminder));
  })
);

router.delete(
  "/follow-up-reminders/:reminderId",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const reminderId = parsePositiveParam(req.params.reminderId, "Follow-up reminder ID");
    const existing = await prisma.followUpReminder.findFirst({
      where: {
        id: reminderId,
        centerId
      }
    });

    if (!existing) {
      throw new AppError("Follow-up reminder was not found in this center.", 404);
    }

    if (req.auth?.role === "DOCTOR" && existing.doctorId !== actorId) {
      throw new AppError("You can only delete your own follow-up reminders.", 403);
    }

    await prisma.followUpReminder.delete({
      where: {
        id: existing.id
      }
    });

    await recordAuditLog(req, {
      action: "DELETE_FOLLOW_UP_REMINDER",
      entityType: "FollowUpReminder",
      entityId: existing.id,
      centerId,
      oldValue: {
        status: existing.status,
        dueDate: existing.dueDate
      }
    });

    res.status(204).send();
  })
);

router.get(
  "/referrals",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const doctorActorId = req.auth?.role === "DOCTOR" ? getActorCenterUserId(req) : null;
    const [referrals, outgoingReferralRequests, center] = await Promise.all([
      prisma.centralReferral.findMany({
        where: doctorActorId
          ? {
              toCenterId: centerId,
              assignedDoctorId: doctorActorId
            }
          : {
              OR: [{ fromCenterId: centerId }, { toCenterId: centerId }]
            },
        include: centralReferralInclude,
        orderBy: {
          requestedAt: "desc"
        }
      }),
      prisma.outgoingNotification.findMany({
        where: {
          centerId,
          notificationType: "REFERRAL_REQUEST",
          status: {
            in: ["PENDING", "PROCESSING", "FAILED"]
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      }),
      prisma.centralCenter.findUnique({
        where: { id: centerId }
      })
    ]);

    res.json(
      [
        ...referrals.map(mapCentralReferral),
        ...outgoingReferralRequests
          .filter((notification) => {
            if (!doctorActorId) {
              return true;
            }

            const payload = notification.payload as Record<string, unknown>;
            return Number(payload.created_by_center_user_id) === doctorActorId;
          })
          .map((notification) => {
          const payload = notification.payload as Record<string, unknown>;

          return {
            id: -notification.id,
            patientName: String(payload.patient_unified_id ?? "مريض"),
            patientUnifiedId: String(payload.patient_unified_id ?? ""),
            fromCenter: center?.centerName ?? "المركز الحالي",
            toCenter: "بانتظار المطابقة المركزية",
            requiredSpecialty: String(payload.required_specialty ?? "-"),
            priority: String(payload.priority ?? "NORMAL"),
            status: notification.status,
            reason: String(payload.reason ?? "طلب الإحالة في قائمة المعالجة المركزية."),
            selectedCenterReason: null,
            rejectionReason: notification.lastError,
            managerDecisionReason: null,
            matchingScore: null,
            estimatedWaitTimeMinutes: null,
            requestedAt: notification.createdAt,
            respondedAt: notification.sentAt,
            decisionAt: null,
            assignedAt: null,
            visitCreatedAt: null,
            completedAt: null,
            notesFromSender: payload.notes_from_sender ? String(payload.notes_from_sender) : null,
            notesFromReceiver: null,
            assignedDoctor: null,
            acceptedByManager: null,
            rejectedByManager: null,
            createdVisitId: null
          };
        })
      ].sort((left, right) => new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime())
    );
  })
);

router.post(
  "/referrals/request",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const payload = referralSchema.parse(req.body);

    let patientUnifiedId = payload.patientUnifiedId;

    if (!patientUnifiedId && payload.localPatientId) {
      const localPatient = await prisma.localPatient.findUnique({
        where: { id: payload.localPatientId }
      });
      patientUnifiedId = localPatient?.unifiedId ?? undefined;
    }

    if (!patientUnifiedId) {
      return res.status(400).json({ message: "الرقم الموحد للمريض مطلوب لإنشاء طلب الإحالة." });
    }

    const queueItem = await enqueueOutgoingNotification(centerId, "REFERRAL_REQUEST", {
      patient_unified_id: patientUnifiedId,
      required_specialty: payload.requiredSpecialty,
      priority: payload.priority,
      reason: payload.reason,
      requires_or: payload.requiresOr,
      required_medicine_ids: payload.requiredMedicineIds,
      preferred_region: payload.preferredRegion,
      max_distance_km: payload.maxDistanceKm,
      notes_from_sender: payload.notesFromSender,
      created_by_center_user_id: actorId
    });

    if (payload.processNow) {
      await processOutgoingNotifications(centerId);
    }

    await Promise.all([
      notifyRole({
        centerId,
        role: "CENTER_MANAGER",
        type: "REFERRAL_CREATED",
        title: "تم إرسال طلب إحالة",
        message: `تم إرسال طلب إحالة إلى ${payload.requiredSpecialty} عبر المحرك المركزي.`
      }),
      recordAuditLog(req, {
        action: "REFERRAL_CREATED",
        entityType: "OutgoingNotification",
        entityId: queueItem.id,
        centerId,
        newValue: {
          patientUnifiedId,
          requiredSpecialty: payload.requiredSpecialty,
          priority: payload.priority
        }
      })
    ]);

    res.status(201).json(queueItem);
  })
);

router.get(
  "/referrals/incoming",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const referrals = await prisma.centralReferral.findMany({
      where: {
        toCenterId: centerId,
        status: {
          in: [...receivingInboxStatuses]
        }
      },
      include: centralReferralInclude,
      orderBy: {
        requestedAt: "desc"
      }
    });

    res.json(referrals.map(mapCentralReferral));
  })
);

router.get(
  "/referrals/assigned-to-me",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const referrals = await prisma.centralReferral.findMany({
      where: {
        toCenterId: centerId,
        assignedDoctorId: actorId,
        status: {
          in: ["ASSIGNED_TO_DOCTOR", "VISIT_CREATED", "COMPLETED"]
        }
      },
      include: centralReferralInclude,
      orderBy: [{ assignedAt: "desc" }, { requestedAt: "desc" }]
    });

    res.json(referrals.map(mapCentralReferral));
  })
);

router.post(
  "/referrals/:referralId/manager-accept",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const referralId = parsePositiveParam(req.params.referralId, "Referral ID");
    const existing = await prisma.centralReferral.findUnique({
      where: { id: referralId },
      include: centralReferralInclude
    });

    if (!existing || existing.toCenterId !== centerId) {
      throw new AppError("هذه الإحالة غير موجهة إلى مركزك.", 403);
    }

    if (!receivingReviewStatuses.includes(existing.status as (typeof receivingReviewStatuses)[number])) {
      throw new AppError("لا يمكن قبول هذه الإحالة في حالتها الحالية.", 400);
    }

    const referral = await prisma.centralReferral.update({
      where: { id: existing.id },
      data: {
        status: "RECEIVING_MANAGER_ACCEPTED",
        acceptedByManagerId: actorId,
        rejectedByManagerId: null,
        managerDecisionReason: null,
        decisionAt: new Date()
      },
      include: centralReferralInclude
    });

    await Promise.all([
      notifyRole({
        centerId: referral.fromCenterId,
        role: "CENTER_MANAGER",
        type: "REFERRAL_MANAGER_ACCEPTED",
        title: "تم قبول الإحالة من المركز المستقبل",
        message: `قبل مركز ${referral.toCenter?.centerName ?? "الاستقبال"} إحالة ${referral.patient.fullName}. [[target:/referrals?referralId=${referral.id}]]`
      }),
      recordAuditLog(req, {
        action: "REFERRAL_MANAGER_ACCEPTED",
        entityType: "CentralReferral",
        entityId: referral.id,
        centerId,
        oldValue: { status: existing.status },
        newValue: { status: referral.status, acceptedByManagerId: actorId }
      })
    ]);

    res.json(mapCentralReferral(referral));
  })
);

router.post(
  "/referrals/:referralId/manager-reject",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const referralId = parsePositiveParam(req.params.referralId, "Referral ID");
    const payload = referralRejectSchema.parse(req.body);
    const existing = await prisma.centralReferral.findUnique({
      where: { id: referralId },
      include: centralReferralInclude
    });

    if (!existing || existing.toCenterId !== centerId) {
      throw new AppError("هذه الإحالة غير موجهة إلى مركزك.", 403);
    }

    if (!receivingReviewStatuses.includes(existing.status as (typeof receivingReviewStatuses)[number])) {
      throw new AppError("لا يمكن رفض هذه الإحالة في حالتها الحالية.", 400);
    }

    const referral = await prisma.centralReferral.update({
      where: { id: existing.id },
      data: {
        status: "RECEIVING_MANAGER_REJECTED",
        rejectedByManagerId: actorId,
        acceptedByManagerId: null,
        managerDecisionReason: payload.reason,
        rejectionReason: payload.reason,
        decisionAt: new Date()
      },
      include: centralReferralInclude
    });

    await Promise.all([
      notifyRole({
        centerId: referral.fromCenterId,
        role: "CENTER_MANAGER",
        type: "REFERRAL_MANAGER_REJECTED",
        title: "تم رفض الإحالة من المركز المستقبل",
        message: `رفض مركز ${referral.toCenter?.centerName ?? "الاستقبال"} إحالة ${referral.patient.fullName}. السبب: ${payload.reason} [[target:/referrals?referralId=${referral.id}]]`
      }),
      recordAuditLog(req, {
        action: "REFERRAL_MANAGER_REJECTED",
        entityType: "CentralReferral",
        entityId: referral.id,
        centerId,
        oldValue: { status: existing.status },
        newValue: { status: referral.status, rejectedByManagerId: actorId }
      })
    ]);

    res.json(mapCentralReferral(referral));
  })
);

router.post(
  "/referrals/:referralId/assign-doctor",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const referralId = parsePositiveParam(req.params.referralId, "Referral ID");
    const payload = referralAssignDoctorSchema.parse(req.body);
    const [existing, doctor] = await Promise.all([
      prisma.centralReferral.findUnique({
        where: { id: referralId },
        include: centralReferralInclude
      }),
      prisma.centerUserAccount.findFirst({
        where: {
          id: payload.doctorId,
          centerId,
          role: "DOCTOR",
          isActive: true
        },
        include: {
          doctorProfile: true
        }
      })
    ]);

    if (!existing || existing.toCenterId !== centerId) {
      throw new AppError("هذه الإحالة غير موجهة إلى مركزك.", 403);
    }

    if (existing.status !== "RECEIVING_MANAGER_ACCEPTED") {
      throw new AppError("يجب قبول الإحالة من المدير قبل إسنادها لطبيب.", 400);
    }

    if (!doctor) {
      throw new AppError("الطبيب المحدد غير موجود داخل مركزك.", 400);
    }

    const specialtyMatches =
      doctor.doctorProfile?.specialization?.toLowerCase().includes(existing.requiredSpecialty.toLowerCase()) ||
      existing.requiredSpecialty.toLowerCase().includes(doctor.doctorProfile?.specialization?.toLowerCase() ?? "");

    const referral = await prisma.centralReferral.update({
      where: { id: existing.id },
      data: {
        status: "ASSIGNED_TO_DOCTOR",
        assignedDoctorId: doctor.id,
        assignedAt: new Date(),
        notesFromReceiver: specialtyMatches
          ? existing.notesFromReceiver
          : [
              existing.notesFromReceiver,
              `تم الإسناد إلى ${doctor.fullName}. التخصص المسجل للطبيب: ${doctor.doctorProfile?.specialization ?? "غير محدد"}.`
            ]
              .filter(Boolean)
              .join("\n")
      },
      include: centralReferralInclude
    });

    await Promise.all([
      notifyRole({
        centerId,
        role: "DOCTOR",
        type: "REFERRAL_ASSIGNED_TO_DOCTOR",
        title: "إحالة مسندة لطبيب",
        message: `تم إسناد إحالة ${referral.patient.fullName} إلى ${doctor.fullName}. [[target:/referrals?view=assigned&referralId=${referral.id}]]`
      }),
      notifyRole({
        centerId: referral.fromCenterId,
        role: "CENTER_MANAGER",
        type: "REFERRAL_ASSIGNED_TO_DOCTOR",
        title: "تم إسناد الإحالة لطبيب",
        message: `تم إسناد إحالة ${referral.patient.fullName} إلى طبيب في ${referral.toCenter?.centerName ?? "المركز المستقبل"}. [[target:/referrals?referralId=${referral.id}]]`
      }),
      recordAuditLog(req, {
        action: "REFERRAL_ASSIGNED_TO_DOCTOR",
        entityType: "CentralReferral",
        entityId: referral.id,
        centerId,
        oldValue: { status: existing.status, assignedDoctorId: existing.assignedDoctorId },
        newValue: { status: referral.status, assignedDoctorId: doctor.id, specialtyMatches }
      })
    ]);

    res.json(mapCentralReferral(referral));
  })
);

router.post(
  "/referrals/:referralId/start-visit",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const referralId = parsePositiveParam(req.params.referralId, "Referral ID");
    const payload = referralStartVisitSchema.parse(req.body);
    const existing = await prisma.centralReferral.findUnique({
      where: { id: referralId },
      include: centralReferralInclude
    });

    if (!existing || existing.toCenterId !== centerId || existing.assignedDoctorId !== actorId) {
      throw new AppError("لا يمكنك بدء زيارة لإحالة غير مسندة لك.", 403);
    }

    if (existing.createdVisit) {
      res.json({
        referral: mapCentralReferral(existing),
        visitId: existing.createdVisit.id
      });
      return;
    }

    if (existing.status !== "ASSIGNED_TO_DOCTOR") {
      throw new AppError("لا يمكن بدء الزيارة قبل إسناد الإحالة للطبيب.", 400);
    }

    let localPatient = await prisma.localPatient.findFirst({
      where: {
        centerId,
        OR: [{ unifiedPatientId: existing.patientId }, { unifiedId: existing.patient.unifiedId }]
      }
    });

    if (!localPatient) {
      localPatient = await prisma.localPatient.create({
        data: {
          centerId,
          unifiedPatientId: existing.patientId,
          unifiedId: existing.patient.unifiedId,
          fullName: existing.patient.fullName,
          dateOfBirth: existing.patient.dateOfBirth,
          gender: existing.patient.gender,
          phone: existing.patient.primaryPhone,
          address: existing.patient.address,
          emergencyContact: existing.patient.secondaryPhone,
          bloodType: existing.patient.bloodType,
          allergies: existing.patient.allergies,
          chronicDiseases: existing.patient.chronicDiseases,
          createdLocally: false
        }
      });
    }

    const now = new Date();
    const visit = await prisma.localVisit.create({
      data: {
        centerId,
        patientId: localPatient.id,
        doctorId: actorId,
        visitDate: now,
        visitTime: now.toTimeString().slice(0, 5),
        visitType: payload.visitType,
        symptoms: payload.symptoms,
        diagnosis: payload.diagnosis || `زيارة إحالة إلى ${existing.requiredSpecialty}`,
        notes: [
          `زيارة محوّلة من: ${existing.fromCenter.centerName}`,
          `سبب الإحالة: ${existing.reason}`,
          `التخصص المطلوب: ${existing.requiredSpecialty}`,
          payload.notes
        ]
          .filter(Boolean)
          .join("\n"),
        priority: existing.priority,
        workflowStatus: "IN_TREATMENT",
        visitSource: "REFERRAL",
        referralId: existing.id
      }
    });

    const referral = await prisma.centralReferral.update({
      where: { id: existing.id },
      data: {
        status: "VISIT_CREATED",
        visitCreatedAt: now
      },
      include: centralReferralInclude
    });

    await Promise.all([
      notifyRole({
        centerId: referral.fromCenterId,
        role: "CENTER_MANAGER",
        type: "REFERRAL_VISIT_CREATED",
        title: "تم بدء زيارة الإحالة",
        message: `بدأ الطبيب زيارة محوّلة للمريض ${referral.patient.fullName} في ${referral.toCenter?.centerName ?? "المركز المستقبل"}. [[target:/referrals?referralId=${referral.id}]]`
      }),
      recordAuditLog(req, {
        action: "REFERRAL_VISIT_CREATED",
        entityType: "CentralReferral",
        entityId: referral.id,
        centerId,
        oldValue: { status: existing.status },
        newValue: { status: referral.status, visitId: visit.id }
      })
    ]);

    res.status(201).json({
      referral: mapCentralReferral(referral),
      visitId: visit.id
    });
  })
);

router.post(
  "/referrals/:referralId/complete",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const referralId = parsePositiveParam(req.params.referralId, "Referral ID");
    const existing = await prisma.centralReferral.findUnique({
      where: { id: referralId },
      include: centralReferralInclude
    });

    if (!existing || existing.toCenterId !== centerId) {
      throw new AppError("هذه الإحالة غير موجهة إلى مركزك.", 403);
    }

    if (req.auth?.role === "DOCTOR" && existing.assignedDoctorId !== actorId) {
      throw new AppError("يمكن للطبيب إنهاء الإحالات المسندة إليه فقط.", 403);
    }

    if (!["VISIT_CREATED", "ASSIGNED_TO_DOCTOR", "COMPLETED"].includes(existing.status)) {
      throw new AppError("لا يمكن إنهاء الإحالة في حالتها الحالية.", 400);
    }

    if (existing.status === "COMPLETED") {
      res.json(mapCentralReferral(existing));
      return;
    }

    const referral = await prisma.centralReferral.update({
      where: { id: existing.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date()
      },
      include: centralReferralInclude
    });

    await Promise.all([
      notifyRole({
        centerId: referral.fromCenterId,
        role: "CENTER_MANAGER",
        type: "REFERRAL_COMPLETED",
        title: "اكتملت الإحالة",
        message: `تم إغلاق إحالة ${referral.patient.fullName} في ${referral.toCenter?.centerName ?? "المركز المستقبل"}. [[target:/referrals?referralId=${referral.id}]]`
      }),
      recordAuditLog(req, {
        action: "REFERRAL_COMPLETED",
        entityType: "CentralReferral",
        entityId: referral.id,
        centerId,
        oldValue: { status: existing.status },
        newValue: { status: referral.status, completedAt: referral.completedAt }
      })
    ]);

    res.json(mapCentralReferral(referral));
  })
);

router.get(
  "/lab",
  authorize("CENTER_MANAGER", "DOCTOR", "LAB_TECH"),
  asyncHandler(async (req, res) => {
    res.json(await getCenterLabData(getCenterId(req)));
  })
);

router.post(
  "/lab/requests",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const payload = labRequestSchema.parse(req.body);

    const [patient, test, visit] = await Promise.all([
      prisma.localPatient.findFirst({
        where: {
          id: payload.patientId,
          centerId
        }
      }),
      prisma.labTestLocal.findFirst({
        where: {
          id: payload.testId,
          centerId
        }
      }),
      payload.visitId
        ? prisma.localVisit.findFirst({
            where: {
              id: payload.visitId,
              centerId
            }
          })
        : Promise.resolve(null)
    ]);

    if (!patient) {
      throw new AppError("المريض غير موجود داخل هذا المركز.", 404);
    }

    if (!test) {
      throw new AppError("الفحص المخبري غير موجود داخل هذا المركز.", 404);
    }

    if (payload.visitId && !visit) {
      throw new AppError("ملف الزيارة غير موجود داخل هذا المركز.", 404);
    }

    if (visit && visit.patientId !== payload.patientId) {
      throw new AppError("طلب المختبر يجب أن يرتبط بنفس مريض الزيارة.", 400);
    }

    if (visit?.doctorId && visit.doctorId !== actorId) {
      throw new AppError("لا يمكنك إنشاء طلب مختبر على زيارة طبيب آخر.", 403);
    }

    const requestRecord = await prisma.$transaction(async (tx) => {
      const created = await tx.labRequestLocal.create({
        data: {
          centerId,
          patientId: payload.patientId,
          doctorId: actorId,
          visitId: payload.visitId,
          testId: payload.testId,
          status: "NEW",
          priority: payload.priority,
          reason: payload.reason,
          clinicalNotes: payload.clinicalNotes,
          sampleType: payload.sampleType,
          fastingRequired: payload.fastingRequired,
          externalTest: payload.externalTest,
          normalRange: test.normalRange
        },
        include: labRequestDetailInclude
      });

      if (payload.visitId) {
        const existingTask = await tx.visitWorkflowTask.findFirst({
          where: {
            visitId: payload.visitId,
            taskType: "LAB_TEST",
            status: {
              in: ["PENDING", "IN_PROGRESS"]
            }
          }
        });

        if (!existingTask) {
          await tx.visitWorkflowTask.create({
            data: {
              visitId: payload.visitId,
              taskType: "LAB_TEST",
              assignedRole: "LAB_TECH",
              instructions: "تنفيذ طلب المختبر وإرسال النتيجة للطبيب."
            }
          });
        }
      }

      return created;
    });

    await notifyRole({
      centerId,
      role: "LAB_TECH",
      type: "LAB_REQUEST_CREATED",
      title: "طلب فحص مخبري جديد",
      message: `${patient.fullName} لديه طلب ${test.testName}. [[target:/lab?highlight=lab-request-${requestRecord.id}]]`,
      severity: payload.priority === "NORMAL" ? "INFO" : "WARNING"
    });

    await recordAuditLog(req, {
      action: "LAB_REQUEST_CREATED",
      entityType: "LabRequestLocal",
      entityId: requestRecord.id,
      centerId,
      newValue: {
        centerId,
        patientId: payload.patientId,
        doctorId: actorId,
        visitId: payload.visitId,
        testId: payload.testId,
        priority: payload.priority,
        status: requestRecord.status
      }
    });

    res.status(201).json(requestRecord);
  })
);

router.patch(
  "/lab/requests/:requestId/status",
  authorize("LAB_TECH"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const requestId = parsePositiveParam(req.params.requestId, "Lab request ID");
    const payload = labStatusUpdateSchema.parse(req.body);
    const existing = await findLabRequest(centerId, requestId);

    if (!existing) {
      throw new AppError("طلب المختبر غير موجود داخل هذا المركز.", 404);
    }

    if (["SENT_TO_DOCTOR", "PUBLISHED_TO_PATIENT"].includes(existing.status)) {
      throw new AppError("لا يمكن تعديل طلب مختبر تم إرساله للطبيب أو نشره للمريض.", 409);
    }

    if (payload.status === "INVALID_SAMPLE" && !payload.note) {
      throw new AppError("يجب توضيح سبب رفض أو تلف العينة.", 400);
    }

    const record = await prisma.labRequestLocal.update({
      where: { id: requestId },
      data: {
        status: payload.status,
        completedById: actorId,
        resultNotes: payload.note ?? existing.resultNotes
      },
      include: labRequestDetailInclude
    });

    await recordAuditLog(req, {
      action: payload.status === "SAMPLE_RECEIVED" ? "LAB_SAMPLE_RECEIVED" : "LAB_REQUEST_STATUS_UPDATED",
      entityType: "LabRequestLocal",
      entityId: record.id,
      centerId,
      oldValue: {
        status: existing.status
      },
      newValue: {
        status: record.status,
        note: payload.note
      }
    });

    res.json(record);
  })
);

router.patch(
  "/lab/requests/:requestId/result",
  authorize("LAB_TECH"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const requestId = parsePositiveParam(req.params.requestId, "Lab request ID");
    const payload = labResultSchema.parse(req.body);
    const existing = await findLabRequest(centerId, requestId);

    if (!existing) {
      throw new AppError("طلب المختبر غير موجود داخل هذا المركز.", 404);
    }

    if (["SENT_TO_DOCTOR", "PUBLISHED_TO_PATIENT"].includes(existing.status)) {
      throw new AppError("لا يمكن تعديل النتيجة بعد إرسالها للطبيب إلا إذا أعادها للتصحيح.", 409);
    }

    const nextStatus =
      payload.action === "SEND_TO_DOCTOR"
        ? "SENT_TO_DOCTOR"
        : payload.action === "MARK_READY"
          ? "RESULT_READY"
          : "IN_PROGRESS";
    const now = new Date();

    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.labRequestLocal.update({
        where: { id: requestId },
        data: {
          resultValue: payload.resultValue,
          resultNotes: payload.resultNotes,
          unit: payload.unit,
          normalRange: payload.normalRange,
          abnormalFlag: payload.abnormalFlag,
          criticalNote: payload.criticalNote,
          reportUrl: payload.reportUrl,
          imageUrl: payload.imageUrl,
          doctorNotes: payload.doctorNotes,
          resultFileName: payload.resultFileName,
          resultMimeType: payload.resultMimeType,
          resultBase64: payload.resultBase64,
          status: nextStatus,
          completedById: actorId,
          resultDate: now,
          sentToDoctorAt: nextStatus === "SENT_TO_DOCTOR" ? now : existing.sentToDoctorAt,
          correctionReason: nextStatus === "SENT_TO_DOCTOR" ? null : existing.correctionReason
        },
        include: labRequestDetailInclude
      });

      if (nextStatus === "SENT_TO_DOCTOR" && updated.visitId) {
        await completeLabWorkflowTaskIfReady(tx, updated.visitId, actorId, payload.resultNotes ?? payload.resultValue);
      }

      return updated;
    });

    await recordAuditLog(req, {
      action: "LAB_RESULT_DRAFTED",
      entityType: "LabRequestLocal",
      entityId: record.id,
      centerId,
      oldValue: {
        status: existing.status
      },
      newValue: {
        status: record.status,
        abnormalFlag: record.abnormalFlag,
        hasReportUrl: Boolean(record.reportUrl),
        hasImageUrl: Boolean(record.imageUrl),
        hasAttachment: Boolean(record.resultFileName)
      }
    });

    if (record.abnormalFlag === "CRITICAL") {
      await recordAuditLog(req, {
        action: "LAB_RESULT_MARKED_CRITICAL",
        entityType: "LabRequestLocal",
        entityId: record.id,
        centerId,
        newValue: {
          criticalNote: record.criticalNote
        }
      });

      await notifyRole({
        centerId,
        role: "DOCTOR",
        type: "CRITICAL_LAB_RESULT",
        title: "نتيجة مختبر حرجة",
        message: `نتيجة ${record.test.testName} للمريض ${record.patient.fullName} حرجة وتحتاج مراجعة عاجلة. [[target:/visit-workflow?highlight=lab-result-${record.id}]]`,
        severity: "ERROR"
      });
      await notifyRole({
        centerId,
        role: "CENTER_MANAGER",
        type: "CRITICAL_LAB_RESULT",
        title: "نتيجة مختبر حرجة",
        message: `تم تعليم نتيجة ${record.test.testName} كحرجة للمريض ${record.patient.fullName}. [[target:/lab?critical=1&highlight=lab-request-${record.id}]]`,
        severity: "ERROR"
      });
    }

    if (nextStatus === "SENT_TO_DOCTOR") {
      await recordAuditLog(req, {
        action: "LAB_RESULT_SENT_TO_DOCTOR",
        entityType: "LabRequestLocal",
        entityId: record.id,
        centerId,
        newValue: {
          status: record.status,
          sentToDoctorAt: record.sentToDoctorAt
        }
      });

      await notifyRole({
        centerId,
        role: "DOCTOR",
        type: "LAB_RESULT_READY",
        title: "نتيجة مختبر جاهزة للمراجعة",
        message: `نتيجة ${record.test.testName} للمريض ${record.patient.fullName} جاهزة للمراجعة. [[target:/visit-workflow?highlight=lab-result-${record.id}]]`,
        severity: record.abnormalFlag === "CRITICAL" || record.priority === "CRITICAL" ? "ERROR" : "INFO"
      });
    }

    res.json(record);
  })
);

router.post(
  "/lab/requests/:requestId/send-to-doctor",
  authorize("LAB_TECH"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const requestId = parsePositiveParam(req.params.requestId, "Lab request ID");
    const existing = await findLabRequest(centerId, requestId);

    if (!existing) {
      throw new AppError("طلب المختبر غير موجود داخل هذا المركز.", 404);
    }

    if (["SENT_TO_DOCTOR", "PUBLISHED_TO_PATIENT"].includes(existing.status)) {
      return res.json(existing);
    }

    if (!hasLabResultContent(existing)) {
      throw new AppError("يجب إدخال نتيجة أو رابط/ملف التقرير قبل الإرسال للطبيب.", 400);
    }

    if (existing.abnormalFlag === "CRITICAL" && !existing.criticalNote) {
      throw new AppError("يجب إضافة ملاحظة للحالة الحرجة قبل إرسال النتيجة.", 400);
    }

    const now = new Date();
    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.labRequestLocal.update({
        where: { id: requestId },
        data: {
          status: "SENT_TO_DOCTOR",
          completedById: actorId,
          sentToDoctorAt: now,
          resultDate: existing.resultDate ?? now,
          correctionReason: null
        },
        include: labRequestDetailInclude
      });

      if (updated.visitId) {
        await completeLabWorkflowTaskIfReady(tx, updated.visitId, actorId, updated.resultNotes ?? updated.resultValue);
      }

      return updated;
    });

    await notifyRole({
      centerId,
      role: "DOCTOR",
      type: "LAB_RESULT_READY",
      title: "نتيجة مختبر جاهزة للمراجعة",
      message: `نتيجة ${record.test.testName} للمريض ${record.patient.fullName} جاهزة للمراجعة. [[target:/visit-workflow?highlight=lab-result-${record.id}]]`,
      severity: record.abnormalFlag === "CRITICAL" || record.priority === "CRITICAL" ? "ERROR" : "INFO"
    });

    await recordAuditLog(req, {
      action: "LAB_RESULT_SENT_TO_DOCTOR",
      entityType: "LabRequestLocal",
      entityId: record.id,
      centerId,
      oldValue: {
        status: existing.status
      },
      newValue: {
        status: record.status,
        sentToDoctorAt: record.sentToDoctorAt
      }
    });

    res.json(record);
  })
);

router.post(
  "/lab/requests/:requestId/publish",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const actorId = getActorCenterUserId(req);
    const requestId = parsePositiveParam(req.params.requestId, "Lab request ID");
    const payload = labPublishSchema.parse(req.body);
    const existing = await findLabRequest(centerId, requestId);

    assertDoctorCanUseLabRequest(req, existing);

    if (!existing) {
      throw new AppError("طلب المختبر غير موجود داخل هذا المركز.", 404);
    }

    if (!existing.visitId) {
      throw new AppError("لا يمكن نشر نتيجة للمريض بدون ربطها بزيارة حقيقية.", 400);
    }

    if (!["SENT_TO_DOCTOR", "COMPLETED"].includes(existing.status)) {
      throw new AppError("يجب إرسال نتيجة المختبر للطبيب قبل نشرها للمريض.", 409);
    }

    if (!hasLabResultContent(existing)) {
      throw new AppError("لا توجد نتيجة مختبر قابلة للنشر.", 400);
    }

    const reportSummary =
      payload.patientNotes ||
      existing.resultValue ||
      existing.resultNotes ||
      `نتيجة فحص ${existing.test.testName} متاحة في السجل الصحي.`;
    const findings = [
      existing.resultValue ? `Result: ${existing.resultValue}` : null,
      existing.unit ? `Unit: ${existing.unit}` : null,
      existing.normalRange ? `Normal range: ${existing.normalRange}` : null,
      existing.resultNotes ? `Notes: ${existing.resultNotes}` : null,
      existing.reportUrl ? `Report URL: ${existing.reportUrl}` : null,
      existing.imageUrl ? `Image URL: ${existing.imageUrl}` : null
    ]
      .filter(Boolean)
      .join("\n");

    const record = await prisma.$transaction(async (tx) => {
      const reportData = {
        centerId,
        patientId: existing.patientId,
        visitId: existing.visitId!,
        authorId: actorId,
        title: `نتيجة ${existing.test.testName}`,
        category: "LAB",
        summary: reportSummary,
        reportUrl: existing.reportUrl,
        findings,
        recommendations: payload.doctorNotes,
        recommendedFollowUp: null,
        shareWithPatient: true,
        attachmentFileName: existing.resultFileName,
        attachmentMimeType: existing.resultMimeType,
        attachmentBase64: existing.resultBase64
      };

      const report = existing.resultReportId
        ? await tx.localResultReport.update({
            where: {
              id: existing.resultReportId
            },
            data: reportData
          })
        : await tx.localResultReport.create({
            data: reportData
          });

      const updated = await tx.labRequestLocal.update({
        where: {
          id: requestId
        },
        data: {
          status: "PUBLISHED_TO_PATIENT",
          doctorNotes: payload.doctorNotes,
          patientNotes: payload.patientNotes,
          resultReportId: report.id,
          publishedToPatientAt: new Date()
        },
        include: labRequestDetailInclude
      });

      return { updated, report };
    });

    await notifyPatientAboutResultReport({
      centerId,
      patientId: existing.patientId,
      reportTitle: record.report.title,
      reportUrl: record.report.reportUrl,
      shareWithPatient: true,
      targetPath: `/medical-record?highlight=lab-report-${record.report.id}`
    });

    await recordAuditLog(req, {
      action: "LAB_RESULT_PUBLISHED_TO_PATIENT",
      entityType: "LabRequestLocal",
      entityId: record.updated.id,
      centerId,
      oldValue: {
        status: existing.status
      },
      newValue: {
        status: record.updated.status,
        resultReportId: record.report.id,
        publishedToPatientAt: record.updated.publishedToPatientAt
      }
    });

    res.json(record.updated);
  })
);

router.post(
  "/lab/requests/:requestId/return-correction",
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const requestId = parsePositiveParam(req.params.requestId, "Lab request ID");
    const payload = labCorrectionSchema.parse(req.body);
    const existing = await findLabRequest(centerId, requestId);

    assertDoctorCanUseLabRequest(req, existing);

    if (!existing) {
      throw new AppError("طلب المختبر غير موجود داخل هذا المركز.", 404);
    }

    if (!["SENT_TO_DOCTOR", "RESULT_READY", "COMPLETED"].includes(existing.status)) {
      throw new AppError("يمكن إرجاع نتيجة جاهزة فقط للتصحيح.", 409);
    }

    const record = await prisma.labRequestLocal.update({
      where: {
        id: requestId
      },
      data: {
        status: "NEEDS_CORRECTION",
        correctionReason: payload.reason,
        doctorNotes: payload.reason
      },
      include: labRequestDetailInclude
    });

    await notifyRole({
      centerId,
      role: "LAB_TECH",
      type: "LAB_RESULT_NEEDS_CORRECTION",
      title: "نتيجة مختبر بحاجة للتصحيح",
      message: `طلب ${record.test.testName} للمريض ${record.patient.fullName} أعاده الطبيب للتصحيح. [[target:/lab?highlight=lab-request-${record.id}]]`,
      severity: "WARNING"
    });

    await recordAuditLog(req, {
      action: "LAB_RESULT_RETURNED_FOR_CORRECTION",
      entityType: "LabRequestLocal",
      entityId: record.id,
      centerId,
      oldValue: {
        status: existing.status
      },
      newValue: {
        status: record.status,
        correctionReason: record.correctionReason
      }
    });

    res.json(record);
  })
);

router.patch(
  "/lab/requests/:requestId",
  authorize("LAB_TECH"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const requestId = parsePositiveParam(req.params.requestId, "Lab request ID");
    const status = labStatusSchema.optional().parse(req.body.status);

    if (!status) {
      throw new AppError("يجب إرسال حالة طلب المختبر.", 400);
    }

    const existing = await findLabRequest(centerId, requestId);

    if (!existing) {
      throw new AppError("طلب المختبر غير موجود داخل هذا المركز.", 404);
    }

    const record = await prisma.labRequestLocal.update({
      where: {
        id: requestId
      },
      data: {
        status,
        resultValue: typeof req.body.resultValue === "string" ? req.body.resultValue : existing.resultValue,
        resultDate: ["COMPLETED", "RESULT_READY", "SENT_TO_DOCTOR"].includes(status) ? new Date() : existing.resultDate
      },
      include: labRequestDetailInclude
    });

    await recordAuditLog(req, {
      action: "LAB_REQUEST_STATUS_UPDATED",
      entityType: "LabRequestLocal",
      entityId: record.id,
      centerId,
      oldValue: {
        status: existing.status
      },
      newValue: {
        status: record.status
      }
    });

    res.json(record);
  })
);

router.get(
  "/pharmacy",
  authorize("CENTER_MANAGER", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    res.json(await getCenterPharmacyData(getCenterId(req)));
  })
);

router.get(
  "/notifications",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "LAB_TECH", "PHARMACIST", "NURSE"),
  asyncHandler(async (req, res) => {
    res.json(await getCenterNotifications(getCenterId(req)));
  })
);

router.get(
  "/notifications/unread-count",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "LAB_TECH", "PHARMACIST", "NURSE"),
  asyncHandler(async (req, res) => {
    const count = await prisma.centerSystemAlert.count({
      where: {
        centerId: getCenterId(req),
        isResolved: false
      }
    });

    res.json({ count });
  })
);

router.patch(
  "/notifications/read-all",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "LAB_TECH", "PHARMACIST", "NURSE"),
  asyncHandler(async (req, res) => {
    const result = await prisma.centerSystemAlert.updateMany({
      where: {
        centerId: getCenterId(req),
        isResolved: false
      },
      data: {
        isResolved: true
      }
    });

    res.json({ success: true, count: result.count });
  })
);

router.patch(
  "/notifications/:notificationId/read",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "LAB_TECH", "PHARMACIST", "NURSE"),
  asyncHandler(async (req, res) => {
    const notificationId = Number(req.params.notificationId);
    const alert = await prisma.centerSystemAlert.findFirst({
      where: {
        id: notificationId,
        centerId: getCenterId(req)
      }
    });

    if (!alert) {
      return res.status(404).json({ message: "الإشعار غير موجود داخل هذا المركز." });
    }

    const updated = await prisma.centerSystemAlert.update({
      where: { id: alert.id },
      data: { isResolved: true }
    });

    res.json(updated);
  })
);

router.patch(
  "/notifications/:notificationId/archive",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "LAB_TECH", "PHARMACIST", "NURSE"),
  asyncHandler(async (req, res) => {
    const notificationId = Number(req.params.notificationId);
    const alert = await prisma.centerSystemAlert.findFirst({
      where: {
        id: notificationId,
        centerId: getCenterId(req)
      }
    });

    if (!alert) {
      return res.status(404).json({ message: "الإشعار غير موجود داخل هذا المركز." });
    }

    const updated = await prisma.centerSystemAlert.update({
      where: { id: alert.id },
      data: { isResolved: true }
    });

    res.json(updated);
  })
);

router.post(
  "/notifications/process",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const [outgoing, sync] = await Promise.all([
      processOutgoingNotifications(centerId),
      syncCenterVisitsNow(centerId, 7)
    ]);

    res.json({
      outgoing,
      sync
    });
  })
);

router.post(
  "/notifications/retry/:notificationId",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const notificationId = Number(req.params.notificationId);
    const centerId = getCenterId(req);

    const notification = await prisma.outgoingNotification.update({
      where: { id: notificationId },
      data: {
        status: "PENDING",
        nextRetryAt: new Date(),
        retryCount: 0,
        lastError: null
      }
    });

    await processOutgoingNotifications(centerId);
    res.json(notification);
  })
);

export const centerRouter = router;
