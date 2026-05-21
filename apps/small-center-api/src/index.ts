import "dotenv/config";

import { app } from "./app";
import { env } from "./config/env";
import { systemConfig } from "./config/system";

const server = app.listen(env.PORT, () => {
  console.log(`${systemConfig.displayName} يعمل على http://localhost:${env.PORT}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`تعذر تشغيل ${systemConfig.displayName}: المنفذ ${env.PORT} مستخدم بالفعل. أغلق النسخة القديمة أو غيّر PORT.`);
    process.exit(1);
  }

  throw error;
});
