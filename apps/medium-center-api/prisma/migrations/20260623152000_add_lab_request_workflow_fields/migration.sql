ALTER TABLE "LabRequestLocal"
  ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "clinicalNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "sampleType" TEXT,
  ADD COLUMN IF NOT EXISTS "fastingRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "externalTest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "unit" TEXT,
  ADD COLUMN IF NOT EXISTS "normalRange" TEXT,
  ADD COLUMN IF NOT EXISTS "abnormalFlag" TEXT,
  ADD COLUMN IF NOT EXISTS "criticalNote" TEXT,
  ADD COLUMN IF NOT EXISTS "reportUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "doctorNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "patientNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "correctionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "sentToDoctorAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "publishedToPatientAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resultReportId" INTEGER;

ALTER TABLE "LabRequestLocal"
  ALTER COLUMN "status" SET DEFAULT 'NEW';

CREATE UNIQUE INDEX IF NOT EXISTS "LabRequestLocal_resultReportId_key"
  ON "LabRequestLocal"("resultReportId");

CREATE INDEX IF NOT EXISTS "LabRequestLocal_centerId_priority_requestDate_idx"
  ON "LabRequestLocal"("centerId", "priority", "requestDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LabRequestLocal_resultReportId_fkey'
  ) THEN
    ALTER TABLE "LabRequestLocal"
      ADD CONSTRAINT "LabRequestLocal_resultReportId_fkey"
      FOREIGN KEY ("resultReportId") REFERENCES "LocalResultReport"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
