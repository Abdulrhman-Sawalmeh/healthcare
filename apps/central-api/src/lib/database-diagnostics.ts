import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

export const DATABASE_UNAVAILABLE_MESSAGE =
  "قاعدة البيانات غير متاحة حاليا. تحقق من الاتصال ثم حاول مرة أخرى.";

const DATABASE_UNAVAILABLE_CODES = new Set(["P1000", "P1001", "P1002", "P1003", "P1017", "P2024", "P2037"]);

const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(DATABASE_URL|JWT_SECRET|SMTP_PASS|SMTP_USER|EMAIL_API_KEY|BREVO_API_KEY|SENDINBLUE_API_KEY|GEMINI_API_KEY|OPENROUTER_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|GOOGLE_API_KEY|TOKEN|AUTHORIZATION|PASSWORD|RESET_CODE)\b\s*[:=]\s*["']?[^"',;\s]+/gi;

function maskLogHost(host: string) {
  const parts = host.split(".");

  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host;
  }

  if (parts.length <= 2) {
    return `${parts[0]?.slice(0, 2) ?? ""}***.${parts.at(-1) ?? ""}`;
  }

  return `${parts[0]?.slice(0, 2) ?? ""}***.${parts.slice(-2).join(".")}`;
}

export function redactSensitive(value: string) {
  return value
    .replace(/postgres(?:ql)?:\/\/([^:\s/@]+):([^@\s/]+)@/gi, "postgresql://$1:***@")
    .replace(/`([a-z0-9-]+(?:\.[a-z0-9-]+)+):(\d+)`/gi, (_match, host: string, port: string) => {
      return `\`${maskLogHost(host)}:${port}\``;
    })
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, "$1=***");
}

export function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return redactSensitive(error.message).replace(/\s+/g, " ").trim();
  }

  if (typeof error === "string") {
    return redactSensitive(error).replace(/\s+/g, " ").trim();
  }

  return "Unknown error";
}

function getPrismaCode(error: unknown) {
  const candidate = error as { code?: unknown; errorCode?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : candidate.errorCode;

  return typeof code === "string" ? code : undefined;
}

export function isDatabaseUnavailableError(error: unknown) {
  const code = getPrismaCode(error);

  if (code && DATABASE_UNAVAILABLE_CODES.has(code)) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  const message = getSafeErrorMessage(error);

  return /P1001|P1002|P1017|P2024|P2037|database server|can't reach|connection refused|ECONNREFUSED|ENOTFOUND|timed out fetching a new connection|too many connections/i.test(
    message
  );
}

export async function checkDatabaseConnectivity() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      database: "connected" as const
    };
  } catch (error) {
    return {
      database: "unavailable" as const,
      message: getSafeErrorMessage(error)
    };
  }
}
