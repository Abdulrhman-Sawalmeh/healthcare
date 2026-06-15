import { Prisma, VisitWorkflowStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authorize } from "../middleware/auth";
import { recordAuditLog } from "../services/audit-log";
import { notifyRole } from "../services/internal-notifications";
import { syncCenterVisitsNow } from "../services/notification-processor";
import {
  createPrescriptionVerificationCode,
  hashPrescriptionVerificationCode
} from "../services/prescription-verification";
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

const doctorAssessmentSchema = z.object({
  diagnosis: z.string().min(3),
  symptoms: z.string().optional(),
  bloodPressure: z.string().optional(),
  temperature: z.coerce.number().optional(),
  heartRate: z.coerce.number().int().optional(),
  notes: z.string().optional(),
  prescriptions: z.array(z.object({
    medicineId: z.coerce.number().int().positive().optional(),
    medicineName: z.string().min(2).optional(),
    dosage: z.string().min(1),
    duration: z.string().min(1),
    quantity: z.coerce.number().int().positive().default(1),
    unitPrice: z.coerce.number().nonnegative().optional(),
    instructions: z.string().optional()
  })).default([])
});

const assignDoctorSchema = z.object({
  doctorId: z.coerce.number().int().positive()
});

function centerIdFromRequest(req: any) {
  return Number(req.auth?.centerId);
}

async function requireVisit(centerId: number, visitId: number) {
  const visit = await prisma.localVisit.findFirst({ where: { id: visitId, centerId } });
  if (!visit) {
    throw Object.assign(new Error("ملف الزيارة غير موجود في هذا المركز."), { statusCode: 404 });
  }
  return visit;
}

router.get(
  "/",
  authorize("CENTER_MANAGER", "RECEPTIONIST", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const where: Prisma.LocalVisitWhereInput = {
      centerId,
      ...(status ? { workflowStatus: status as VisitWorkflowStatus } : {})
    };

    if (req.auth!.role === "DOCTOR") {
      where.doctorId = Number(req.auth!.sub);
    }

    const visits = await prisma.localVisit.findMany({
      where,
      include: {
        patient: true,
        doctor: { select: { id: true, fullName: true, role: true } },
        prescriptions: true,
        invoice: true
      },
      orderBy: [{ priority: "desc" }, { checkedInAt: "asc" }]
    });

    res.json(visits);
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
  "/catalogs",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const medicines = await prisma.pharmacyInventoryLocal.findMany({
      where: { centerId: centerIdFromRequest(req) },
      orderBy: [{ medicineName: "asc" }, { expiryDate: "asc" }]
    });
    res.json({ medicines });
  })
);

router.patch(
  "/:visitId/assign-doctor",
  authorize("CENTER_MANAGER", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const visitId = Number(req.params.visitId);
    const payload = assignDoctorSchema.parse(req.body);
    await requireVisit(centerId, visitId);

    const doctor = await prisma.centerUserAccount.findFirst({
      where: { id: payload.doctorId, centerId, role: "DOCTOR", isActive: true },
      select: { id: true }
    });

    if (!doctor) {
      return res.status(400).json({ message: "الطبيب المحدد غير متاح في هذا المركز." });
    }

    const updatedVisit = await prisma.localVisit.update({
      where: { id: visitId },
      data: {
        doctorId: payload.doctorId,
        workflowStatus: "WAITING_DOCTOR"
      },
      include: {
        patient: true,
        doctor: { select: { id: true, fullName: true, role: true } },
        prescriptions: true,
        invoice: true
      }
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

router.post(
  "/",
  authorize("CENTER_MANAGER", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const payload = createVisitSchema.parse(req.body);
    const [patient, doctor] = await Promise.all([
      prisma.localPatient.findFirst({ where: { id: payload.patientId, centerId } }),
      payload.doctorId
        ? prisma.centerUserAccount.findFirst({ where: { id: payload.doctorId, centerId, role: "DOCTOR", isActive: true } })
        : Promise.resolve(null)
    ]);

    if (!patient) return res.status(400).json({ message: "المريض المحدد لا ينتمي إلى هذا المركز." });
    if (payload.doctorId && !doctor) return res.status(400).json({ message: "الطبيب المحدد غير متاح في هذا المركز." });

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

    const visit = await prisma.localVisit.create({
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
        workflowStatus: "WAITING_DOCTOR",
        uploadStatus: "NOT_READY"
      }
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
      role: "DOCTOR",
      type: "QUEUE_STAGE_ASSIGNED",
      title: "مريض بانتظار الطبيب",
      message: `زيارة رقم ${visit.id} جاهزة للتقييم الطبي.`,
      severity: payload.priority === "EMERGENCY" ? "WARNING" : "INFO"
    });

    res.status(201).json(visit);
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

    if (!doctorId) return res.status(400).json({ message: "يجب تعيين طبيب للزيارة قبل تسجيل التقييم." });
    if (req.auth!.role === "DOCTOR" && visit.doctorId && visit.doctorId !== doctorId) {
      return res.status(403).json({ message: "هذه الزيارة معينة لطبيب آخر." });
    }

    const medicineIds = payload.prescriptions.flatMap((item) => item.medicineId ? [item.medicineId] : []);
    const medicines = await prisma.pharmacyInventoryLocal.findMany({
      where: { centerId, id: { in: medicineIds } }
    });
    if (medicines.length !== new Set(medicineIds).size) {
      return res.status(400).json({ message: "تتضمن الوصفة دواء غير موجود في مخزون المركز." });
    }
    const medicineById = new Map(medicines.map((item) => [item.id, item]));

    const updated = await prisma.$transaction(async (tx) => {
      await tx.localPrescription.deleteMany({ where: { visitId } });
      if (payload.prescriptions.length > 0) {
        await tx.localPrescription.createMany({
          data: payload.prescriptions.map((item, index) => {
            const inventory = item.medicineId ? medicineById.get(item.medicineId) : undefined;
            const medicineName = inventory?.medicineName ?? item.medicineName;
            const verificationCode = createPrescriptionVerificationCode(centerId, visitId, index);
            if (!medicineName) throw Object.assign(new Error("اختر دواء أو اكتب اسمه."), { statusCode: 400 });
            return {
              visitId,
              medicineId: item.medicineId,
              medicineName,
              dosage: item.dosage,
              duration: item.duration,
              quantity: item.quantity,
              unitPrice: inventory?.sellingPrice ?? item.unitPrice,
              instructions: item.instructions,
              verificationCode,
              verificationHash: hashPrescriptionVerificationCode(verificationCode)
            };
          })
        });
      }

      return tx.localVisit.update({
        where: { id: visitId },
        data: {
          doctorId,
          diagnosis: payload.diagnosis,
          symptoms: payload.symptoms,
          bloodPressure: payload.bloodPressure,
          temperature: payload.temperature,
          heartRate: payload.heartRate,
          notes: payload.notes,
          workflowStatus: "READY_TO_UPLOAD",
          uploadStatus: "NOT_READY"
        },
        include: { prescriptions: true }
      });
    });

    await recordAuditLog(req, {
      action: "CREATE_PRESCRIPTION",
      entityType: "LocalVisit",
      entityId: updated.id,
      centerId,
      newValue: {
        diagnosis: updated.diagnosis,
        prescriptionCount: updated.prescriptions.length
      }
    });

    if (updated.prescriptions.length > 0) {
      await notifyRole({
        centerId,
        role: "PHARMACIST",
        type: "PRESCRIPTION_WAITING",
        title: "وصفة بانتظار الصرف",
        message: `زيارة رقم ${visitId} لديها وصفة دوائية بانتظار الصيدلية.`,
        severity: "INFO"
      });
    }

    res.json(updated);
  })
);

router.post(
  "/:visitId/complete",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const visitId = Number(req.params.visitId);
    await requireVisit(centerId, visitId);

    const result = await prisma.$transaction(async (tx) => {
      const visit = await tx.localVisit.findUniqueOrThrow({
        where: { id: visitId },
        include: { prescriptions: true }
      });
      const amount = Number(visit.prescriptions.reduce(
        (total, item) => total + (item.unitPrice ?? 0) * item.quantity,
        0
      ).toFixed(2));
      const invoice = await tx.localInvoice.upsert({
        where: { visitId },
        create: { centerId, patientId: visit.patientId, visitId, amount },
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

    const result = await prisma.localVisit.update({
      where: { id: visitId },
      data: {
        workflowStatus: "CANCELLED",
        uploadStatus: "NOT_READY",
        completedAt: new Date()
      },
      include: {
        patient: true,
        doctor: { select: { id: true, fullName: true, role: true } },
        prescriptions: true,
        invoice: true
      }
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

router.post(
  "/:visitId/upload",
  authorize("CENTER_MANAGER", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const centerId = centerIdFromRequest(req);
    const visitId = Number(req.params.visitId);
    const visit = await requireVisit(centerId, visitId);
    if (!["READY", "FAILED"].includes(visit.uploadStatus)) {
      return res.status(409).json({ message: "يجب تجهيز ملف الزيارة والفاتورة قبل الرفع." });
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
      const synced = await prisma.localVisit.findUniqueOrThrow({ where: { id: visitId } });
      if (!synced.syncedToCentral) throw new Error("لم يؤكد النظام المركزي استلام الزيارة.");
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
      res.json(uploaded);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر رفع الزيارة.";
      await prisma.localVisit.update({
        where: { id: visitId },
        data: { uploadStatus: "FAILED", workflowStatus: "READY_TO_UPLOAD", uploadError: message }
      });
      throw Object.assign(new Error(message), { statusCode: 502 });
    }
  })
);

export const visitWorkflowRouter = router;
