import { AppointmentStatus, AppointmentType, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/error";
import {
  appointmentPriorityValues,
  findAppointmentConflict,
  getAppointmentSuggestions
} from "../services/appointment-suggestions";
import { asyncHandler } from "../utils/async-handler";
import { getSingleParam } from "../utils/request";
import { mapAppointment } from "../utils/serializers";
import { requireProfileId, resolveCenterScope } from "../utils/scope";

const router = Router();

const createAppointmentSchema = z.object({
  centerId: z.string().uuid().optional(),
  departmentId: z.string().uuid(),
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid(),
  scheduledAt: z.coerce.date(),
  type: z.nativeEnum(AppointmentType).default(AppointmentType.CLINIC),
  reason: z.string().min(5),
  notes: z.string().optional()
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(AppointmentStatus),
  waitingMinutes: z.number().int().min(0).max(999).optional(),
  attended: z.boolean().optional(),
  notes: z.string().optional()
});

const appointmentSuggestionQuerySchema = z.object({
  centerId: z.string().uuid().optional(),
  doctorId: z.string().uuid(),
  preferredDate: z.coerce.date(),
  appointmentType: z.nativeEnum(AppointmentType).default(AppointmentType.CLINIC),
  priority: z.enum(appointmentPriorityValues).default("NORMAL")
});

router.get(
  "/suggestions",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const payload = appointmentSuggestionQuerySchema.parse(req.query);
    const centerId = resolveCenterScope(req, payload.centerId);

    if (!centerId) {
      throw new AppError("A center must be selected before loading appointment suggestions.", 400);
    }

    const suggestions = await getAppointmentSuggestions({
      centerId,
      doctorId: payload.doctorId,
      preferredDate: payload.preferredDate,
      appointmentType: payload.appointmentType,
      priority: payload.priority,
      patientId:
        req.auth?.role === UserRole.PATIENT
          ? requireProfileId(req.auth.patientProfileId, "Patient profile is required.")
          : undefined
    });

    res.json(
      suggestions.map((suggestion) => ({
        scheduledAt: suggestion.scheduledAt,
        type: suggestion.type,
        priority: suggestion.priority,
        note: suggestion.note,
        doctor: suggestion.doctor
      }))
    );
  })
);

router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const queryCenterId = typeof req.query.centerId === "string" ? req.query.centerId : undefined;
    const centerId = resolveCenterScope(req, queryCenterId);
    const status =
      typeof req.query.status === "string" && req.query.status in AppointmentStatus
        ? (req.query.status as AppointmentStatus)
        : undefined;

    const where: Prisma.AppointmentWhereInput = {};

    if (centerId) {
      where.centerId = centerId;
    }

    if (status) {
      where.status = status;
    }

    if (req.auth?.role === UserRole.PATIENT) {
      where.patientId = requireProfileId(req.auth.patientProfileId, "Patient profile is required.");
    }

    if (req.auth?.role === UserRole.DOCTOR) {
      where.doctorId = requireProfileId(req.auth.doctorProfileId, "Doctor profile is required.");
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
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
      },
      orderBy: {
        scheduledAt: "asc"
      }
    });

    res.json(appointments.map(mapAppointment));
  })
);

router.post(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const payload = createAppointmentSchema.parse(req.body);
    const centerId = resolveCenterScope(req, payload.centerId);

    if (!centerId) {
      throw new AppError("A center must be selected to create an appointment.", 400);
    }

    if (payload.scheduledAt <= new Date()) {
      throw new AppError("Appointment time must be in the future.", 400);
    }

    const patientId =
      req.auth?.role === UserRole.PATIENT
        ? requireProfileId(req.auth.patientProfileId, "Patient profile is required.")
        : payload.patientId;

    if (!patientId) {
      throw new AppError("A patient must be selected to create an appointment.", 400);
    }

    const doctor = await prisma.doctorProfile.findUnique({
      where: { id: payload.doctorId },
      include: {
        user: true,
        department: true
      }
    });

    if (!doctor || doctor.centerId !== centerId) {
      throw new AppError("Selected doctor does not belong to the active center.", 400);
    }

    if (doctor.departmentId !== payload.departmentId) {
      throw new AppError("Selected department does not match the chosen doctor.", 400);
    }

    const conflictingAppointment = await findAppointmentConflict({
      centerId,
      doctorId: payload.doctorId,
      scheduledAt: payload.scheduledAt
    });

    if (conflictingAppointment) {
      throw new AppError("The selected time is already booked for this doctor. Please choose another slot.", 409);
    }

    const appointment = await prisma.appointment.create({
      data: {
        centerId,
        departmentId: payload.departmentId,
        patientId,
        doctorId: payload.doctorId,
        scheduledAt: payload.scheduledAt,
        type: payload.type,
        reason: payload.reason,
        notes: payload.notes
      },
      include: {
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
      }
    });

    await prisma.notification.createMany({
      data: [
        {
          userId: appointment.patient.userId,
          title: "تم تأكيد حجز الموعد",
          body: `تم حجز موعدك مع ${appointment.doctor.user.fullName}.`,
          type: "APPOINTMENT"
        },
        {
          userId: appointment.doctor.userId,
          title: "موعد جديد بحاجة إلى متابعة",
          body: `تم تسجيل موعد جديد للمريض ${appointment.patient.user.fullName}.`,
          type: "APPOINTMENT"
        }
      ]
    });

    res.status(201).json(mapAppointment(appointment));
  })
);

router.patch(
  "/:appointmentId/status",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const payload = updateStatusSchema.parse(req.body);
    const appointmentId = getSingleParam(req.params.appointmentId, "Appointment ID");
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    });

    if (!appointment) {
      throw new AppError("Appointment not found.", 404);
    }

    if (req.auth?.role === UserRole.PATIENT) {
      const patientId = requireProfileId(req.auth.patientProfileId, "Patient profile is required.");
      if (appointment.patientId !== patientId) {
        throw new AppError("You can only update your own appointments.", 403);
      }
      if (payload.status !== AppointmentStatus.CANCELLED) {
        throw new AppError("Patients can only cancel appointments.", 403);
      }
    }

    if (req.auth?.role === UserRole.DOCTOR) {
      const doctorId = requireProfileId(req.auth.doctorProfileId, "Doctor profile is required.");
      if (appointment.doctorId !== doctorId) {
        throw new AppError("You can only update appointments assigned to you.", 403);
      }
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: payload.status,
        waitingMinutes: payload.waitingMinutes,
        attended: payload.attended,
        notes: payload.notes ?? appointment.notes
      },
      include: {
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
      }
    });

    res.json(mapAppointment(updated));
  })
);

export const appointmentsRouter = router;
