import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authorizeWorkspace, authenticate } from "../middleware/auth";
import { enqueueOutgoingNotification, processOutgoingNotifications } from "../services/notification-processor";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

const patientCreateSchema = z.object({
  full_name: z.string().min(3),
  date_of_birth: z.coerce.date(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]),
  primary_phone: z.string().min(6),
  address: z.string().min(5),
  national_id: z.string().optional(),
  blood_type: z.string().optional(),
  allergies: z.array(z.string()).default([]),
  chronic_diseases: z.array(z.string()).default([])
});

router.get(
  "/patients/search",
  authenticate,
  authorizeWorkspace("center", "central"),
  asyncHandler(async (req, res) => {
    const phone = String(req.query.phone ?? "");
    const patient = await prisma.unifiedPatient.findFirst({
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
    });

    if (!patient) {
      return res.json({ found: false });
    }

    return res.json({
      found: true,
      patient,
      recent_visits: patient.unifiedVisits.map((visit) => ({
        id: visit.id,
        center_name: visit.center.centerName,
        primary_diagnosis: visit.primaryDiagnosis,
        visit_date: visit.visitDate
      }))
    });
  })
);

router.post(
  "/patients/create",
  authenticate,
  authorizeWorkspace("center"),
  asyncHandler(async (req, res) => {
    const payload = patientCreateSchema.parse(req.body);
    const patient = await prisma.unifiedPatient.create({
      data: {
        unifiedId: `P-${new Date().getFullYear()}-${Date.now().toString().slice(-7)}`,
        nationalId: payload.national_id,
        fullName: payload.full_name,
        dateOfBirth: payload.date_of_birth,
        gender: payload.gender,
        primaryPhone: payload.primary_phone,
        address: payload.address,
        bloodType: payload.blood_type,
        allergies: payload.allergies,
        chronicDiseases: payload.chronic_diseases
      }
    });

    res.status(201).json({
      success: true,
      unified_id: patient.unifiedId,
      patient
    });
  })
);

router.post(
  "/notifications/from-center",
  authenticate,
  authorizeWorkspace("center"),
  asyncHandler(async (req, res) => {
    const centerId = Number(req.auth!.centerId);
    const body = z
      .object({
        notification_type: z.enum([
          "REQUEST_NEW_VISITS",
          "REQUEST_PATIENT_DATA",
          "REQUEST_LAB_RESULTS",
          "SYNC_MASTER_DATA",
          "PING",
          "NOTIFY_REFERRAL",
          "NOTIFY_REFERRAL_RESPONSE",
          "REFERRAL_REQUEST",
          "ALERT"
        ]),
        payload: z.record(z.any()),
        process_now: z.boolean().default(true)
      })
      .parse(req.body);

    const notification = await enqueueOutgoingNotification(centerId, body.notification_type, body.payload);

    if (body.process_now) {
      await processOutgoingNotifications(centerId);
    }

    res.status(201).json({
      success: true,
      notification_id: notification.id
    });
  })
);

router.patch(
  "/notifications/incoming/:id/respond",
  authenticate,
  authorizeWorkspace("center"),
  asyncHandler(async (req, res) => {
    const payload = z
      .object({
      status: z.enum(["completed", "failed"]),
        response_payload: z.record(z.any()).optional(),
        response_error: z.string().optional()
      })
      .parse(req.body);

    const notificationId = Number(req.params.id);

    const notification = await prisma.centralNotification.update({
      where: { id: notificationId },
      data: {
        status: payload.status === "completed" ? "COMPLETED" : "FAILED",
        acknowledgedAt: new Date(),
        completedAt: new Date(),
        responsePayload: payload.response_payload,
        responseError: payload.response_error
      }
    });

    res.json(notification);
  })
);

router.get(
  "/centers/:centerId/status",
  authenticate,
  authorizeWorkspace("center", "central"),
  asyncHandler(async (req, res) => {
    const center = await prisma.centralCenter.findUnique({
      where: {
        id: Number(req.params.centerId)
      }
    });

    res.json({
      center_id: center?.id,
      center_code: center?.centerCode,
      center_name: center?.centerName,
      is_connected: center?.isConnected ?? false,
      last_sync_at: center?.lastSyncAt ?? null,
      suspension_reason: center?.suspensionReason ?? null
    });
  })
);

export const networkRouter = router;
