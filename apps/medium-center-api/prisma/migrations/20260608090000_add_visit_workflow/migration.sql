CREATE TYPE "VisitWorkflowStatus" AS ENUM (
  'WAITING_RECEPTION',
  'WAITING_TRIAGE',
  'WAITING_DOCTOR',
  'WAITING_LAB',
  'WAITING_PHARMACY',
  'IN_TREATMENT',
  'READY_TO_UPLOAD',
  'UPLOAD_PENDING',
  'UPLOADED',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "VisitPriority" AS ENUM ('NORMAL', 'URGENT', 'EMERGENCY');
CREATE TYPE "VisitTaskType" AS ENUM (
  'RECEPTION_REGISTRATION',
  'NURSING_TRIAGE',
  'DOCTOR_ASSESSMENT',
  'LAB_TEST',
  'PHARMACY_DISPENSING',
  'CENTRAL_UPLOAD',
  'FOLLOW_UP'
);
CREATE TYPE "VisitTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "VisitUploadStatus" AS ENUM ('NOT_READY', 'READY', 'QUEUED', 'UPLOADING', 'UPLOADED', 'FAILED');

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
  ADD COLUMN "unitPrice" DOUBLE PRECISION,
  ADD COLUMN "dispensedById" INTEGER,
  ADD COLUMN "dispensedAt" TIMESTAMP(3);

ALTER TABLE "LabRequestLocal"
  ADD COLUMN "visitId" INTEGER,
  ADD COLUMN "resultNotes" TEXT,
  ADD COLUMN "resultFileName" TEXT,
  ADD COLUMN "resultMimeType" TEXT,
  ADD COLUMN "resultBase64" TEXT,
  ADD COLUMN "completedById" INTEGER;

CREATE TABLE "NursingAssessment" (
  "id" SERIAL NOT NULL,
  "visitId" INTEGER NOT NULL,
  "nurseId" INTEGER NOT NULL,
  "bloodPressure" TEXT,
  "temperature" DOUBLE PRECISION,
  "heartRate" INTEGER,
  "weightKg" DOUBLE PRECISION,
  "heightCm" DOUBLE PRECISION,
  "oxygenSaturation" DOUBLE PRECISION,
  "respiratoryRate" INTEGER,
  "bloodGlucose" DOUBLE PRECISION,
  "notes" TEXT,
  "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NursingAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisitWorkflowTask" (
  "id" SERIAL NOT NULL,
  "visitId" INTEGER NOT NULL,
  "taskType" "VisitTaskType" NOT NULL,
  "status" "VisitTaskStatus" NOT NULL DEFAULT 'PENDING',
  "assignedRole" "CenterUserRole" NOT NULL,
  "assignedToId" INTEGER,
  "completedById" INTEGER,
  "instructions" TEXT,
  "resultSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "VisitWorkflowTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiseaseCatalog" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiseaseCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeShift" (
  "id" SERIAL NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "dayOfWeek" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "EmployeeShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeCompensation" (
  "id" SERIAL NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "monthlySalary" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ILS',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LocalVisit_centerId_workflowStatus_priority_checkedInAt_idx"
  ON "LocalVisit"("centerId", "workflowStatus", "priority", "checkedInAt");
CREATE INDEX "LocalVisit_centerId_uploadStatus_visitDate_idx"
  ON "LocalVisit"("centerId", "uploadStatus", "visitDate");
CREATE INDEX "LocalPrescription_visitId_dispensed_idx"
  ON "LocalPrescription"("visitId", "dispensed");
CREATE INDEX "LabRequestLocal_visitId_status_idx"
  ON "LabRequestLocal"("visitId", "status");
CREATE INDEX "NursingAssessment_visitId_assessedAt_idx"
  ON "NursingAssessment"("visitId", "assessedAt");
CREATE INDEX "NursingAssessment_nurseId_assessedAt_idx"
  ON "NursingAssessment"("nurseId", "assessedAt");
CREATE INDEX "VisitWorkflowTask_visitId_status_taskType_idx"
  ON "VisitWorkflowTask"("visitId", "status", "taskType");
CREATE INDEX "VisitWorkflowTask_assignedRole_assignedToId_status_idx"
  ON "VisitWorkflowTask"("assignedRole", "assignedToId", "status");
CREATE UNIQUE INDEX "DiseaseCatalog_code_key" ON "DiseaseCatalog"("code");
CREATE INDEX "DiseaseCatalog_category_name_idx" ON "DiseaseCatalog"("category", "name");
CREATE INDEX "EmployeeShift_dayOfWeek_startTime_endTime_idx"
  ON "EmployeeShift"("dayOfWeek", "startTime", "endTime");
CREATE UNIQUE INDEX "EmployeeShift_employeeId_dayOfWeek_startTime_key"
  ON "EmployeeShift"("employeeId", "dayOfWeek", "startTime");
CREATE UNIQUE INDEX "EmployeeCompensation_employeeId_key"
  ON "EmployeeCompensation"("employeeId");

ALTER TABLE "NursingAssessment"
  ADD CONSTRAINT "NursingAssessment_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "LocalVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NursingAssessment"
  ADD CONSTRAINT "NursingAssessment_nurseId_fkey"
  FOREIGN KEY ("nurseId") REFERENCES "CenterUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitWorkflowTask"
  ADD CONSTRAINT "VisitWorkflowTask_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "LocalVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitWorkflowTask"
  ADD CONSTRAINT "VisitWorkflowTask_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "CenterUserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitWorkflowTask"
  ADD CONSTRAINT "VisitWorkflowTask_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "CenterUserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LocalPrescription"
  ADD CONSTRAINT "LocalPrescription_dispensedById_fkey"
  FOREIGN KEY ("dispensedById") REFERENCES "CenterUserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabRequestLocal"
  ADD CONSTRAINT "LabRequestLocal_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "CenterUserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabRequestLocal"
  ADD CONSTRAINT "LabRequestLocal_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "LocalVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeShift"
  ADD CONSTRAINT "EmployeeShift_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "CenterUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompensation"
  ADD CONSTRAINT "EmployeeCompensation_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "CenterUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
