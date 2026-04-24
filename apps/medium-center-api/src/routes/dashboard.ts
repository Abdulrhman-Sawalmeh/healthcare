import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth";
import { getDashboardSummary } from "../services/dashboard";
import { asyncHandler } from "../utils/async-handler";
import { resolveCenterScope } from "../utils/scope";

const router = Router();

const querySchema = z.object({
  centerId: z.string().uuid().optional()
});

router.get(
  "/summary",
  authenticate,
  asyncHandler(async (req, res) => {
    const { centerId } = querySchema.parse(req.query);
    const scopedCenterId = resolveCenterScope(req, centerId);

    if (!scopedCenterId) {
      return res.json({
        center: null,
        metrics: {
          activePatients: 0,
          todayAppointments: 0,
          pendingReferrals: 0,
          averageWaitMinutes: 0,
          adherenceRate: 0,
          referralRate: 0
        },
        departmentWorkload: [],
        referralBreakdown: {},
        kpiTrend: []
      });
    }

    const summary = await getDashboardSummary(scopedCenterId);
    return res.json(summary);
  })
);

export const dashboardRouter = router;
