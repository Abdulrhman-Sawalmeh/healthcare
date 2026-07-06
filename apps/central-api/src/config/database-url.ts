const EMBEDDED_ENV_KEYS = [
  "JWT_SECRET",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_API_KEY",
  "SMTP_PASS",
  "SMTP_USER",
  "EMAIL_API_KEY",
  "BREVO_API_KEY",
  "SENDINBLUE_API_KEY",
  "CORS_ORIGIN"
];

export interface SafeDatabaseUrlSummary {
  protocol: string;
  host: string;
  port: string;
  database: string;
  usernamePrefix: string;
  queryKeys: string[];
}

export interface ValidatedDatabaseUrl {
  raw: string;
  summary: SafeDatabaseUrlSummary;
}

function fail(message: string): never {
  console.error(`[env] ${message}`);
  throw new Error(message);
}

function maskHost(host: string) {
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host || "(missing)";
  }

  const parts = host.split(".");
  if (parts.length <= 2) {
    return `${parts[0]?.slice(0, 2) ?? ""}***.${parts.at(-1) ?? ""}`;
  }

  return `${parts[0]?.slice(0, 2) ?? ""}***.${parts.slice(-2).join(".")}`;
}

function maskUsername(username: string) {
  if (!username) {
    return "(none)";
  }

  const decodedUsername = decodeURIComponent(username);
  return `${decodedUsername.slice(0, Math.min(3, decodedUsername.length))}***`;
}

export function formatSafeDatabaseUrlSummary(summary: SafeDatabaseUrlSummary) {
  const query = summary.queryKeys.length ? summary.queryKeys.join(",") : "none";

  return `protocol=${summary.protocol} host=${summary.host} port=${summary.port} database=${summary.database} username=${summary.usernamePrefix} queryKeys=${query}`;
}

export function validateDatabaseUrl(value: string | undefined): ValidatedDatabaseUrl {
  const raw = value?.trim();

  if (!raw) {
    fail("DATABASE_URL is required.");
  }

  const embeddedKey = EMBEDDED_ENV_KEYS.find((key) => raw.includes(`${key}=`));

  if (embeddedKey) {
    fail(`DATABASE_URL appears to include another environment variable (${embeddedKey}). Keep each .env key on its own line.`);
  }

  if (/\s[A-Z0-9_]+=/.test(raw)) {
    fail("DATABASE_URL contains whitespace followed by another env assignment. Check .env line breaks.");
  }

  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    fail("DATABASE_URL is not a valid URL.");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    fail("DATABASE_URL must use the postgresql:// or postgres:// scheme.");
  }

  if (!parsed.hostname) {
    fail("DATABASE_URL must include a database host.");
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));

  if (!database) {
    fail("DATABASE_URL must include a database name.");
  }

  return {
    raw,
    summary: {
      protocol: parsed.protocol.replace(":", ""),
      host: maskHost(parsed.hostname),
      port: parsed.port || "5432",
      database,
      usernamePrefix: maskUsername(parsed.username),
      queryKeys: Array.from(parsed.searchParams.keys()).sort()
    }
  };
}
