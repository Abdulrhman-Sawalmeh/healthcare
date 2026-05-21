import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authorize, authorizeWorkspace, authenticate } from "../middleware/auth";
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
    res.status(201).json(
      await createCenterDoctor({
        ...payload,
        centerId: getCenterId(req),
        username: payload.username ?? "",
        createdById: Number(req.auth!.sub)
      })
    );
  })
);

router.put(
  "/doctors/:doctorId",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const payload = doctorAccountSchema.parse(req.body);
    res.json(
      await updateCenterDoctor({
        ...payload,
        centerId: getCenterId(req),
        doctorId: Number(req.params.doctorId),
        username: payload.username ?? ""
      })
    );
  })
);

router.delete(
  "/doctors/:doctorId",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    res.json(await deleteCenterDoctor(getCenterId(req), Number(req.params.doctorId)));
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

    if (!term) {
      return res.json({
        found: false,
        localPatient: null,
        patient: null,
        recentVisits: []
      });
    }

    const [localPatient, unifiedPatient] = await Promise.all([
      prisma.localPatient.findFirst({
        where: {
          centerId,
          OR: [
            { phone: term },
            { unifiedId: term },
            {
              unifiedPatient: {
                is: {
                  nationalId: term
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
        }
      }),
      prisma.unifiedPatient.findFirst({
        where: {
          OR: [{ primaryPhone: term }, { nationalId: term }, { unifiedId: term }]
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
      recentVisits: unifiedPatient?.unifiedVisits ?? []
    });
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
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"),
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
