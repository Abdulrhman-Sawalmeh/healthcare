-- Non-destructive additions for prescription verification and sensitive-action auditing.
ALTER TABLE "LocalPrescription"
  ADD COLUMN IF NOT EXISTS "verificationCode" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationHash" TEXT,
  ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "LocalPrescription_verificationCode_key"
  ON "LocalPrescription"("verificationCode");

CREATE INDEX IF NOT EXISTS "LocalPrescription_verificationCode_idx"
  ON "LocalPrescription"("verificationCode");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" SERIAL PRIMARY KEY,
  "centerId" INTEGER,
  "actorUserId" TEXT,
  "actorUsername" TEXT,
  "actorRole" TEXT,
  "workspace" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "oldValue" JSONB,
  "newValue" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_centerId_fkey"
    FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AuditLog_centerId_createdAt_idx"
  ON "AuditLog"("centerId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx"
  ON "AuditLog"("action", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx"
  ON "AuditLog"("entityType", "entityId");
