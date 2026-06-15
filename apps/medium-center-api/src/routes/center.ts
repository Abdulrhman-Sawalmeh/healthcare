import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authorize, authorizeWorkspace, authenticate } from "../middleware/auth";
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
  const qrValue = buildPatientQrValue(patient.centerId, patient.qrToken);

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
  dateOfBirth: z.coerce.date(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]),
  primaryPhone: z.string().min(6),
  address: z.string().min(5),
  emergencyContact: z.string().optional(),
  bloodType: z.string().optional(),
  allergies: z.array(z.string()).default([]),
  chronicDiseases: z.array(z.string()).default([]),
  nationalId: z.string().min(6)
});

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
    .default([])
});

const reportAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(3),
  contentBase64: z.string().min(1)
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
  summary: z.string().min(2),
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

const labRequestSchema = z.object({
  patientId: z.coerce.number(),
  doctorId: z.coerce.number(),
  testId: z.coerce.number()
});

const labResultSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  resultValue: z.string().optional()
});

const doctorAccountSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  fullName: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().optional(),
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
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "PHARMACIST", "LAB_TECH", "NURSE"),
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
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    res.json(await getCenterDoctorsBundle(getCenterId(req)));
  })
);

router.post(
  "/doctors",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const payload = doctorAccountSchema.extend({ password: z.string().min(6) }).parse(req.body);
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
      action: "DELETE_DOCTOR",
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

router.get(
  "/visits",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    res.json(await getCenterVisits(getCenterId(req)));
  })
);

router.post(
  "/visits",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const payload = visitSchema.parse(req.body);

    const visit = await prisma.localVisit.create({
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

    if (payload.prescriptions.length > 0) {
      await prisma.localPrescription.createMany({
        data: payload.prescriptions.map((prescription, index) => {
          const verificationCode = createPrescriptionVerificationCode(centerId, visit.id, index);

          return {
            visitId: visit.id,
            medicineName: prescription.medicineName,
            dosage: prescription.dosage,
            duration: prescription.duration,
            instructions: prescription.instructions,
            verificationCode,
            verificationHash: hashPrescriptionVerificationCode(verificationCode)
          };
        })
      });
    }

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
  authorize("CENTER_MANAGER", "DOCTOR"),
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

    const report = await prisma.localResultReport.create({
      data: {
        centerId,
        patientId: visit.patientId,
        visitId: visit.id,
        authorId: Number(req.auth?.sub),
        title: payload.title,
        category: payload.category,
        summary: payload.summary,
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
        shareWithPatient: report.shareWithPatient
      }
    });

    res.status(201).json(report);
  })
);

router.put(
  "/visits/:visitId/reports/:reportId",
  authorize("CENTER_MANAGER", "DOCTOR"),
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

    const report = await prisma.localResultReport.update({
      where: {
        id: reportId
      },
      data: {
        title: payload.title,
        category: payload.category,
        summary: payload.summary,
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
        shareWithPatient: existingReport.shareWithPatient
      },
      newValue: {
        title: report.title,
        category: report.category,
        shareWithPatient: report.shareWithPatient
      }
    });

    res.json(report);
  })
);

router.delete(
  "/visits/:visitId/reports/:reportId",
  authorize("CENTER_MANAGER", "DOCTOR"),
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
  "/referrals",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const [referrals, outgoingReferralRequests, center] = await Promise.all([
      prisma.centralReferral.findMany({
        where: {
          OR: [{ fromCenterId: centerId }, { toCenterId: centerId }]
        },
        include: {
          patient: true,
          fromCenter: true,
          toCenter: true
        },
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
        ...referrals.map((referral) => ({
          id: referral.id,
          patientName: referral.patient.fullName,
          patientUnifiedId: referral.patient.unifiedId,
          fromCenter: referral.fromCenter.centerName,
          toCenter:
            referral.toCenter?.centerName ?? "بانتظار اختيار الجهة المستقبلة",
          requiredSpecialty: referral.requiredSpecialty,
          priority: referral.priority,
          status: referral.status,
          reason: referral.reason,
          selectedCenterReason: referral.selectedCenterReason,
          rejectionReason: referral.rejectionReason,
          estimatedWaitTimeMinutes: referral.estimatedWaitTimeMinutes,
          requestedAt: referral.requestedAt,
          respondedAt: referral.respondedAt,
          notesFromSender: referral.notesFromSender,
          notesFromReceiver: referral.notesFromReceiver
        })),
        ...outgoingReferralRequests.map((notification) => {
          const payload = notification.payload as Record<string, unknown>;

          return {
            id: -notification.id,
            patientName: String(payload.patient_unified_id ?? "Patient"),
            patientUnifiedId: String(payload.patient_unified_id ?? ""),
            fromCenter: center?.centerName ?? "Current center",
            toCenter: "Awaiting central matching",
            requiredSpecialty: String(payload.required_specialty ?? "-"),
            priority: String(payload.priority ?? "NORMAL"),
            status: notification.status,
            reason: String(payload.reason ?? "Referral request queued for central processing."),
            selectedCenterReason: null,
            rejectionReason: notification.lastError,
            estimatedWaitTimeMinutes: null,
            requestedAt: notification.createdAt,
            respondedAt: notification.sentAt,
            notesFromSender: payload.notes_from_sender ? String(payload.notes_from_sender) : null,
            notesFromReceiver: null
          };
        })
      ].sort((left, right) => new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime())
    );
  })
);

router.post(
  "/referrals/request",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
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
      notes_from_sender: payload.notesFromSender
    });

    if (payload.processNow) {
      await processOutgoingNotifications(centerId);
    }

    await recordAuditLog(req, {
      action: "CREATE_REFERRAL",
      entityType: "OutgoingNotification",
      entityId: queueItem.id,
      centerId,
      newValue: {
        patientUnifiedId,
        requiredSpecialty: payload.requiredSpecialty,
        priority: payload.priority
      }
    });

    res.status(201).json(queueItem);
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
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const payload = labRequestSchema.parse(req.body);

    const requestRecord = await prisma.labRequestLocal.create({
      data: {
        centerId,
        patientId: payload.patientId,
        doctorId: payload.doctorId,
        testId: payload.testId
      }
    });

    await recordAuditLog(req, {
      action: "CREATE_LAB_REQUEST",
      entityType: "LabRequestLocal",
      entityId: requestRecord.id,
      centerId,
      newValue: {
        patientId: requestRecord.patientId,
        doctorId: requestRecord.doctorId,
        testId: requestRecord.testId
      }
    });

    res.status(201).json(requestRecord);
  })
);

router.patch(
  "/lab/requests/:requestId",
  authorize("CENTER_MANAGER", "LAB_TECH"),
  asyncHandler(async (req, res) => {
    const payload = labResultSchema.parse(req.body);
    const record = await prisma.labRequestLocal.update({
      where: { id: Number(req.params.requestId) },
      data: {
        status: payload.status,
        resultValue: payload.resultValue,
        resultDate: payload.status === "COMPLETED" ? new Date() : null
      }
    });

    await recordAuditLog(req, {
      action: "UPDATE_LAB_RESULT",
      entityType: "LabRequestLocal",
      entityId: record.id,
      centerId: getCenterId(req),
      newValue: {
        status: record.status,
        resultValue: record.resultValue
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
