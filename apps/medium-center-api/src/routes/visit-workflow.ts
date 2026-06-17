import { CenterUserRole, Prisma, VisitTaskType, VisitWorkflowStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authorize } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { recordAuditLog } from "../services/audit-log";
import { notifyRole } from "../services/internal-notifications";
import { syncCenterVisitsNow } from "../services/notification-processor";
import {
  createPrescriptionVerificationCode,
  hashPrescriptionVerificationCode
} from "../services/prescription-verification";
import {
  checkPrescriptionSafety,
  savePrescriptionWarnings,
  validatePrescriptionSafetyOverride
} from "../services/prescription-safety";
import { notifyPatientAboutResultReport } from "../services/result-report-notifications";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

const createVisitSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  doctorId: z.coerce.number().int().positive().optional(),
  visitDate: z.coerce.date(),
  visitTime: z.string().optional(),
  visitType: z.enum(["CONSULTATION", "EMERGENCY", "FOLLOW_UP", "LAB"]).default("CONSULTATION"),
  priority: z.enum(["NORMAL", "URGENT", "EMERGENCY"]).default("NORMAL"),
  symptoms: z.string().optional(),
  notes: z.string().optional()
});

const triageSchema = z.object({
  bloodPressure: z.string().optional(),
  temperature: z.coerce.number().optional(),
  heartRate: z.coerce.number().int().optional(),
  weightKg: z.coerce.number().optional(),
  heightCm: z.coerce.number().optional(),
  oxygenSaturation: z.coerce.number().optional(),
  respiratoryRate: z.coerce.number().int().optional(),
  bloodGlucose: z.coerce.number().optional(),
  notes: z.string().optional()
});

const doctorAssessmentSchema = z.object({
  diagnosis: z.string().min(3),
  symptoms: z.string().optional(),
  notes: z.string().optional(),
  prescriptions: z
    .array(
      z.object({
        medicineId: z.coerce.number().int().positive().optional(),
        medicineName: z.string().min(2).optional(),
        dosage: z.string().min(1),
        duration: z.string().min(1),
        quantity: z.coerce.number().int().positive().default(1),
        unitPrice: z.coerce.number().nonnegative().optional(),
        instructions: z.string().optional()
      })
    )
    .default([]),
  labTestIds: z.array(z.coerce.number().int().positive()).default([]),
  overridePrescriptionWarnings: z.boolean().optional(),
  overrideReason: z.string().trim().optional()
});

const reportUrlSchema = z
  .string()
  .trim()
  .url("أدخل رابط تقرير صالح يبدأ بـ http أو https.")
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "أدخل رابط تقرير صالح يبدأ بـ http أو https."
  });

const reportLinkSchema = z.object({
  title: z.string().min(2),
  category: z
    .enum(["GENERAL", "LAB", "IMAGING", "RADIOLOGY", "PATHOLOGY", "CARDIOLOGY", "MICROBIOLOGY", "PROCEDURE"])
    .default("GENERAL"),
  reportUrl: reportUrlSchema,
  summary: z.string().trim().optional(),
  shareWithPatient: z.boolean().default(true)
});

const labResultSchema = z.object({
  resultValue: z.string().min(1),
  resultNotes: z.string().optional(),
  resultFileName: z.string().optional(),
  resultMimeType: z.string().optional(),
  resultBase64: z.string().optional()
});

const assignDoctorSchema = z.object({
  doctorId: z.coerce.number().int().positive()
});

const employeeSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
  fullName: z.string().min(2),
  role: z.enum(["RECEPTIONIST", "LAB_TECH", "PHARMACIST", "NURSE"]),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  isActive: z.boolean().default(true)
});

const shiftSchema = z.object({
  dayOfWeek: z.enum(["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]),
  startTime: z.string().min(4),
  endTime: z.string().min(4),
  isActive: z.boolean().default(true)
});

const compensationSchema = z.object({
  monthlySalary: z.coerce.number().nonnegative(),
  currency: z.string().min(3).max(3).default("ILS"),
  effectiveFrom: z.coerce.date(),
  notes: z.string().optional()
});

const diseaseSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  category: z.string().min(2),
  description: z.string().optional(),
  isActive: z.boolean().default(true)
});

const taskTypeSchema = z.enum([
  "RECEPTION_REGISTRATION",
  "NURSING_TRIAGE",
  "DOCTOR_ASSESSMENT",
  "LAB_TEST",
  "PHARMACY_DISPENSING",
  "CENTRAL_UPLOAD",
  "FOLLOW_UP"
]);

const startStageSchema = z.object({
  taskType: taskTypeSchema.optional()
});

function centerIdFromRequest(req: Parameters<typeof asyncHandler>[0] extends never ? never : any) {
  return Number(req.auth?.centerId);
}

async function requireVisit(centerId: number, visitId: number) {
  const visit = await prisma.localVisit.findFirst({
    where: { id: visitId, centerId }
  });

  if (!visit) {
    throw Object.assign(new Error("ملف الزيارة غير موجود في هذا المركز."), { statusCode: 404 });
  }

  return visit;
}

async function completePendingTask(
  tx: Prisma.TransactionClient,
  visitId: number,
  taskType: "NURSING_TRIAGE" | "DOCTOR_ASSESSMENT" | "LAB_TEST" | "PHARMACY_DISPENSING",
  completedById: number,
  resultSummary?: string
) {
  const task = await tx.visitWorkflowTask.findFirst({
    where: { visitId, taskType, status: { in: ["PENDING", "IN_PROGRESS"] } },
    orderBy: { createdAt: "asc" }
  });

  if (task) {
    await tx.visitWorkflowTask.update({
      where: { id: task.id },
      data: {
        status: "COMPLETED",
        completedById,
        completedAt: new Date(),
        resultSummary
      }
    });
  }
}

async function refreshVisitStatus(tx: Prisma.TransactionClient, visitId: number) {
  const [pendingLab, pendingPharmacy] = await Promise.all([
    tx.labRequestLocal.count({
      where: { visitId, status: { in: ["PENDING", "IN_PROGRESS"] } }
    }),
    tx.localPrescription.count({
      where: { visitId, dispensed: false }
    })
  ]);

  const workflowStatus: VisitWorkflowStatus =
    pendingLab > 0 ? "WAITING_LAB" : pendingPharmacy > 0 ? "WAITING_PHARMACY" : "READY_TO_UPLOAD";

  return tx.localVisit.update({
    where: { id: visitId },
    data: {
      workflowStatus,
      uploadStatus: "NOT_READY"
    }
  });
}

function taskTypeForRole(role: CenterUserRole, workflowStatus?: VisitWorkflowStatus): VisitTaskType {
  if (role === "RECEPTIONIST") return "RECEPTION_REGISTRATION";
  if (role === "NURSE") return "NURSING_TRIAGE";
  if (role === "DOCTOR") return "DOCTOR_ASSESSMENT";
  if (role === "LAB_TECH") return "LAB_TEST";
  if (role === "PHARMACIST") return "PHARMACY_DISPENSING";

  if (workflowStatus === "WAITING_TRIAGE") return "NURSING_TRIAGE";
  if (workflowStatus === "WAITING_DOCTOR" || workflowStatus === "IN_TREATMENT") return "DOCTOR_ASSESSMENT";
  if (workflowStatus === "WAITING_LAB") return "LAB_TEST";
  if (workflowStatus === "WAITING_PHARMACY") return "PHARMACY_DISPENSING";
  return "RECEPTION_REGISTRATION";
}

router.get(
  "/",
  authorize("CENTER_MANAGER", "RECEPTIONIST", "DOCTOR", "NURSE", "LAB_TECH", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const role = req.auth!.role as CenterUserRole;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const where: Prisma.LocalVisitWhereInput = {
      centerId,
      ...(status ? { workflowStatus: status as VisitWorkflowStatus } : {})
    };

    if (role === "DOCTOR") {
      where.OR = [{ doctorId: Number(req.auth!.sub) }, { workflowTasks: { some: { assignedToId: Number(req.auth!.sub) } } }];
    }

    const visits = await prisma.localVisit.findMany({
      where,
      include: {
        patient: true,
        doctor: { select: { id: true, fullName: true, role: true } },
        workflowTasks: { orderBy: { createdAt: "asc" } },
        nursingAssessments: { orderBy: { assessedAt: "desc" } },
        prescriptions: true,
        labRequests: { include: { test: true }, orderBy: { requestDate: "asc" } },
        resultReports: {
          include: {
            author: {
              include: {
                doctorProfile: true
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          }
        },
        invoice: true
      },
      orderBy: [{ priority: "desc" }, { checkedInAt: "asc" }]
    });

    if (role === "NURSE") {
      return res.json(
        visits.map(({ diagnosis: _diagnosis, prescriptions: _prescriptions, labRequests: _labRequests, ...visit }) => visit)
      );
    }

    if (role === "PHARMACIST") {
      return res.json(
        visits
          .filter((visit) => visit.prescriptions.length > 0)
          .map(({ nursingAssessments: _assessments, labRequests: _labRequests, ...visit }) => visit)
      );
    }

    if (role === "LAB_TECH") {
      return res.json(
        visits
          .filter((visit) => visit.labRequests.length > 0)
          .map(({ nursingAssessments: _assessments, prescriptions: _prescriptions, ...visit }) => visit)
      );
    }

    res.json(visits);
  })
);

router.get(
  "/catalogs",
  authorize("CENTER_MANAGER", "DOCTOR", "LAB_TECH", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const [medicines, labTests, diseases] = await Promise.all([
      prisma.pharmacyInventoryLocal.findMany({
        where: { centerId },
        orderBy: [{ medicineName: "asc" }, { expiryDate: "asc" }]
      }),
      prisma.labTestLocal.findMany({
        where: { centerId },
        orderBy: [{ category: "asc" }, { testName: "asc" }]
      }),
      prisma.diseaseCatalog.findMany({
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { name: "asc" }]
      })
    ]);

    res.json({ medicines, labTests, diseases });
  })
);

router.get(
  "/intake-options",
  authorize("CENTER_MANAGER", "RECEPTIONIST", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const [patients, doctors] = await Promise.all([
      prisma.localPatient.findMany({
        where: { centerId },
        select: { id: true, fullName: true, phone: true, unifiedId: true },
        orderBy: { fullName: "asc" }
      }),
      prisma.centerUserAccount.findMany({
        where: { centerId, role: "DOCTOR", isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" }
      })
    ]);

    res.json({ patients, doctors });
  })
);

router.get(
  "/upload-queue",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const visits = await prisma.localVisit.findMany({
      where: {
        centerId: centerIdFromRequest(req),
        uploadStatus: { in: ["READY", "QUEUED", "FAILED", "UPLOADED"] }
      },
      select: {
        id: true,
        workflowStatus: true,
        uploadStatus: true,
        uploadError: true,
        completedAt: true,
        uploadedAt: true,
        patient: { select: { fullName: true } },
        invoice: { select: { amount: true, paidAmount: true, status: true } }
      },
      orderBy: [{ uploadStatus: "asc" }, { completedAt: "desc" }]
    });

    res.json(visits);
  })
);

router.patch(
  "/:visitId/start-stage",
  authorize("CENTER_MANAGER", "RECEPTIONIST", "DOCTOR", "NURSE", "LAB_TECH", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const visitId = Number(req.params.visitId);
    const payload = startStageSchema.parse(req.body ?? {});
    const visit = await requireVisit(centerId, visitId);

    if (["COMPLETED", "CANCELLED", "UPLOADED"].includes(visit.workflowStatus)) {
      return res.status(409).json({ message: "لا يمكن بدء مرحلة لزيارة مكتملة أو ملغاة." });
    }

    const role = req.auth!.role as CenterUserRole;
    const requestedTaskType = (payload.taskType ?? taskTypeForRole(role, visit.workflowStatus)) as VisitTaskType;
    const expectedTaskType = taskTypeForRole(role, visit.workflowStatus);

    if (role !== "CENTER_MANAGER" && requestedTaskType !== expectedTaskType) {
      return res.status(403).json({ message: "لا تملك صلاحية بدء هذه المرحلة من مسار الزيارة." });
    }

    const task = await prisma.visitWorkflowTask.findFirst({
      where: {
        visitId,
        taskType: requestedTaskType,
        status: { in: ["PENDING", "IN_PROGRESS"] }
      },
      orderBy: { createdAt: "asc" }
    });

    if (!task) {
      return res.status(409).json({ message: "لا توجد مهمة مفتوحة لهذه المرحلة." });
    }

    if (role === "DOCTOR" && task.assignedToId && task.assignedToId !== Number(req.auth!.sub)) {
      return res.status(403).json({ message: "هذه الزيارة معينة لطبيب آخر." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedTask = await tx.visitWorkflowTask.update({
        where: { id: task.id },
        data: {
          status: "IN_PROGRESS",
          startedAt: task.startedAt ?? new Date(),
          assignedToId:
            task.assignedToId ??
            (role === "CENTER_MANAGER" ? undefined : Number(req.auth!.sub))
        }
      });

      if (requestedTaskType === "DOCTOR_ASSESSMENT") {
        await tx.localVisit.update({
          where: { id: visitId },
          data: { workflowStatus: "IN_TREATMENT" }
        });
      }

      return updatedTask;
    });

    await recordAuditLog(req, {
      action: "START_VISIT_STAGE",
      entityType: "VisitWorkflowTask",
      entityId: result.id,
      centerId,
      newValue: {
        visitId,
        taskType: result.taskType,
        status: result.status
      }
    });

    res.json(result);
  })
);

router.patch(
  "/:visitId/cancel",
  authorize("CENTER_MANAGER", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const visitId = Number(req.params.visitId);
    const visit = await requireVisit(centerId, visitId);

    if (["COMPLETED", "UPLOADED"].includes(visit.workflowStatus) || visit.uploadStatus === "UPLOADED") {
      return res.status(409).json({ message: "لا يمكن إلغاء زيارة مكتملة أو مرفوعة للنظام المركزي." });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.visitWorkflowTask.updateMany({
        where: {
          visitId,
          status: { in: ["PENDING", "IN_PROGRESS"] }
        },
        data: {
          status: "CANCELLED",
          completedAt: new Date()
        }
      });

      return tx.localVisit.update({
        where: { id: visitId },
        data: {
          workflowStatus: "CANCELLED",
          uploadStatus: "NOT_READY",
          completedAt: new Date()
        },
        include: {
          patient: true,
          doctor: { select: { id: true, fullName: true, role: true } },
          workflowTasks: { orderBy: { createdAt: "asc" } },
          nursingAssessments: { orderBy: { assessedAt: "desc" } },
          prescriptions: true,
          labRequests: { include: { test: true }, orderBy: { requestDate: "asc" } },
          invoice: true
        }
      });
    });

    await recordAuditLog(req, {
      action: "CANCEL_VISIT",
      entityType: "LocalVisit",
      entityId: visitId,
      centerId,
      oldValue: {
        workflowStatus: visit.workflowStatus
      },
      newValue: {
        workflowStatus: result.workflowStatus
      }
    });

    res.json(result);
  })
);

router.patch(
  "/:visitId/assign-doctor",
  authorize("CENTER_MANAGER", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const visitId = Number(req.params.visitId);
    const payload = assignDoctorSchema.parse(req.body);
    const visit = await requireVisit(centerId, visitId);

    const doctor = await prisma.centerUserAccount.findFirst({
      where: { id: payload.doctorId, centerId, role: "DOCTOR", isActive: true },
      select: { id: true }
    });

    if (!doctor) {
      return res.status(400).json({ message: "الطبيب المحدد غير متاح في هذا المركز." });
    }

    const updatedVisit = await prisma.$transaction(async (tx) => {
      const nextStatus =
        visit.workflowStatus === "WAITING_RECEPTION" || !visit.doctorId ? "WAITING_TRIAGE" : visit.workflowStatus;

      const updated = await tx.localVisit.update({
        where: { id: visitId },
        data: {
          doctorId: payload.doctorId,
          workflowStatus: nextStatus
        },
        include: {
          patient: true,
          doctor: { select: { id: true, fullName: true, role: true } },
          workflowTasks: { orderBy: { createdAt: "asc" } },
          nursingAssessments: { orderBy: { assessedAt: "desc" } },
          prescriptions: true,
          labRequests: { include: { test: true }, orderBy: { requestDate: "asc" } },
          invoice: true
        }
      });

      const doctorTask = await tx.visitWorkflowTask.findFirst({
        where: { visitId, taskType: "DOCTOR_ASSESSMENT" },
        orderBy: { createdAt: "asc" }
      });

      if (doctorTask) {
        await tx.visitWorkflowTask.update({
          where: { id: doctorTask.id },
          data: { assignedToId: payload.doctorId, assignedRole: "DOCTOR" }
        });
      } else {
        await tx.visitWorkflowTask.create({
          data: {
            visitId,
            taskType: "DOCTOR_ASSESSMENT",
            assignedRole: "DOCTOR",
            assignedToId: payload.doctorId
          }
        });
      }

      return updated;
    });

    await recordAuditLog(req, {
      action: "ASSIGN_VISIT_DOCTOR",
      entityType: "LocalVisit",
      entityId: visitId,
      centerId,
      newValue: { doctorId: payload.doctorId, workflowStatus: updatedVisit.workflowStatus }
    });

    res.json(updatedVisit);
  })
);

router.get(
  "/employees",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const employees = await prisma.centerUserAccount.findMany({
      where: { centerId: centerIdFromRequest(req) },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        phone: true,
        email: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
        shifts: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
        compensation: true
      },
      orderBy: [{ role: "asc" }, { fullName: "asc" }]
    });

    res.json(employees);
  })
);

router.post(
  "/employees",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const payload = employeeSchema.parse(req.body);
    const employee = await prisma.centerUserAccount.create({
      data: {
        centerId: centerIdFromRequest(req),
        username: payload.username,
        passwordHash: payload.password,
        fullName: payload.fullName,
        role: payload.role,
        phone: payload.phone,
        email: payload.email,
        isActive: payload.isActive,
        createdById: Number(req.auth!.sub)
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        phone: true,
        email: true,
        isActive: true
      }
    });

    res.status(201).json(employee);
  })
);

router.patch(
  "/employees/:employeeId/account",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const payload = z
      .object({
        isActive: z.boolean().optional(),
        password: z.string().min(8).optional()
      })
      .refine((value) => value.isActive !== undefined || value.password !== undefined)
      .parse(req.body);

    const employeeId = Number(req.params.employeeId);
    const existing = await prisma.centerUserAccount.findFirst({
      where: { id: employeeId, centerId: centerIdFromRequest(req) }
    });
    if (!existing) {
      return res.status(404).json({ message: "حساب الموظف غير موجود." });
    }

    const employee = await prisma.centerUserAccount.update({
      where: { id: employeeId },
      data: {
        isActive: payload.isActive,
        passwordHash: payload.password
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true
      }
    });

    res.json(employee);
  })
);

router.post(
  "/employees/:employeeId/shifts",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const employeeId = Number(req.params.employeeId);
    const payload = z.array(shiftSchema).min(1).parse(req.body);
    const existing = await prisma.centerUserAccount.findFirst({
      where: { id: employeeId, centerId: centerIdFromRequest(req) }
    });
    if (!existing) {
      return res.status(404).json({ message: "حساب الموظف غير موجود." });
    }

    const shifts = await prisma.$transaction(async (tx) => {
      await tx.employeeShift.deleteMany({ where: { employeeId } });
      await tx.employeeShift.createMany({
        data: payload.map((shift) => ({ employeeId, ...shift }))
      });
      return tx.employeeShift.findMany({
        where: { employeeId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
      });
    });

    res.json(shifts);
  })
);

router.put(
  "/employees/:employeeId/compensation",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const employeeId = Number(req.params.employeeId);
    const payload = compensationSchema.parse(req.body);
    const existing = await prisma.centerUserAccount.findFirst({
      where: { id: employeeId, centerId: centerIdFromRequest(req) }
    });
    if (!existing) {
      return res.status(404).json({ message: "حساب الموظف غير موجود." });
    }

    const compensation = await prisma.employeeCompensation.upsert({
      where: { employeeId },
      create: { employeeId, ...payload },
      update: payload
    });
    res.json(compensation);
  })
);

router.post(
  "/diseases",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const payload = diseaseSchema.parse(req.body);
    const disease = await prisma.diseaseCatalog.create({ data: payload });
    res.status(201).json(disease);
  })
);

router.put(
  "/diseases/:diseaseId",
  authorize("CENTER_MANAGER"),
  asyncHandler(async (req, res) => {
    const payload = diseaseSchema.parse(req.body);
    const disease = await prisma.diseaseCatalog.update({
      where: { id: Number(req.params.diseaseId) },
      data: payload
    });
    res.json(disease);
  })
);

router.post(
  "/",
  authorize("CENTER_MANAGER", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const payload = createVisitSchema.parse(req.body);

    if (payload.doctorId && payload.visitTime && payload.priority !== "EMERGENCY") {
      const conflict = await prisma.localVisit.findFirst({
        where: {
          centerId,
          doctorId: payload.doctorId,
          visitDate: payload.visitDate,
          visitTime: payload.visitTime,
          workflowStatus: { notIn: ["COMPLETED", "CANCELLED"] }
        }
      });

      if (conflict) {
        return res.status(409).json({ message: "الطبيب لديه زيارة أخرى في هذا الموعد. الحالات الطارئة فقط تتجاوز التعارض." });
      }
    }

    const visit = await prisma.$transaction(async (tx) => {
      const created = await tx.localVisit.create({
        data: {
          centerId,
          patientId: payload.patientId,
          doctorId: payload.doctorId,
          visitDate: payload.visitDate,
          visitTime: payload.visitTime,
          visitType: payload.visitType,
          priority: payload.priority,
          symptoms: payload.symptoms,
          notes: payload.notes,
          diagnosis: "بانتظار تقييم الطبيب",
          workflowStatus: "WAITING_TRIAGE",
          uploadStatus: "NOT_READY"
        }
      });

      await tx.visitWorkflowTask.createMany({
        data: [
          {
            visitId: created.id,
            taskType: "RECEPTION_REGISTRATION",
            assignedRole: "RECEPTIONIST",
            status: "COMPLETED",
            completedById: Number(req.auth!.sub),
            completedAt: new Date()
          },
          {
            visitId: created.id,
            taskType: "NURSING_TRIAGE",
            assignedRole: "NURSE"
          },
          {
            visitId: created.id,
            taskType: "DOCTOR_ASSESSMENT",
            assignedRole: "DOCTOR",
            assignedToId: payload.doctorId
          }
        ]
      });

      return created;
    });

    await recordAuditLog(req, {
      action: "QUEUE_VISIT",
      entityType: "LocalVisit",
      entityId: visit.id,
      centerId,
      newValue: {
        patientId: visit.patientId,
        doctorId: visit.doctorId,
        priority: visit.priority,
        workflowStatus: visit.workflowStatus
      }
    });

    await notifyRole({
      centerId,
      role: "NURSE",
      type: "QUEUE_STAGE_ASSIGNED",
      title: "مريض بانتظار التقييم التمريضي",
      message: `زيارة رقم ${visit.id} جاهزة لمرحلة التمريض.`,
      severity: payload.priority === "EMERGENCY" ? "WARNING" : "INFO"
    });

    res.status(201).json(visit);
  })
);

router.patch(
  "/:visitId/triage",
  authorize("CENTER_MANAGER", "NURSE"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const visitId = Number(req.params.visitId);
    const payload = triageSchema.parse(req.body);
    await requireVisit(centerId, visitId);

    const result = await prisma.$transaction(async (tx) => {
      const assessment = await tx.nursingAssessment.create({
        data: {
          visitId,
          nurseId: Number(req.auth!.sub),
          ...payload
        }
      });

      await completePendingTask(tx, visitId, "NURSING_TRIAGE", Number(req.auth!.sub), payload.notes);
      await tx.localVisit.update({
        where: { id: visitId },
        data: {
          bloodPressure: payload.bloodPressure,
          temperature: payload.temperature,
          heartRate: payload.heartRate,
          workflowStatus: "WAITING_DOCTOR"
        }
      });

      return assessment;
    });

    await notifyRole({
      centerId,
      role: "DOCTOR",
      type: "QUEUE_STAGE_ASSIGNED",
      title: "مريض بانتظار الطبيب",
      message: `زيارة رقم ${visitId} اكتمل تقييمها التمريضي.`,
      severity: "INFO"
    });

    res.json(result);
  })
);

router.patch(
  "/:visitId/doctor",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const visitId = Number(req.params.visitId);
    const payload = doctorAssessmentSchema.parse(req.body);
    const visit = await requireVisit(centerId, visitId);
    const doctorId = req.auth!.role === "DOCTOR" ? Number(req.auth!.sub) : visit.doctorId;

    if (!doctorId) {
      return res.status(400).json({ message: "يجب تعيين طبيب للزيارة قبل تسجيل التقييم الطبي." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const medicineIds = payload.prescriptions.flatMap((prescription) =>
        prescription.medicineId ? [prescription.medicineId] : []
      );
      const [medicines, labTests] = await Promise.all([
        tx.pharmacyInventoryLocal.findMany({
          where: { centerId, id: { in: medicineIds } }
        }),
        tx.labTestLocal.findMany({
          where: { centerId, id: { in: payload.labTestIds } }
        })
      ]);
      const medicineById = new Map(medicines.map((medicine) => [medicine.id, medicine]));

      if (medicines.length !== new Set(medicineIds).size) {
        throw Object.assign(new Error("يتضمن الطلب دواء غير موجود في مخزون هذا المركز."), { statusCode: 400 });
      }
      if (labTests.length !== new Set(payload.labTestIds).size) {
        throw Object.assign(new Error("يتضمن الطلب فحصاً غير موجود في مختبر هذا المركز."), { statusCode: 400 });
      }

      await tx.localVisit.update({
        where: { id: visitId },
        data: {
          doctorId,
          diagnosis: payload.diagnosis,
          symptoms: payload.symptoms,
          notes: payload.notes,
          workflowStatus: "IN_TREATMENT"
        }
      });

      if (payload.prescriptions.length > 0) {
        const resolvedPrescriptions = payload.prescriptions.map((prescription, index) => {
          const inventoryItem = prescription.medicineId ? medicineById.get(prescription.medicineId) : undefined;
          const medicineName = inventoryItem?.medicineName ?? prescription.medicineName?.trim();

          if (!medicineName) {
            throw new AppError("Choose a medicine from inventory or enter the medicine name.", 400);
          }

          return {
            ...prescription,
            medicineName,
            prescriptionIndex: index
          };
        });
        const safetyWarnings = await checkPrescriptionSafety({
          centerId,
          patientId: visit.patientId,
          activeVisitId: visitId,
          prescriptions: resolvedPrescriptions.map((prescription) => ({
            medicineId: prescription.medicineId,
            medicineName: prescription.medicineName
          }))
        });

        validatePrescriptionSafetyOverride({
          warnings: safetyWarnings,
          overrideWarnings: payload.overridePrescriptionWarnings,
          overrideReason: payload.overrideReason
        });

        await tx.localPrescription.createMany({
          data: payload.prescriptions.map((prescription, index) => {
            const inventoryItem = prescription.medicineId
              ? medicineById.get(prescription.medicineId)
              : undefined;
            const medicineName = inventoryItem?.medicineName ?? prescription.medicineName;
            const verificationCode = createPrescriptionVerificationCode(centerId, visitId, index);
            if (!medicineName) {
              throw Object.assign(new Error("يجب اختيار دواء من المخزون أو كتابة اسمه."), { statusCode: 400 });
            }

            return {
              visitId,
              medicineId: prescription.medicineId,
              medicineName,
              dosage: prescription.dosage,
              duration: prescription.duration,
              quantity: prescription.quantity,
              unitPrice: inventoryItem?.sellingPrice ?? prescription.unitPrice,
              instructions: prescription.instructions,
              verificationCode,
              verificationHash: hashPrescriptionVerificationCode(verificationCode)
            };
          })
        });
        const createdPrescriptions = await tx.localPrescription.findMany({
          where: {
            visitId,
            verificationCode: {
              in: resolvedPrescriptions.map((prescription) =>
                createPrescriptionVerificationCode(centerId, visitId, prescription.prescriptionIndex)
              )
            }
          },
          select: {
            id: true,
            verificationCode: true
          }
        });
        const createdPrescriptionByCode = new Map(
          createdPrescriptions.map((prescription) => [prescription.verificationCode, prescription])
        );

        for (const prescription of resolvedPrescriptions) {
          const verificationCode = createPrescriptionVerificationCode(centerId, visitId, prescription.prescriptionIndex);
          const createdPrescription = createdPrescriptionByCode.get(verificationCode);

          if (!createdPrescription) {
            continue;
          }

          await savePrescriptionWarnings(tx, {
            patientId: visit.patientId,
            prescriptionId: createdPrescription.id,
            prescriptionIndex: prescription.prescriptionIndex,
            warnings: safetyWarnings,
            overridden: Boolean(payload.overridePrescriptionWarnings),
            overrideReason: payload.overrideReason
          });
        }

        await tx.visitWorkflowTask.create({
          data: {
            visitId,
            taskType: "PHARMACY_DISPENSING",
            assignedRole: "PHARMACIST",
            instructions: "صرف الوصفة الطبية المسجلة للزيارة."
          }
        });
      }

      if (payload.labTestIds.length > 0) {
        await tx.labRequestLocal.createMany({
          data: payload.labTestIds.map((testId) => ({
            centerId,
            patientId: visit.patientId,
            doctorId,
            visitId,
            testId
          }))
        });
        await tx.visitWorkflowTask.create({
          data: {
            visitId,
            taskType: "LAB_TEST",
            assignedRole: "LAB_TECH",
            instructions: "إجراء الفحوصات المطلوبة وإرفاق النتائج."
          }
        });
      }

      await completePendingTask(tx, visitId, "DOCTOR_ASSESSMENT", doctorId, payload.diagnosis);
      return refreshVisitStatus(tx, visitId);
    });

    await recordAuditLog(req, {
      action: "CREATE_PRESCRIPTION",
      entityType: "LocalVisit",
      entityId: visitId,
      centerId,
      newValue: {
        diagnosis: payload.diagnosis,
        prescriptionCount: payload.prescriptions.length,
        labRequestCount: payload.labTestIds.length
      }
    });

    if (payload.labTestIds.length > 0) {
      await notifyRole({
        centerId,
        role: "LAB_TECH",
        type: "LAB_REQUEST_READY",
        title: "طلب مختبر جديد",
        message: `زيارة رقم ${visitId} لديها فحوصات مخبرية بانتظار التنفيذ.`,
        severity: "INFO"
      });
    }

    if (payload.prescriptions.length > 0) {
      await notifyRole({
        centerId,
        role: "PHARMACIST",
        type: "PRESCRIPTION_WAITING",
        title: "وصفة بانتظار الصرف",
        message: `زيارة رقم ${visitId} لديها وصفة دوائية بانتظار الصيدلية.`,
        severity: "INFO"
      });
    }

    res.json(result);
  })
);

router.patch(
  "/lab/:requestId/result",
  authorize("CENTER_MANAGER", "LAB_TECH"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const requestId = Number(req.params.requestId);
    const payload = labResultSchema.parse(req.body);
    const requestRecord = await prisma.labRequestLocal.findFirst({
      where: { id: requestId, centerId }
    });

    if (!requestRecord) {
      return res.status(404).json({ message: "طلب الفحص غير موجود." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.labRequestLocal.update({
        where: { id: requestId },
        data: {
          ...payload,
          status: "COMPLETED",
          completedById: Number(req.auth!.sub),
          resultDate: new Date()
        }
      });

      if (requestRecord.visitId) {
        const remaining = await tx.labRequestLocal.count({
          where: {
            visitId: requestRecord.visitId,
            id: { not: requestId },
            status: { in: ["PENDING", "IN_PROGRESS"] }
          }
        });
        if (remaining === 0) {
          await completePendingTask(tx, requestRecord.visitId, "LAB_TEST", Number(req.auth!.sub), payload.resultNotes);
        }
        await refreshVisitStatus(tx, requestRecord.visitId);
      }

      return updated;
    });

    await recordAuditLog(req, {
      action: "CREATE_LAB_RESULT",
      entityType: "LabRequestLocal",
      entityId: result.id,
      centerId,
      newValue: {
        status: result.status,
        resultValue: result.resultValue,
        resultNotes: result.resultNotes
      }
    });

    if (requestRecord.visitId) {
      await notifyRole({
        centerId,
        role: "DOCTOR",
        type: "LAB_RESULT_READY",
        title: "نتيجة مختبر جاهزة",
        message: `نتيجة مختبر لزيارة رقم ${requestRecord.visitId} أصبحت جاهزة للمراجعة.`,
        severity: "INFO"
      });
    }

    res.json(result);
  })
);

router.patch(
  "/prescriptions/:prescriptionId/dispense",
  authorize("CENTER_MANAGER", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const prescriptionId = Number(req.params.prescriptionId);
    const prescription = await prisma.localPrescription.findFirst({
      where: { id: prescriptionId, visit: { centerId } }
    });

    if (!prescription) {
      return res.status(404).json({ message: "الوصفة غير موجودة." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.localPrescription.update({
        where: { id: prescriptionId },
        data: {
          dispensed: true,
          dispensedById: Number(req.auth!.sub),
          dispensedAt: new Date()
        }
      });

      const remaining = await tx.localPrescription.count({
        where: { visitId: prescription.visitId, id: { not: prescriptionId }, dispensed: false }
      });
      if (remaining === 0) {
        await completePendingTask(tx, prescription.visitId, "PHARMACY_DISPENSING", Number(req.auth!.sub));
      }
      await refreshVisitStatus(tx, prescription.visitId);
      return updated;
    });

    await recordAuditLog(req, {
      action: "DISPENSE_MEDICINE",
      entityType: "LocalPrescription",
      entityId: result.id,
      centerId,
      newValue: {
        medicineName: result.medicineName,
        quantity: result.quantity,
        dispensed: result.dispensed
      }
    });

    res.json(result);
  })
);

router.post(
  "/:visitId/report-link",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const visitId = Number(req.params.visitId);
    const payload = reportLinkSchema.parse(req.body);
    const visit = await prisma.localVisit.findFirst({
      where: {
        id: visitId,
        centerId
      },
      select: {
        id: true,
        patientId: true,
        doctorId: true,
        diagnosis: true
      }
    });

    if (!visit) {
      return res.status(404).json({ message: "ملف الزيارة غير موجود في هذا المركز." });
    }

    if (req.auth!.role === "DOCTOR" && visit.doctorId && visit.doctorId !== Number(req.auth!.sub)) {
      return res.status(403).json({ message: "هذه الزيارة معينة لطبيب آخر." });
    }

    if (!visit.diagnosis || visit.diagnosis === "بانتظار تقييم الطبيب") {
      return res.status(409).json({ message: "احفظ تقييم الطبيب أولاً قبل إضافة رابط التقرير." });
    }

    const report = await prisma.localResultReport.create({
      data: {
        centerId,
        patientId: visit.patientId,
        visitId: visit.id,
        authorId: Number(req.auth?.sub),
        title: payload.title,
        category: payload.category,
        summary: payload.summary?.trim() || payload.title,
        reportUrl: payload.reportUrl,
        shareWithPatient: payload.shareWithPatient,
        attachmentFileName: null,
        attachmentMimeType: null,
        attachmentBase64: null
      }
    });

    await recordAuditLog(req, {
      action: "CREATE_RESULT_REPORT_LINK",
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

router.post(
  "/:visitId/complete",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const visitId = Number(req.params.visitId);
    await requireVisit(centerId, visitId);

    const pendingTasks = await prisma.visitWorkflowTask.count({
      where: {
        visitId,
        taskType: { in: ["LAB_TEST", "PHARMACY_DISPENSING"] },
        status: { in: ["PENDING", "IN_PROGRESS"] }
      }
    });

    if (pendingTasks > 0) {
      return res.status(409).json({ message: "لا يمكن تجهيز الملف للرفع قبل اكتمال مهام المختبر والصيدلية المطلوبة." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const visit = await tx.localVisit.findUniqueOrThrow({
        where: { id: visitId },
        include: {
          prescriptions: true,
          labRequests: { include: { test: true } }
        }
      });
      const prescriptionsAmount = visit.prescriptions.reduce(
        (total, prescription) => total + (prescription.unitPrice ?? 0) * prescription.quantity,
        0
      );
      const labAmount = visit.labRequests.reduce((total, request) => total + request.test.price, 0);
      const amount = Number((prescriptionsAmount + labAmount).toFixed(2));

      const invoice = await tx.localInvoice.upsert({
        where: { visitId },
        create: {
          centerId,
          patientId: visit.patientId,
          visitId,
          amount
        },
        update: { amount }
      });
      const updatedVisit = await tx.localVisit.update({
        where: { id: visitId },
        data: {
          workflowStatus: "READY_TO_UPLOAD",
          uploadStatus: "READY",
          uploadError: null,
          completedAt: new Date()
        }
      });

      return { visit: updatedVisit, invoice };
    });

    await recordAuditLog(req, {
      action: "COMPLETE_VISIT",
      entityType: "LocalVisit",
      entityId: result.visit.id,
      centerId,
      newValue: {
        invoiceId: result.invoice.id,
        amount: result.invoice.amount
      }
    });

    res.json(result);
  })
);

router.post(
  "/:visitId/upload",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const visitId = Number(req.params.visitId);
    const visit = await requireVisit(centerId, visitId);

    if (!["READY", "FAILED"].includes(visit.uploadStatus)) {
      return res.status(409).json({ message: "يجب تجهيز ملف الزيارة والفاتورة قبل رفعهما إلى النظام المركزي." });
    }

    await prisma.localVisit.update({
      where: { id: visitId },
      data: {
        uploadStatus: "QUEUED",
        workflowStatus: "UPLOAD_PENDING",
        uploadError: null,
        syncState: "PENDING",
        syncedToCentral: false
      }
    });

    try {
      await syncCenterVisitsNow(centerId, 3650);
      const syncedVisit = await prisma.localVisit.findUniqueOrThrow({ where: { id: visitId } });

      if (!syncedVisit.syncedToCentral) {
        throw new Error("لم يؤكد النظام المركزي استلام الزيارة.");
      }

      const uploaded = await prisma.localVisit.update({
        where: { id: visitId },
        data: {
          uploadStatus: "UPLOADED",
          workflowStatus: "COMPLETED",
          uploadedAt: new Date(),
          uploadError: null
        },
        include: { invoice: true }
      });
      return res.json(uploaded);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر رفع الزيارة إلى النظام المركزي.";
      await prisma.localVisit.update({
        where: { id: visitId },
        data: {
          uploadStatus: "FAILED",
          workflowStatus: "READY_TO_UPLOAD",
          uploadError: message
        }
      });
      throw Object.assign(new Error(message), { statusCode: 502 });
    }
  })
);

export const visitWorkflowRouter = router;
