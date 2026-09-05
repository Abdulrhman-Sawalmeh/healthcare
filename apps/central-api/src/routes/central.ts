import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authorize, authorizeWorkspace, authenticate } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { recordAuditLog } from "../services/audit-log";
import { getCentralAnalyticsDashboard } from "../services/central-analytics";
import {
  enqueueCentralNotification,
  processAllQueues,
  processCentralNotifications,
  syncCenterVisitsNow
} from "../services/notification-processor";
import {
  getCentralDashboardData,
  getCentersOverview,
  getCentralReferralsOverview,
  getMasterDataLists,
  getReportsSummary,
  getUnifiedPatients
} from "../services/network-queries";
import {
  buildPrescriptionQrValue,
  hashPrescriptionVerificationCode
} from "../services/prescription-verification";
import { asyncHandler } from "../utils/async-handler";
import { centralCenterWithoutApiKeySelect } from "../utils/central-center";

const router = Router();

router.use(authenticate, authorizeWorkspace("central"), authorize("CENTRAL_ADMIN"));

const analyticsQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  centerId: z.coerce.number().int().positive().optional(),
  departmentId: z.string().min(1).optional(),
  doctorId: z.string().min(1).optional()
});

const reportsQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional()
});

router.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 120), 300);
    const centerId = req.query.centerId ? Number(req.query.centerId) : undefined;
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(centerId ? { centerId } : {}),
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
  asyncHandler(async (req, res) => {
    const rawCode = String(req.params.code ?? "").trim();
    const code = rawCode.startsWith("healthcare-prescription:")
      ? rawCode.replace("healthcare-prescription:", "")
      : rawCode;

    const prescription = await prisma.localPrescription.findFirst({
      where: {
        verificationCode: code
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
      centerId: prescription?.visit.centerId,
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

const centerConnectionSchema = z.object({
  isConnected: z.boolean(),
  reason: z.string().max(255).optional()
});

function requiredText(label: string, minimumLength = 1) {
  return z
    .string({ required_error: `${label} مطلوب.`, invalid_type_error: `${label} غير صالح.` })
    .trim()
    .min(minimumLength, `${label} مطلوب ولا يمكن أن يحتوي على مسافات فقط.`);
}

const optionalEmailSchema = z
  .string({ invalid_type_error: "البريد الإلكتروني غير صالح." })
  .trim()
  .refine((value) => value === "" || z.string().email().safeParse(value).success, {
    message: "يرجى إدخال بريد إلكتروني صحيح."
  })
  .default("");

const optionalApiEndpointSchema = z
  .string({ invalid_type_error: "رابط API غير صالح." })
  .trim()
  .refine(
    (value) => {
      if (!value) {
        return true;
      }

      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "يرجى إدخال رابط API صحيح يبدأ بـ http:// أو https://" }
  )
  .optional();

const centerSharedSchema = z.object({
  centerName: requiredText("اسم المركز"),
  region: requiredText("المنطقة"),
  city: requiredText("المدينة"),
  address: requiredText("العنوان"),
  phone: requiredText("رقم الهاتف", 5),
  email: optionalEmailSchema,
  specialties: z
    .array(z.string().refine((value) => value.trim().length > 0, "اسم التخصص لا يمكن أن يكون فارغا."))
    .default([]),
  apiEndpoint: optionalApiEndpointSchema,
  apiKey: z.string().optional()
});

const centerCreateSchema = centerSharedSchema.extend({
  centerCode: requiredText("رمز المركز"),
  centerType: z.enum(["CLINIC", "MEDICAL_CENTER", "HOSPITAL"], {
    required_error: "نوع المركز مطلوب.",
    invalid_type_error: "نوع المركز غير صالح."
  }),
  latitude: z.coerce.number().finite().default(0),
  longitude: z.coerce.number().finite().default(0),
  isConnected: z.boolean().default(false)
});

const centerUpdateSchema = centerSharedSchema.extend({
  latitude: z.coerce.number().finite().optional(),
  longitude: z.coerce.number().finite().optional(),
  isConnected: z.boolean()
});

const medicineSchema = z.object({
  genericName: z.string().min(2),
  brandName: z.string().min(2),
  category: z.string().min(2),
  unit: z.string().min(1),
  isCritical: z.boolean().default(false)
});

const labTestSchema = z.object({
  testName: z.string().min(2),
  category: z.string().min(2),
  normalRange: z.string().optional()
});

const specialtySchema = z.object({
  specialtyName: requiredText("اسم التخصص", 2),
  description: z.string().trim().optional()
});

function normalizeArabicName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ar");
}

function parseWithArabicValidation<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new AppError(result.error.issues[0]?.message ?? "فشل التحقق من صحة البيانات المدخلة.", 400);
  }

  return result.data;
}

async function ensureUniqueCenterCode(centerCode: string) {
  const existing = await prisma.centralCenter.findFirst({
    where: {
      centerCode: {
        equals: centerCode,
        mode: "insensitive"
      }
    },
    select: {
      id: true
    }
  });

  if (existing) {
    throw new AppError("رمز المركز مستخدم بالفعل. يرجى اختيار رمز آخر.", 409);
  }
}

async function ensureUniqueSpecialtyName(specialtyName: string, excludeId?: number) {
  const normalizedName = normalizeArabicName(specialtyName);
  const specialties = await prisma.masterSpecialty.findMany({
    select: {
      id: true,
      specialtyName: true
    }
  });
  const duplicate = specialties.find(
    (specialty) =>
      specialty.id !== excludeId && normalizeArabicName(specialty.specialtyName) === normalizedName
  );

  if (duplicate) {
    throw new AppError("هذا التخصص موجود بالفعل. لا يمكن إنشاء تخصص مكرر.", 409);
  }
}

async function broadcastMasterDataSync(entity: string) {
  const centers = await prisma.centralCenter.findMany({
    where: {
      isConnected: true
    },
    select: {
      id: true
    }
  });

  await Promise.all(
    centers.map((center) =>
      enqueueCentralNotification(center.id, "SYNC_MASTER_DATA", {
        entity,
        synced_at: new Date().toISOString()
      })
    )
  );
}

router.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    res.json(await getCentralDashboardData());
  })
);

router.get(
  "/analytics/dashboard",
  asyncHandler(async (req, res) => {
    const filters = analyticsQuerySchema.parse(req.query);
    res.json(await getCentralAnalyticsDashboard(filters));
  })
);

router.get(
  "/centers",
  asyncHandler(async (_req, res) => {
    res.json(await getCentersOverview());
  })
);

router.post(
  "/centers",
  asyncHandler(async (req, res) => {
    const payload = parseWithArabicValidation(centerCreateSchema, req.body);
    await ensureUniqueCenterCode(payload.centerCode);
    const center = await prisma.centralCenter.create({
      data: {
        ...payload,
        apiEndpoint: payload.apiEndpoint || null,
        apiKey: payload.apiKey?.trim() ? payload.apiKey : null,
        connectionSuspendedAt: payload.isConnected ? null : new Date(),
        suspensionReason: payload.isConnected ? null : "لم يتم تفعيل الاتصال عند إنشاء المركز."
      }
    });

    const centers = await getCentersOverview();
    res.status(201).json(centers.find((item) => item.id === center.id));
  })
);

router.put(
  "/centers/:centerId",
  asyncHandler(async (req, res) => {
    const centerId = Number(req.params.centerId);
    const existingCenter = await prisma.centralCenter.findUnique({
      where: { id: centerId },
      select: {
        centerCode: true,
        centerType: true
      }
    });

    if (!existingCenter) {
      throw new AppError("تعذر العثور على المركز المطلوب.", 404);
    }

    const submitted = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};

    if (
      Object.prototype.hasOwnProperty.call(submitted, "centerCode") &&
      (typeof submitted.centerCode !== "string" || submitted.centerCode.trim() !== existingCenter.centerCode)
    ) {
      throw new AppError("لا يمكن تغيير رمز المركز بعد إنشائه.", 409);
    }

    if (
      Object.prototype.hasOwnProperty.call(submitted, "centerType") &&
      submitted.centerType !== existingCenter.centerType
    ) {
      throw new AppError("لا يمكن تغيير نوع المركز من نموذج التعديل العادي.", 409);
    }

    const payload = parseWithArabicValidation(centerUpdateSchema, req.body);
    const center = await prisma.centralCenter.update({
      where: { id: centerId },
      data: {
        ...payload,
        apiEndpoint: payload.apiEndpoint === undefined ? undefined : payload.apiEndpoint || null,
        apiKey: payload.apiKey?.trim() ? payload.apiKey : undefined,
        connectionSuspendedAt: payload.isConnected ? null : new Date(),
        suspensionReason: payload.isConnected ? null : "تم تعطيل الاتصال من نموذج تعديل المركز."
      }
    });

    const centers = await getCentersOverview();
    res.json(centers.find((item) => item.id === center.id));
  })
);

router.delete(
  "/centers/:centerId",
  asyncHandler(async (req, res) => {
    const centerId = Number(req.params.centerId);
    const center = await prisma.centralCenter.findUnique({
      where: { id: centerId },
      include: {
        _count: {
          select: {
            localPatients: true,
            localVisits: true,
            referralsFrom: true,
            referralsTo: true,
            notificationsToCenter: true,
            notificationsToCentral: true
          }
        }
      }
    });

    if (!center) {
      throw new AppError("تعذر العثور على المركز المطلوب.", 404);
    }

    const relatedCount = Object.values(center._count).reduce((sum, value) => sum + value, 0);

    if (relatedCount > 0) {
      throw new AppError("لا يمكن حذف مركز مرتبط بسجلات مرضى أو زيارات أو إحالات أو إشعارات. استخدم التعطيل بدلا من الحذف.", 409);
    }

    await prisma.centralCenter.delete({
      where: { id: centerId }
    });

    res.json({ success: true });
  })
);

router.patch(
  "/centers/:centerId/connection",
  asyncHandler(async (req, res) => {
    const centerId = Number(req.params.centerId);
    const payload = centerConnectionSchema.parse(req.body);

    const center = await prisma.centralCenter.update({
      where: { id: centerId },
      data: {
        isConnected: payload.isConnected,
        connectionSuspendedAt: payload.isConnected ? null : new Date(),
        suspensionReason: payload.isConnected ? null : payload.reason ?? "تم التعليق من قبل الإدارة المركزية."
      }
    });

    const centers = await getCentersOverview();
    res.json(centers.find((item) => item.id === center.id));
  })
);

router.get(
  "/patients",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    res.json(await getUnifiedPatients(search));
  })
);

router.get(
  "/referrals",
  asyncHandler(async (_req, res) => {
    res.json(await getCentralReferralsOverview());
  })
);

router.get(
  "/master-data",
  asyncHandler(async (_req, res) => {
    res.json(await getMasterDataLists());
  })
);

router.post(
  "/master-data/medicines",
  asyncHandler(async (req, res) => {
    const payload = medicineSchema.parse(req.body);
    const medicine = await prisma.masterMedicine.create({
      data: payload
    });

    await broadcastMasterDataSync("medicines");
    res.status(201).json(medicine);
  })
);

router.put(
  "/master-data/medicines/:id",
  asyncHandler(async (req, res) => {
    const payload = medicineSchema.parse(req.body);
    const medicine = await prisma.masterMedicine.update({
      where: { id: Number(req.params.id) },
      data: {
        ...payload,
        version: {
          increment: 1
        }
      }
    });

    await broadcastMasterDataSync("medicines");
    res.json(medicine);
  })
);

router.delete(
  "/master-data/medicines/:id",
  asyncHandler(async (req, res) => {
    const medicineId = Number(req.params.id);
    const availabilityCount = await prisma.centerMedicineAvailability.count({
      where: { medicineId }
    });

    if (availabilityCount > 0) {
      throw new AppError("لا يمكن حذف دواء مستخدم في توفر الأدوية داخل المراكز. أوقف استخدامه تشغيليا بدلا من الحذف.", 409);
    }

    await prisma.masterMedicine.delete({
      where: { id: medicineId }
    });

    await broadcastMasterDataSync("medicines");
    res.json({ success: true });
  })
);

router.post(
  "/master-data/lab-tests",
  asyncHandler(async (req, res) => {
    const payload = labTestSchema.parse(req.body);
    const labTest = await prisma.masterLabTest.create({
      data: payload
    });

    await broadcastMasterDataSync("lab-tests");
    res.status(201).json(labTest);
  })
);

router.put(
  "/master-data/lab-tests/:id",
  asyncHandler(async (req, res) => {
    const payload = labTestSchema.parse(req.body);
    const labTest = await prisma.masterLabTest.update({
      where: { id: Number(req.params.id) },
      data: {
        ...payload,
        version: {
          increment: 1
        }
      }
    });

    await broadcastMasterDataSync("lab-tests");
    res.json(labTest);
  })
);

router.delete(
  "/master-data/lab-tests/:id",
  asyncHandler(async (req, res) => {
    await prisma.masterLabTest.delete({
      where: { id: Number(req.params.id) }
    });

    await broadcastMasterDataSync("lab-tests");
    res.json({ success: true });
  })
);

router.post(
  "/master-data/specialties",
  asyncHandler(async (req, res) => {
    const payload = specialtySchema.parse(req.body);
    await ensureUniqueSpecialtyName(payload.specialtyName);
    const specialty = await prisma.masterSpecialty.create({
      data: payload
    });

    await broadcastMasterDataSync("specialties");
    res.status(201).json(specialty);
  })
);

router.put(
  "/master-data/specialties/:id",
  asyncHandler(async (req, res) => {
    const payload = specialtySchema.parse(req.body);
    const specialtyId = Number(req.params.id);
    await ensureUniqueSpecialtyName(payload.specialtyName, specialtyId);
    const specialty = await prisma.masterSpecialty.update({
      where: { id: specialtyId },
      data: payload
    });

    await broadcastMasterDataSync("specialties");
    res.json(specialty);
  })
);

router.delete(
  "/master-data/specialties/:id",
  asyncHandler(async (req, res) => {
    const specialtyId = Number(req.params.id);
    const specialty = await prisma.masterSpecialty.findUnique({
      where: { id: specialtyId }
    });

    if (!specialty) {
      throw new AppError("تعذر العثور على التخصص المطلوب.", 404);
    }

    const [referralCount, doctorAvailabilityCount, centerCount] = await Promise.all([
      prisma.centralReferral.count({ where: { requiredSpecialty: specialty.specialtyName } }),
      prisma.centerDoctorAvailability.count({ where: { specialty: specialty.specialtyName } }),
      prisma.centralCenter.count({ where: { specialties: { has: specialty.specialtyName } } })
    ]);

    if (referralCount + doctorAvailabilityCount + centerCount > 0) {
      throw new AppError("لا يمكن حذف تخصص مستخدم في الإحالات أو توفر الأطباء أو بيانات المراكز.", 409);
    }

    await prisma.masterSpecialty.delete({
      where: { id: specialtyId }
    });

    await broadcastMasterDataSync("specialties");
    res.json({ success: true });
  })
);

router.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const filters = reportsQuerySchema.parse(req.query);
    res.json(await getReportsSummary(filters));
  })
);

router.get(
  "/notifications",
  asyncHandler(async (_req, res) => {
    const [outgoing, incoming, communicationLogs] = await Promise.all([
      prisma.centralNotification.findMany({
        include: {
          targetCenter: {
            select: centralCenterWithoutApiKeySelect
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 30
      }),
      prisma.centerNotification.findMany({
        include: {
          fromCenter: {
            select: centralCenterWithoutApiKeySelect
          }
        },
        orderBy: {
          receivedAt: "desc"
        },
        take: 30
      }),
      prisma.communicationLog.findMany({
        include: {
          center: {
            select: centralCenterWithoutApiKeySelect
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 30
      })
    ]);

    res.json({
      outgoing,
      incoming,
      communicationLogs
    });
  })
);

router.post(
  "/process",
  asyncHandler(async (_req, res) => {
    res.json(await processCentralNotifications());
  })
);

router.post(
  "/sync-centers/:centerId",
  asyncHandler(async (req, res) => {
    const centerId = Number(req.params.centerId);
    res.json(await syncCenterVisitsNow(centerId));
  })
);

router.post(
  "/dispatch-pending",
  asyncHandler(async (_req, res) => {
    res.json(await processCentralNotifications());
  })
);

export const centralRouter = router;
