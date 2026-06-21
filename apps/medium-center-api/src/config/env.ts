import { z } from "zod";

function firstNonBlank(...values: Array<string | undefined>) {
  return values.find((value) => value?.trim());
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4100),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  CORS_ORIGIN: z.string().default("http://localhost:5175,http://localhost:8081,http://localhost:8082"),
  AI_PROVIDER: z.enum(["auto", "openai", "openrouter", "gemini", "local"]).default("auto"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openrouter/free"),
  OPENROUTER_APP_URL: z.string().optional(),
  OPENROUTER_APP_NAME: z.string().default("Healthcare Graduation Project"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-1.5-flash")
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  AI_PROVIDER: process.env.AI_PROVIDER,
  OPENROUTER_API_KEY: firstNonBlank(process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_KEY),
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  OPENROUTER_APP_URL: process.env.OPENROUTER_APP_URL,
  OPENROUTER_APP_NAME: process.env.OPENROUTER_APP_NAME,
  GEMINI_API_KEY: firstNonBlank(
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GOOGLE_API_KEY
  ),
  GEMINI_MODEL: process.env.GEMINI_MODEL
});
