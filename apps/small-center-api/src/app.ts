import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env";
import { systemConfig } from "./config/system";
import { checkDatabaseConnectivity } from "./lib/database-diagnostics";
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

app.get("/health", async (_req, res) => {
  const database = await checkDatabaseConnectivity();
  const isHealthy = database.database === "connected";

  if (!isHealthy) {
    console.error("[api:error]", {
      method: "GET",
      path: "/health",
      statusCode: 503,
      message: database.message
    });
  }

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    service: systemConfig.key,
    displayName: systemConfig.displayName,
    timestamp: new Date().toISOString(),
    database: database.database
  });
});

startNotificationProcessor(systemConfig);

app.use("/api", apiRouter);
app.use(notFound);
app.use(errorHandler);
