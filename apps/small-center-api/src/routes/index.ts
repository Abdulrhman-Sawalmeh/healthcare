import { Router } from "express";

import { systemConfig } from "../config/system";
import { aiRouter } from "./ai";
import { appointmentsRouter } from "./appointments";
import { authRouter } from "./auth";
import { centerRouter } from "./center";
import { centralRouter } from "./central";
import { networkRouter } from "./network";
import { patientsRouter } from "./patients";
import { portalRouter } from "./portal";

const router = Router();

router.use("/auth", authRouter);
router.use("/ai", aiRouter);
router.use("/appointments", appointmentsRouter);
router.use("/patients", patientsRouter);

if (systemConfig.allowCentralRoutes) {
  router.use("/central", centralRouter);
}

if (systemConfig.allowCenterRoutes) {
  router.use("/center", centerRouter);
}

if (systemConfig.allowNetworkRoutes) {
  router.use("/network", networkRouter);
}

if (systemConfig.workspace === "center") {
  router.use("/portal", portalRouter);
}

export const apiRouter = router;
