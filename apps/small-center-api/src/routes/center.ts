import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";
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
import { ensurePatientPortalAccount, syncPatientPortalProfile } from "../services/patient-accounts";
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

const reportAttachmentSchema = z.object({
  fileName: z.string().min(1).max(160),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
  contentBase64: z.string().min(20)
});

const visitReportSchema = z
  .object({
    title: z.string().min(3).max(140),
    category: z.enum(["GENERAL", "LAB", "IMAGING", "FOLLOW_UP", "DISCHARGE"]).default("GENERAL"),
    summary: z.string().min(10).max(2400),
    findings: z.string().max(2400).optional(),
    recommendations: z.string().max(2400).optional(),
    recommendedFollowUp: z.string().max(220).optional(),
    shareWithPatient: z.boolean().default(true),
    attachment: reportAttachmentSchema.optional()
  })
  .superRefine((value, context) => {
    if (!value.attachment) {
      return;
    }

    const normalizedBase64 = value.attachment.contentBase64.replace(/\s+/g, "");
    const paddingLength = normalizedBase64.endsWith("==")
      ? 2
      : normalizedBase64.endsWith("=")
        ? 1
        : 0;
    const estimatedBytes = Math.max(0, Math.floor((normalizedBase64.length * 3) / 4) - paddingLength);

    if (estimatedBytes > 2_500_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["attachment", "contentBase64"],
        message: "حجم المرفق كبير. يرجى اختيار ملف أصغر من 2.5 ميغابايت."
      });
    }
  });

const workDaySchema = z.enum([
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY"
]);

const timeFieldSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const doctorAccountSchema = z
  .object({
    username: z.string().min(4).max(40).regex(/^[A-Za-z0-9._-]+$/),
    password: z.string().min(8).max(64),
    fullName: z.string().min(3),
    nationalId: z.string().min(6).max(20),
    phone: z.string().min(6).max(30),
    email: z.string().email().optional(),
    gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).default("PREFER_NOT_TO_SAY"),
    specialization: z.string().min(2),
    yearsExperience: z.coerce.number().int().min(0).max(60),
    licenseNumber: z.string().min(4).max(40),
    qualification: z.string().max(120).optional(),
    shiftDays: z.array(workDaySchema).min(1),
    shiftStartTime: timeFieldSchema,
    shiftEndTime: timeFieldSchema,
    consultationRoom: z.string().max(80).optional(),
    hireDate: z.coerce.date().optional(),
    bio: z.string().max(600).optional(),
    notes: z.string().max(600).optional(),
    isActive: z.boolean().default(true)
  })
  .superRefine((value, context) => {
    if (value.shiftEndTime <= value.shiftStartTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shiftEndTime"],
        message: "يجب أن تكون نهاية الدوام بعد بداية الدوام."
      });
    }
  });

const doctorUpdateSchema = z
  .object({
    username: z.string().min(4).max(40).regex(/^[A-Za-z0-9._-]+$/),
    password: z.string().min(8).max(64).optional(),
    fullName: z.string().min(3),
    nationalId: z.string().min(6).max(20),
    phone: z.string().min(6).max(30),
    email: z.string().email().optional(),
    gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).default("PREFER_NOT_TO_SAY"),
    specialization: z.string().min(2),
    yearsExperience: z.coerce.number().int().min(0).max(60),
    licenseNumber: z.string().min(4).max(40),
    qualification: z.string().max(120).optional(),
    shiftDays: z.array(workDaySchema).min(1),
    shiftStartTime: timeFieldSchema,
    shiftEndTime: timeFieldSchema,
    consultationRoom: z.string().max(80).optional(),
    hireDate: z.coerce.date().optional(),
    bio: z.string().max(600).optional(),
    notes: z.string().max(600).optional(),
    isActive: z.boolean().default(true)
  })
  .superRefine((value, context) => {
    if (value.shiftEndTime <= value.shiftStartTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shiftEndTime"],
        message: "يجب أن تكون نهاية الدوام بعد بداية الدوام."
      });
    }
  });

const labRequestUpdateSchema = z.object({
  patientId: z.coerce.number(),
  doctorId: z.coerce.number(),
  testId: z.coerce.number(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).default("PENDING"),
  resultValue: z.string().optional()
});

const pharmacyItemSchema = z.object({
  medicineName: z.string().min(2).max(120),
  batchNumber: z.string().min(2).max(80),
  quantity: z.coerce.number().int().min(0),
  unit: z.string().min(1).max(30),
  expiryDate: z.coerce.date(),
  sellingPrice: z.coerce.number().min(0),
  reorderLevel: z.coerce.number().int().min(0)
});

async function findPortalPatientUserId(centerId: number, patientPhone: string, patientFullName: string) {
  const center = await prisma.centralCenter.findUnique({
    where: { id: centerId },
    select: {
      centerCode: true
    }
  });

  if (!center) {
    return null;
  }

  const portalCenter = await prisma.center.findUnique({
    where: {
      code: center.centerCode
    },
    select: {
      id: true
    }
  });

  if (!portalCenter) {
    return null;
  }

  const portalPatient = await prisma.patientProfile.findFirst({
    where: {
      centerId: portalCenter.id,
      OR: [
        { user: { is: { phone: patientPhone } } },
        { user: { is: { fullName: patientFullName } } }
      ]
    },
    select: {
      userId: true
    }
  });

  return portalPatient?.userId ?? null;
}

async function ensureLocalPatientInCenter(centerId: number, patientId: number) {
  const patient = await prisma.localPatient.findFirst({
    where: {
      id: patientId,
      centerId
    },
    select: {
      id: true
    }
  });

  if (!patient) {
    throw new AppError("اختر مريضًا مسجلًا داخل هذا المركز قبل حفظ الزيارة.", 400);
  }

  return patient;
}

async function resolveVisitDoctorId(
  centerId: number,
  requestedDoctorId: number | undefined,
  authRole: string | undefined,
  authSub: string | undefined
) {
  const doctorId = requestedDoctorId ?? (authRole === "DOCTOR" ? Number(authSub) : undefined);

  if (!doctorId) {
    return undefined;
  }

  const doctor = await prisma.centerUserAccount.findFirst({
    where: {
      id: doctorId,
      centerId,
      role: "DOCTOR",
      isActive: true
    },
    select: {
      id: true
    }
  });

  if (!doctor) {
    throw new AppError("المعالج المحدد غير متاح داخل هذا المركز.", 400);
  }

  return doctor.id;
}

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

router.put(
  "/patients/:patientId",
  authorize("CENTER_MANAGER", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const patientId = Number(req.params.patientId);
    const payload = patientSchema.parse(req.body);

    const updatedPatient = await prisma.$transaction(async (tx) => {
      const existingPatient = await tx.localPatient.findFirst({
        where: {
          id: patientId,
          centerId
        },
        include: {
          unifiedPatient: true
        }
      });

      if (!existingPatient) {
        throw new AppError("تعذر العثور على المريض المطلوب داخل هذا المركز.", 404);
      }

      let unifiedPatient = existingPatient.unifiedPatient;

      if (unifiedPatient) {
        unifiedPatient = await tx.unifiedPatient.update({
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
        unifiedPatient =
          (await tx.unifiedPatient.findFirst({
            where: {
              OR: [{ primaryPhone: payload.primaryPhone }, { nationalId: payload.nationalId }]
            }
          })) ??
          (await tx.unifiedPatient.create({
            data: {
              unifiedId: existingPatient.unifiedId ?? `P-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`,
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
          }));

        unifiedPatient = await tx.unifiedPatient.update({
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
      }

      return tx.localPatient.update({
        where: {
          id: existingPatient.id
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
    });

    await syncPatientPortalProfile({
      centerId,
      fullName: payload.fullName,
      nationalId: payload.nationalId,
      primaryPhone: payload.primaryPhone,
      dateOfBirth: payload.dateOfBirth,
      gender: payload.gender,
      emergencyContact: payload.emergencyContact,
      chronicDiseases: payload.chronicDiseases
    });

    res.json({
      success: true,
      patient: updatedPatient
    });
  })
);

router.delete(
  "/patients/:patientId",
  authorize("CENTER_MANAGER", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const patientId = Number(req.params.patientId);

    const patient = await prisma.localPatient.findFirst({
      where: {
        id: patientId,
        centerId
      }
    });

    if (!patient) {
      throw new AppError("تعذر العثور على المريض المطلوب داخل هذا المركز.", 404);
    }

    await prisma.localPatient.delete({
      where: {
        id: patient.id
      }
    });

    res.json({
      success: true
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
    const payload = doctorAccountSchema.parse(req.body);

    res.status(201).json(
      await createCenterDoctor({
        centerId: getCenterId(req),
        createdById: Number(req.auth!.sub),
        username: payload.username,
        password: payload.password,
        fullName: payload.fullName,
        phone: payload.phone,
        email: payload.email,
        nationalId: payload.nationalId,
        gender: payload.gender,
        specialization: payload.specialization,
        yearsExperience: payload.yearsExperience,
        licenseNumber: payload.licenseNumber,
        qualification: payload.qualification,
        shiftDays: payload.shiftDays,
        shiftStartTime: payload.shiftStartTime,
        shiftEndTime: payload.shiftEndTime,
        consultationRoom: payload.consultationRoom,
        hireDate: payload.hireDate,
        bio: payload.bio,
        notes: payload.notes,
        isActive: payload.isActive
      })
    );
  })
);

router.put(
  "/doctors/:doctorId",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const payload = doctorUpdateSchema.parse(req.body);

    res.json(
      await updateCenterDoctor({
        centerId: getCenterId(req),
        doctorId: Number(req.params.doctorId),
        username: payload.username,
        password: payload.password,
        fullName: payload.fullName,
        phone: payload.phone,
        email: payload.email,
        nationalId: payload.nationalId,
        gender: payload.gender,
        specialization: payload.specialization,
        yearsExperience: payload.yearsExperience,
        licenseNumber: payload.licenseNumber,
        qualification: payload.qualification,
        shiftDays: payload.shiftDays,
        shiftStartTime: payload.shiftStartTime,
        shiftEndTime: payload.shiftEndTime,
        consultationRoom: payload.consultationRoom,
        hireDate: payload.hireDate,
        bio: payload.bio,
        notes: payload.notes,
        isActive: payload.isActive
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
    await ensureLocalPatientInCenter(centerId, payload.patientId);
    const doctorId = await resolveVisitDoctorId(centerId, payload.doctorId, req.auth?.role, req.auth?.sub);

    const visit = await prisma.localVisit.create({
      data: {
        centerId,
        patientId: payload.patientId,
        doctorId,
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

router.put(
  "/visits/:visitId",
  authorize("CENTER_MANAGER", "DOCTOR", "NURSE"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const visitId = Number(req.params.visitId);
    const payload = visitSchema.parse(req.body);
    await ensureLocalPatientInCenter(centerId, payload.patientId);
    const doctorId = await resolveVisitDoctorId(centerId, payload.doctorId, req.auth?.role, req.auth?.sub);

    const visit = await prisma.localVisit.findFirst({
      where: {
        id: visitId,
        centerId
      },
      include: {
        invoice: true
      }
    });

    if (!visit) {
      throw new AppError("تعذر العثور على الزيارة المطلوبة داخل هذا المركز.", 404);
    }

    if (visit.syncedToCentral || visit.syncState === "SYNCED") {
      throw new AppError("لا يمكن تعديل زيارة تمت مزامنتها إلى النظام المركزي حفاظًا على الأرشفة.", 409);
    }

    if (visit.invoice && !["UNPAID", "VOID"].includes(visit.invoice.status)) {
      throw new AppError("لا يمكن تعديل زيارة مرتبطة بفاتورة مدفوعة أو مرحلة.", 409);
    }

    const updatedVisit = await prisma.$transaction(async (tx) => {
      const savedVisit = await tx.localVisit.update({
        where: {
          id: visit.id
        },
        data: {
          patientId: payload.patientId,
          doctorId,
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

      await tx.localPrescription.deleteMany({
        where: {
          visitId: visit.id
        }
      });

      if (payload.prescriptions.length > 0) {
        await tx.localPrescription.createMany({
          data: payload.prescriptions.map((prescription) => ({
            visitId: visit.id,
            medicineName: prescription.medicineName,
            dosage: prescription.dosage,
            duration: prescription.duration,
            instructions: prescription.instructions
          }))
        });
      }

      return savedVisit;
    });

    res.json({
      success: true,
      visit: updatedVisit
    });
  })
);

router.delete(
  "/visits/:visitId",
  authorize("CENTER_MANAGER", "DOCTOR", "NURSE"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const visitId = Number(req.params.visitId);

    const visit = await prisma.localVisit.findFirst({
      where: {
        id: visitId,
        centerId
      },
      include: {
        invoice: true
      }
    });

    if (!visit) {
      throw new AppError("تعذر العثور على الزيارة المطلوبة داخل هذا المركز.", 404);
    }

    if (visit.syncedToCentral || visit.syncState === "SYNCED") {
      throw new AppError("لا يمكن حذف زيارة تمت مزامنتها إلى النظام المركزي حفاظًا على الأرشفة.", 409);
    }

    if (visit.invoice && !["UNPAID", "VOID"].includes(visit.invoice.status)) {
      throw new AppError("لا يمكن حذف زيارة مرتبطة بفاتورة مدفوعة أو مرحلة.", 409);
    }

    await prisma.$transaction(async (tx) => {
      await tx.localInvoice.deleteMany({
        where: {
          visitId: visit.id
        }
      });

      await tx.localVisit.delete({
        where: {
          id: visit.id
        }
      });
    });

    res.json({
      success: true
    });
  })
);

router.post(
  "/visits/:visitId/reports",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const visitId = Number(req.params.visitId);
    const payload = visitReportSchema.parse(req.body);

    const visit = await prisma.localVisit.findFirst({
      where: {
        id: visitId,
        centerId
      },
      include: {
        patient: true
      }
    });

    if (!visit) {
      throw new AppError("تعذر العثور على الزيارة المطلوبة لإرفاق التقرير.", 404);
    }

    if (req.auth?.role === "DOCTOR" && visit.doctorId && visit.doctorId !== Number(req.auth.sub)) {
      throw new AppError("يمكن للطبيب المكلّف بالزيارة فقط إنشاء تقرير النتائج الخاص بها.", 403);
    }

    const report = await prisma.localResultReport.create({
      data: {
        centerId,
        patientId: visit.patientId,
        visitId: visit.id,
        authorId: Number(req.auth!.sub),
        title: payload.title,
        category: payload.category,
        summary: payload.summary,
        findings: payload.findings,
        recommendations: payload.recommendations,
        recommendedFollowUp: payload.recommendedFollowUp,
        shareWithPatient: payload.shareWithPatient,
        attachmentFileName: payload.attachment?.fileName,
        attachmentMimeType: payload.attachment?.mimeType,
        attachmentBase64: payload.attachment?.contentBase64
      },
      include: {
        author: {
          include: {
            doctorProfile: true
          }
        }
      }
    });

    if (payload.shareWithPatient) {
      const portalUserId = await findPortalPatientUserId(centerId, visit.patient.phone, visit.patient.fullName);

      if (portalUserId) {
        await prisma.notification.create({
          data: {
            userId: portalUserId,
            title: "تقرير نتائج جديد",
            body: `أضاف الطبيب ${report.author.fullName} تقريرًا جديدًا إلى سجلك الصحي بعنوان: ${report.title}`,
            type: "SYSTEM"
          }
        });
      }
    }

    res.status(201).json({
      success: true,
      report
    });
  })
);

router.put(
  "/visits/:visitId/reports/:reportId",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const visitId = Number(req.params.visitId);
    const reportId = Number(req.params.reportId);
    const payload = visitReportSchema.parse(req.body);

    const report = await prisma.localResultReport.findFirst({
      where: {
        id: reportId,
        visitId,
        centerId
      },
      include: {
        visit: {
          include: {
            patient: true
          }
        }
      }
    });

    if (!report) {
      throw new AppError("تعذر العثور على تقرير النتائج المطلوب.", 404);
    }

    if (req.auth?.role === "DOCTOR" && report.authorId !== Number(req.auth.sub)) {
      throw new AppError("يمكنك تعديل التقارير التي أنشأتها فقط.", 403);
    }

    const updatedReport = await prisma.localResultReport.update({
      where: {
        id: report.id
      },
      data: {
        title: payload.title,
        category: payload.category,
        summary: payload.summary,
        findings: payload.findings,
        recommendations: payload.recommendations,
        recommendedFollowUp: payload.recommendedFollowUp,
        shareWithPatient: payload.shareWithPatient,
        attachmentFileName: payload.attachment?.fileName ?? null,
        attachmentMimeType: payload.attachment?.mimeType ?? null,
        attachmentBase64: payload.attachment?.contentBase64 ?? null
      },
      include: {
        author: {
          include: {
            doctorProfile: true
          }
        }
      }
    });

    if (payload.shareWithPatient) {
      const portalUserId = await findPortalPatientUserId(
        centerId,
        report.visit.patient.phone,
        report.visit.patient.fullName
      );

      if (portalUserId) {
        await prisma.notification.create({
          data: {
            userId: portalUserId,
            title: "تم تحديث تقرير نتائجك",
            body: `تم تحديث التقرير الطبي بعنوان: ${updatedReport.title}`,
            type: "SYSTEM"
          }
        });
      }
    }

    res.json({
      success: true,
      report: updatedReport
    });
  })
);

router.delete(
  "/visits/:visitId/reports/:reportId",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const visitId = Number(req.params.visitId);
    const reportId = Number(req.params.reportId);

    const report = await prisma.localResultReport.findFirst({
      where: {
        id: reportId,
        visitId,
        centerId
      }
    });

    if (!report) {
      throw new AppError("تعذر العثور على تقرير النتائج المطلوب.", 404);
    }

    if (req.auth?.role === "DOCTOR" && report.authorId !== Number(req.auth.sub)) {
      throw new AppError("يمكنك حذف التقارير التي أنشأتها فقط.", 403);
    }

    await prisma.localResultReport.delete({
      where: {
        id: report.id
      }
    });

    res.json({
      success: true
    });
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

    res.json(
      referrals.map((referral) => ({
        id: referral.id,
        patientName: referral.patient.fullName,
        patientUnifiedId: referral.patient.unifiedId,
        fromCenter: referral.fromCenter.centerName,
        toCenter: referral.toCenter?.centerName ?? "بانتظار اختيار مركز الاستقبال",
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
      }))
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
      const localPatient = await prisma.localPatient.findFirst({
        where: {
          id: payload.localPatientId,
          centerId
        }
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

router.put(
  "/lab/requests/:requestId",
  authorize("CENTER_MANAGER", "DOCTOR", "LAB_TECH"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const requestId = Number(req.params.requestId);
    const payload = labRequestUpdateSchema.parse(req.body);

    const requestRecord = await prisma.labRequestLocal.findFirst({
      where: {
        id: requestId,
        centerId
      }
    });

    if (!requestRecord) {
      throw new AppError("تعذر العثور على طلب المختبر المطلوب داخل هذا المركز.", 404);
    }

    if (req.auth?.role === "DOCTOR" && requestRecord.status !== "PENDING") {
      throw new AppError("يمكن للطبيب تعديل الطلبات المعلقة فقط قبل بدء المعالجة المخبرية.", 409);
    }

    const record = await prisma.labRequestLocal.update({
      where: { id: requestRecord.id },
      data: {
        patientId: payload.patientId,
        doctorId: payload.doctorId,
        testId: payload.testId,
        status: payload.status,
        resultValue: payload.resultValue,
        resultDate: payload.status === "COMPLETED" ? new Date() : null
      }
    });

    res.json({
      success: true,
      request: record
    });
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

router.delete(
  "/lab/requests/:requestId",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const requestId = Number(req.params.requestId);

    const requestRecord = await prisma.labRequestLocal.findFirst({
      where: {
        id: requestId,
        centerId
      }
    });

    if (!requestRecord) {
      throw new AppError("تعذر العثور على طلب المختبر المطلوب داخل هذا المركز.", 404);
    }

    if (requestRecord.status === "COMPLETED") {
      throw new AppError("لا يمكن حذف طلب مختبري مكتمل بعد اعتماد النتيجة.", 409);
    }

    await prisma.labRequestLocal.delete({
      where: {
        id: requestRecord.id
      }
    });

    res.json({
      success: true
    });
  })
);

router.get(
  "/pharmacy",
  authorize("CENTER_MANAGER", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    res.json(await getCenterPharmacyData(getCenterId(req)));
  })
);

router.post(
  "/pharmacy",
  authorize("CENTER_MANAGER", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const payload = pharmacyItemSchema.parse(req.body);

    const item = await prisma.pharmacyInventoryLocal.create({
      data: {
        centerId: getCenterId(req),
        medicineName: payload.medicineName,
        batchNumber: payload.batchNumber,
        quantity: payload.quantity,
        unit: payload.unit,
        expiryDate: payload.expiryDate,
        sellingPrice: payload.sellingPrice,
        reorderLevel: payload.reorderLevel
      }
    });

    res.status(201).json({
      success: true,
      item
    });
  })
);

router.put(
  "/pharmacy/:itemId",
  authorize("CENTER_MANAGER", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const itemId = Number(req.params.itemId);
    const payload = pharmacyItemSchema.parse(req.body);

    const existingItem = await prisma.pharmacyInventoryLocal.findFirst({
      where: {
        id: itemId,
        centerId
      }
    });

    if (!existingItem) {
      throw new AppError("تعذر العثور على الصنف الدوائي المطلوب داخل هذا المركز.", 404);
    }

    const item = await prisma.pharmacyInventoryLocal.update({
      where: {
        id: existingItem.id
      },
      data: {
        medicineName: payload.medicineName,
        batchNumber: payload.batchNumber,
        quantity: payload.quantity,
        unit: payload.unit,
        expiryDate: payload.expiryDate,
        sellingPrice: payload.sellingPrice,
        reorderLevel: payload.reorderLevel
      }
    });

    res.json({
      success: true,
      item
    });
  })
);

router.delete(
  "/pharmacy/:itemId",
  authorize("CENTER_MANAGER", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const centerId = getCenterId(req);
    const itemId = Number(req.params.itemId);

    const existingItem = await prisma.pharmacyInventoryLocal.findFirst({
      where: {
        id: itemId,
        centerId
      }
    });

    if (!existingItem) {
      throw new AppError("تعذر العثور على الصنف الدوائي المطلوب داخل هذا المركز.", 404);
    }

    await prisma.pharmacyInventoryLocal.delete({
      where: {
        id: existingItem.id
      }
    });

    res.json({
      success: true
    });
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
