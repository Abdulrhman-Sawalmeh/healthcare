-- Consent-based access and audited emergency break-glass access.
CREATE TYPE "PatientConsentTargetType" AS ENUM ('DOCTOR', 'CENTER');

CREATE TYPE "PatientConsentScope" AS ENUM ('BASIC_INFO', 'VISITS', 'LAB_RESULTS', 'PRESCRIPTIONS', 'FULL_SUMMARY');

CREATE TYPE "PatientConsentStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "PatientConsent" (
  "id" SERIAL NOT NULL,
  "centerId" INTEGER,
  "patientId" INTEGER NOT NULL,
  "grantedByPatientProfileId" TEXT,
  "targetType" "PatientConsentTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "scope" "PatientConsentScope" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "PatientConsentStatus" NOT NULL DEFAULT 'ACTIVE',
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyAccess" (
  "id" SERIAL NOT NULL,
  "centerId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "doctorId" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "EmergencyAccess_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatientConsent_patientId_status_expiresAt_idx" ON "PatientConsent"("patientId", "status", "expiresAt");
CREATE INDEX "PatientConsent_targetType_targetId_scope_status_idx" ON "PatientConsent"("targetType", "targetId", "scope", "status");
CREATE INDEX "EmergencyAccess_patientId_doctorId_expiresAt_idx" ON "EmergencyAccess"("patientId", "doctorId", "expiresAt");
CREATE INDEX "EmergencyAccess_centerId_createdAt_idx" ON "EmergencyAccess"("centerId", "createdAt");

ALTER TABLE "PatientConsent"
  ADD CONSTRAINT "PatientConsent_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "LocalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PatientConsent"
  ADD CONSTRAINT "PatientConsent_centerId_fkey"
  FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmergencyAccess"
  ADD CONSTRAINT "EmergencyAccess_centerId_fkey"
  FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmergencyAccess"
  ADD CONSTRAINT "EmergencyAccess_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "LocalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmergencyAccess"
  ADD CONSTRAINT "EmergencyAccess_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "CenterUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
