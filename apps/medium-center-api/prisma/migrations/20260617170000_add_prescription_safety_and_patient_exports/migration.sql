-- Add prescription safety warning support for medium center workflows.
CREATE TYPE "PrescriptionWarningType" AS ENUM ('ALLERGY', 'DRUG_CONFLICT');

CREATE TYPE "PrescriptionWarningSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "DrugConflict" (
  "id" SERIAL NOT NULL,
  "medicationA" TEXT NOT NULL,
  "medicationB" TEXT NOT NULL,
  "severity" "PrescriptionWarningSeverity" NOT NULL DEFAULT 'MEDIUM',
  "warningMessage" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DrugConflict_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrescriptionWarning" (
  "id" SERIAL NOT NULL,
  "prescriptionId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "warningType" "PrescriptionWarningType" NOT NULL,
  "message" TEXT NOT NULL,
  "severity" "PrescriptionWarningSeverity" NOT NULL DEFAULT 'MEDIUM',
  "overridden" BOOLEAN NOT NULL DEFAULT false,
  "overrideReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PrescriptionWarning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DrugConflict_medicationA_medicationB_key" ON "DrugConflict"("medicationA", "medicationB");
CREATE INDEX "DrugConflict_medicationA_idx" ON "DrugConflict"("medicationA");
CREATE INDEX "DrugConflict_medicationB_idx" ON "DrugConflict"("medicationB");
CREATE INDEX "PrescriptionWarning_patientId_createdAt_idx" ON "PrescriptionWarning"("patientId", "createdAt");
CREATE INDEX "PrescriptionWarning_prescriptionId_idx" ON "PrescriptionWarning"("prescriptionId");
CREATE INDEX "PrescriptionWarning_warningType_severity_idx" ON "PrescriptionWarning"("warningType", "severity");

ALTER TABLE "PrescriptionWarning"
  ADD CONSTRAINT "PrescriptionWarning_prescriptionId_fkey"
  FOREIGN KEY ("prescriptionId") REFERENCES "LocalPrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrescriptionWarning"
  ADD CONSTRAINT "PrescriptionWarning_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "LocalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DrugConflict" ("medicationA", "medicationB", "severity", "warningMessage", "updatedAt")
VALUES
  ('warfarin', 'aspirin', 'HIGH', 'Warfarin and aspirin may significantly increase bleeding risk.', CURRENT_TIMESTAMP),
  ('ibuprofen', 'aspirin', 'MEDIUM', 'Ibuprofen and aspirin may increase gastrointestinal bleeding risk.', CURRENT_TIMESTAMP),
  ('simvastatin', 'clarithromycin', 'HIGH', 'Simvastatin and clarithromycin can increase risk of muscle toxicity.', CURRENT_TIMESTAMP),
  ('lisinopril', 'spironolactone', 'MEDIUM', 'Lisinopril and spironolactone may increase potassium levels.', CURRENT_TIMESTAMP),
  ('metformin', 'contrast media', 'MEDIUM', 'Metformin may need review around iodinated contrast exposure.', CURRENT_TIMESTAMP)
ON CONFLICT ("medicationA", "medicationB") DO NOTHING;
