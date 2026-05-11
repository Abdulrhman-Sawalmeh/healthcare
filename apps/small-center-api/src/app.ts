import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env";
import { systemConfig } from "./config/system";
import { errorHandler, notFound } from "./middleware/error";
import { apiRouter } from "./routes";
import { startNotificationProcessor } from "./services/notification-processor";

export const app = express();

const corsOrigin = env.CORS_ORIGIN.includes(",")
  ? env.CORS_ORIGIN.split(",").map((item) => item.trim())
  : env.CORS_ORIGIN;

app.use(
  cors({
    origin: corsOrigin,
    credentials: false
  })
);
app.use(helmet());
app.use(express.json({ limit: "8mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: systemConfig.key,
    displayName: systemConfig.displayName,
    timestamp: new Date().toISOString()
  });
});

startNotificationProcessor(systemConfig);

app.use("/api", apiRouter);
app.use(notFound);
app.use(errorHandler);
