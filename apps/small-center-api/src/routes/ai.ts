import { Router } from "express";
import { z } from "zod";

import { authenticate, authorize } from "../middleware/auth";
import { generateCareInsights } from "../services/ai-assistant";
import { AppRole } from "../types/auth";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

const aiRoles: AppRole[] = [
  "CENTER_MANAGER",
  "DOCTOR",
  "RECEPTIONIST",
  "NURSE",
  "LAB_TECH",
  "PHARMACIST",
  "PATIENT"
];

const careInsightSchema = z.object({
  message: z.string().trim().min(3).max(2500),
  patientAge: z.coerce.number().int().min(0).max(130).optional(),
  gender: z.string().trim().max(40).optional(),
  chronicDiseases: z.string().trim().max(700).optional(),
  allergies: z.string().trim().max(700).optional(),
  currentMedications: z.string().trim().max(700).optional(),
  context: z.enum(["PATIENT_SELF_CARE", "CLINICAL_TRIAGE", "FOLLOW_UP"]).optional()
});

router.use(authenticate, authorize(...aiRoles));

router.get(
  "/capabilities",
  asyncHandler(async (_req, res) => {
    res.json({
      features: ["care-insights", "triage-support", "follow-up-questions", "red-flags"],
      model: "gemini-1.5-flash",
      fallback: false
    });
  })
);

router.post(
  "/care-insights",
  asyncHandler(async (req, res) => {
    const payload = careInsightSchema.parse(req.body);
    const isPatient = req.auth?.role === "PATIENT";

    const result = await generateCareInsights({
      ...payload,
      context: payload.context ?? (isPatient ? "PATIENT_SELF_CARE" : "CLINICAL_TRIAGE"),
      role: String(req.auth?.role ?? "UNKNOWN"),
      centerName: req.auth?.centerId ? `center-${req.auth.centerId}` : undefined
    });

    res.json(result);
  })
);

export const aiRouter = router;
