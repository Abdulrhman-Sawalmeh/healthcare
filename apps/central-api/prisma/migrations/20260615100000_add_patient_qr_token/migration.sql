CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "LocalPatient"
  ADD COLUMN "qrToken" TEXT;

UPDATE "LocalPatient"
SET "qrToken" = gen_random_uuid()::text
WHERE "qrToken" IS NULL;

ALTER TABLE "LocalPatient"
  ALTER COLUMN "qrToken" SET NOT NULL;

CREATE UNIQUE INDEX "LocalPatient_qrToken_key" ON "LocalPatient"("qrToken");
