import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authorize, authorizeWorkspace, authenticate } from "../middleware/auth";
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
import { asyncHandler } from "../utils/async-handler";

const router = Router();

router.use(authenticate, authorizeWorkspace("center"));

function getCenterId(req: Parameters<typeof asyncHandler>[0] extends never ? never : any) {
  return Number(req.auth?.centerId);
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
  nationalId: z.string().optional()
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

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    res.json(await getCenterWorkspaceData(getCenterId(req), req.auth!.role));
  })
);

router.get(
  "/patients",
  authorize("CENTER_MANAGER", "RECEPTIONIST", "DOCTOR", "NURSE"),
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    res.json(await getCenterPatients(getCenterId(req), search));
  })
);

router.get(
  "/patients/search",
  authorize("CENTER_MANAGER", "RECEPTIONIST", "DOCTOR", "NURSE"),
  asyncHandler(async (req, res) => {
    const phone = String(req.query.phone ?? "");
    const centerId = getCenterId(req);

    const [localPatient, unifiedPatient] = await Promise.all([
      prisma.localPatient.findFirst({
        where: {
          centerId,
          phone
        },
        include: {
          visits: {
            orderBy: {
              visitDate: "desc"
            },
            take: 3
          }
        }
      }),
      prisma.unifiedPatient.findFirst({
        where: {
          primaryPhone: phone
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
        }
      })
    ]);

    res.json({
      found: Boolean(localPatient || unifiedPatient),
      localPatient,
      patient: unifiedPatient,
      recentVisits: unifiedPatient?.unifiedVisits ?? []
    });
  })
);

router.post(
  "/patients",
  authorize("CENTER_MANAGER", "RECEPTIONIST", "NURSE"),
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

    if (!unifiedPatient) {
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

    const localPatient = await prisma.localPatient.create({
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
        createdLocally: !Boolean(unifiedPatient)
      }
    });

    res.status(201).json({
      success: true,
      unifiedId: unifiedPatient.unifiedId,
      patient: localPatient
    });
  })
);

router.get(
  "/visits",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"),
  asyncHandler(async (req, res) => {
    res.json(await getCenterVisits(getCenterId(req)));
  })
);

router.post(
  "/visits",
  authorize("CENTER_MANAGER", "DOCTOR", "NURSE"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const payload = visitSchema.parse(req.body);

    const visit = await prisma.localVisit.create({
      data: {
        centerId,
        patientId: payload.patientId,
        doctorId:
          payload.doctorId ??
          (req.auth?.role === "DOCTOR" || req.auth?.role === "NURSE" ? Number(req.auth.sub) : undefined),
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
        data: payload.prescriptions.map((prescription) => ({
          visitId: visit.id,
          medicineName: prescription.medicineName,
          dosage: prescription.dosage,
          duration: prescription.duration,
          instructions: prescription.instructions
        }))
      });
    }

    res.status(201).json(visit);
  })
);

router.get(
  "/referrals",
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const referrals = await prisma.centralReferral.findMany({
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
    });

    res.json(referrals);
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
