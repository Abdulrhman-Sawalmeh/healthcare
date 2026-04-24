import "dotenv/config";

import { app } from "./app";
import { env } from "./config/env";
import { systemConfig } from "./config/system";

app.listen(env.PORT, () => {
  console.log(`${systemConfig.displayName} يعمل على http://localhost:${env.PORT}`);
});
