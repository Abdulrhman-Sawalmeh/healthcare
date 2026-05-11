import { Router } from "express";

import { systemConfig } from "../config/system";
import { authRouter } from "./auth";
import { centerRouter } from "./center";
import { centralRouter } from "./central";
import { networkRouter } from "./network";
import { patientsRouter } from "./patients";

const router = Router();

router.use("/auth", authRouter);
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

export const apiRouter = router;
