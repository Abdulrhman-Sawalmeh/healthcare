CREATE TYPE "MedicationRefillStatus" AS ENUM (
  'REQUESTED',
  'DOCTOR_APPROVED',
  'PHARMACY_PREPARING',
  'READY_FOR_PICKUP',
  'COLLECTED',
  'REJECTED'
);

CREATE TYPE "FollowUpReminderStatus" AS ENUM (
  'PENDING',
  'DONE',
  'CANCELLED',
  'MISSED'
);

CREATE TABLE "MedicationRefillRequest" (
  "id" SERIAL NOT NULL,
  "centerId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "prescriptionId" INTEGER NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "MedicationRefillStatus" NOT NULL DEFAULT 'REQUESTED',
  "doctorId" INTEGER,
  "pharmacyUserId" INTEGER,
  "rejectionReason" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MedicationRefillRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FollowUpReminder" (
  "id" SERIAL NOT NULL,
  "centerId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "doctorId" INTEGER NOT NULL,
  "visitId" INTEGER,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "FollowUpReminderStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),

  CONSTRAINT "FollowUpReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MedicationRefillRequest_patientId_idx" ON "MedicationRefillRequest"("patientId");
CREATE INDEX "MedicationRefillRequest_status_idx" ON "MedicationRefillRequest"("status");
CREATE INDEX "MedicationRefillRequest_prescriptionId_idx" ON "MedicationRefillRequest"("prescriptionId");
CREATE INDEX "MedicationRefillRequest_centerId_status_requestedAt_idx" ON "MedicationRefillRequest"("centerId", "status", "requestedAt");
CREATE INDEX "FollowUpReminder_patientId_dueDate_idx" ON "FollowUpReminder"("patientId", "dueDate");
CREATE INDEX "FollowUpReminder_doctorId_status_dueDate_idx" ON "FollowUpReminder"("doctorId", "status", "dueDate");
CREATE INDEX "FollowUpReminder_centerId_status_dueDate_idx" ON "FollowUpReminder"("centerId", "status", "dueDate");

ALTER TABLE "MedicationRefillRequest"
  ADD CONSTRAINT "MedicationRefillRequest_centerId_fkey"
  FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MedicationRefillRequest"
  ADD CONSTRAINT "MedicationRefillRequest_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "LocalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MedicationRefillRequest"
  ADD CONSTRAINT "MedicationRefillRequest_prescriptionId_fkey"
  FOREIGN KEY ("prescriptionId") REFERENCES "LocalPrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MedicationRefillRequest"
  ADD CONSTRAINT "MedicationRefillRequest_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "CenterUserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MedicationRefillRequest"
  ADD CONSTRAINT "MedicationRefillRequest_pharmacyUserId_fkey"
  FOREIGN KEY ("pharmacyUserId") REFERENCES "CenterUserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FollowUpReminder"
  ADD CONSTRAINT "FollowUpReminder_centerId_fkey"
  FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUpReminder"
  ADD CONSTRAINT "FollowUpReminder_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "LocalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUpReminder"
  ADD CONSTRAINT "FollowUpReminder_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "CenterUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUpReminder"
  ADD CONSTRAINT "FollowUpReminder_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "LocalVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
