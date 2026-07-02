import dotenv from "dotenv";
import path from "node:path";

const appEnvPath = path.resolve(__dirname, "../../.env");
const rootEnvPath = path.resolve(__dirname, "../../../../.env");

const rootEnv = dotenv.config({ path: rootEnvPath }).parsed ?? {};
dotenv.config({ path: appEnvPath, override: true });

const sharedRootKeys = [
  "DATABASE_URL",
  "EMAIL_FROM",
  "EMAIL_WEBHOOK_URL",
  "EMAIL_API_KEY",
  "EMAIL_TIMEOUT_MS",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_HELO_NAME",
  "SMTP_DISABLE_STARTTLS",
  "SMTP_TLS_REJECT_UNAUTHORIZED",
  "BREVO_API_KEY",
  "BREVO_FROM",
  "SENDINBLUE_API_KEY"
];

for (const key of sharedRootKeys) {
  if (rootEnv[key]?.trim()) {
    process.env[key] = rootEnv[key];
  }
}
