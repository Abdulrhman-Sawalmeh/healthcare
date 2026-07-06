import { z } from "zod";

import { formatSafeDatabaseUrlSummary, validateDatabaseUrl } from "./database-url";

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);

console.info(`[env] DATABASE_URL validated: ${formatSafeDatabaseUrlSummary(databaseUrl.summary)}`);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  CORS_ORIGIN: z.string().default("http://localhost:5174")
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: databaseUrl.raw,
  JWT_SECRET: process.env.JWT_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN
});
