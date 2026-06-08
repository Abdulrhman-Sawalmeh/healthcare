CREATE TYPE "VisitWorkflowStatus" AS ENUM (
  'WAITING_DOCTOR',
  'IN_TREATMENT',
  'READY_TO_UPLOAD',
  'UPLOAD_PENDING',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "VisitPriority" AS ENUM ('NORMAL', 'URGENT', 'EMERGENCY');
CREATE TYPE "VisitUploadStatus" AS ENUM ('NOT_READY', 'READY', 'QUEUED', 'UPLOADED', 'FAILED');

ALTER TABLE "LocalVisit"
  ADD COLUMN "priority" "VisitPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "workflowStatus" "VisitWorkflowStatus" NOT NULL DEFAULT 'WAITING_DOCTOR',
  ADD COLUMN "uploadStatus" "VisitUploadStatus" NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "uploadedAt" TIMESTAMP(3),
  ADD COLUMN "uploadError" TEXT;

ALTER TABLE "LocalPrescription"
  ADD COLUMN "medicineId" INTEGER,
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "unitPrice" DOUBLE PRECISION;

CREATE INDEX "LocalVisit_centerId_workflowStatus_priority_checkedInAt_idx"
  ON "LocalVisit"("centerId", "workflowStatus", "priority", "checkedInAt");
CREATE INDEX "LocalVisit_centerId_uploadStatus_visitDate_idx"
  ON "LocalVisit"("centerId", "uploadStatus", "visitDate");
CREATE INDEX "LocalPrescription_visitId_idx" ON "LocalPrescription"("visitId");
