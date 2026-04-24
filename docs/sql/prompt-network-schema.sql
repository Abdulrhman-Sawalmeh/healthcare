-- المخطط المرجعي لقاعدة بيانات الشبكة الصحية
-- أسماء الجداول والأعمدة بقيت بالإنجليزية لأغراض التنفيذ البرمجي، أما التوثيق والواجهات فقد أصبحت بالعربية.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DOCTOR', 'PATIENT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('CLINIC', 'TELEMEDICINE', 'FOLLOW_UP', 'LAB');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('APPOINTMENT', 'REFERRAL', 'MESSAGE', 'PAYMENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CentralCenterType" AS ENUM ('CLINIC', 'MEDICAL_CENTER', 'HOSPITAL');

-- CreateEnum
CREATE TYPE "CenterUserRole" AS ENUM ('CENTER_MANAGER', 'DOCTOR', 'RECEPTIONIST', 'LAB_TECH', 'PHARMACIST', 'NURSE');

-- CreateEnum
CREATE TYPE "LocalVisitType" AS ENUM ('CONSULTATION', 'EMERGENCY', 'FOLLOW_UP', 'LAB');

-- CreateEnum
CREATE TYPE "LocalVisitSyncState" AS ENUM ('PENDING', 'SYNCING', 'SYNCED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "InvoicePaymentMethod" AS ENUM ('CASH', 'CARD', 'INSURANCE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "LabRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NetworkNotificationType" AS ENUM ('REQUEST_NEW_VISITS', 'REQUEST_PATIENT_DATA', 'REQUEST_LAB_RESULTS', 'SYNC_MASTER_DATA', 'PING', 'NOTIFY_REFERRAL', 'NOTIFY_REFERRAL_RESPONSE', 'REFERRAL_REQUEST', 'ALERT');

-- CreateEnum
CREATE TYPE "NetworkNotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'ACKNOWLEDGED', 'COMPLETED', 'FAILED', 'PERMANENT_FAILURE');

-- CreateEnum
CREATE TYPE "NetworkReferralPriority" AS ENUM ('NORMAL', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "NetworkReferralStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('TO_CENTER', 'FROM_CENTER');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Center" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Center_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterAdministrator" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CenterAdministrator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" INTEGER,
    "phone" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "medicalRecordNumber" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "chronicConditions" TEXT,
    "insuranceNumber" TEXT,
    "emergencyContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "specialization" TEXT NOT NULL,
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "type" "AppointmentType" NOT NULL DEFAULT 'CLINIC',
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "waitingMinutes" INTEGER,
    "attended" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "fromCenterId" TEXT NOT NULL,
    "toCenterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fromDoctorId" TEXT NOT NULL,
    "toDoctorId" TEXT,
    "departmentId" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "billingCycle" "BillingCycle" NOT NULL,
    "priceInCents" INTEGER NOT NULL,
    "maxVisits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amountInCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiSnapshot" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "departmentId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "averageWaitingMinutes" INTEGER NOT NULL,
    "referralRate" DOUBLE PRECISION NOT NULL,
    "workloadScore" DOUBLE PRECISION NOT NULL,
    "adherenceRate" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "KpiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentralCenter" (
    "id" SERIAL NOT NULL,
    "centerCode" TEXT NOT NULL,
    "centerName" TEXT NOT NULL,
    "centerType" "CentralCenterType" NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "specialties" TEXT[],
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "connectionSuspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "apiEndpoint" TEXT,
    "apiKey" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CentralCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentralUser" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "CentralUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedPatient" (
    "id" SERIAL NOT NULL,
    "unifiedId" TEXT NOT NULL,
    "nationalId" TEXT,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "primaryPhone" TEXT NOT NULL,
    "secondaryPhone" TEXT,
    "address" TEXT NOT NULL,
    "bloodType" TEXT,
    "allergies" TEXT[],
    "chronicDiseases" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnifiedPatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnifiedVisit" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "centerId" INTEGER NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "primaryDiagnosis" TEXT NOT NULL,
    "visitType" "LocalVisitType" NOT NULL,
    "doctorName" TEXT NOT NULL,
    "centerVisitId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnifiedVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterMedicine" (
    "id" SERIAL NOT NULL,
    "genericName" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterMedicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterLabTest" (
    "id" SERIAL NOT NULL,
    "testName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "normalRange" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterLabTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterSpecialty" (
    "id" SERIAL NOT NULL,
    "specialtyName" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterSpecialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentralReferral" (
    "id" SERIAL NOT NULL,
    "fromCenterId" INTEGER NOT NULL,
    "toCenterId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "requiredSpecialty" TEXT NOT NULL,
    "priority" "NetworkReferralPriority" NOT NULL,
    "reason" TEXT NOT NULL,
    "requiresOr" BOOLEAN NOT NULL DEFAULT false,
    "requiredMedicineIds" INTEGER[],
    "preferredRegion" TEXT,
    "maxDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "status" "NetworkReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "selectedCenterReason" TEXT,
    "estimatedWaitTimeMinutes" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notesFromSender" TEXT,
    "notesFromReceiver" TEXT,

    CONSTRAINT "CentralReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterDoctorAvailability" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "specialty" TEXT NOT NULL,
    "availableDoctors" INTEGER NOT NULL,
    "totalDoctors" INTEGER NOT NULL,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CenterDoctorAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterOperatingRoomAvailability" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "totalRooms" INTEGER NOT NULL,
    "availableRooms" INTEGER NOT NULL,
    "nextAvailableSlot" TIMESTAMP(3),
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CenterOperatingRoomAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterMedicineAvailability" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "medicineId" INTEGER NOT NULL,
    "availableQuantity" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CenterMedicineAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterLoadSnapshot" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "currentPatientLoad" INTEGER NOT NULL,
    "averageWaitTime" INTEGER NOT NULL,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CenterLoadSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentralNotification" (
    "id" SERIAL NOT NULL,
    "notificationType" "NetworkNotificationType" NOT NULL,
    "targetCenterId" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NetworkNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "responsePayload" JSONB,
    "responseError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 24,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CentralNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterNotification" (
    "id" SERIAL NOT NULL,
    "fromCenterId" INTEGER NOT NULL,
    "notificationType" "NetworkNotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NetworkNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "responseSent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "CenterNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER,
    "direction" "CommunicationDirection" NOT NULL,
    "notificationType" "NetworkNotificationType" NOT NULL,
    "status" "NetworkNotificationStatus" NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterConfig" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "configKey" TEXT NOT NULL,
    "configValue" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CenterConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterUserAccount" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "CenterUserRole" NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "CenterUserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalPatient" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "unifiedPatientId" INTEGER,
    "unifiedId" TEXT,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "emergencyContact" TEXT,
    "bloodType" TEXT,
    "allergies" TEXT[],
    "chronicDiseases" TEXT[],
    "createdLocally" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalPatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalVisit" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "visitTime" TEXT,
    "visitType" "LocalVisitType" NOT NULL,
    "symptoms" TEXT,
    "bloodPressure" TEXT,
    "temperature" DOUBLE PRECISION,
    "heartRate" INTEGER,
    "diagnosis" TEXT NOT NULL,
    "notes" TEXT,
    "centralVisitId" INTEGER,
    "syncState" "LocalVisitSyncState" NOT NULL DEFAULT 'PENDING',
    "syncedToCentral" BOOLEAN NOT NULL DEFAULT false,
    "syncAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalPrescription" (
    "id" SERIAL NOT NULL,
    "visitId" INTEGER NOT NULL,
    "medicineName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "instructions" TEXT,
    "dispensed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LocalPrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalInvoice" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "visitId" INTEGER,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentMethod" "InvoicePaymentMethod",
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTestLocal" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "testName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "normalRange" TEXT,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "LabTestLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabRequestLocal" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "testId" INTEGER NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "LabRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resultValue" TEXT,
    "resultDate" TIMESTAMP(3),
    "syncedToCentral" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LabRequestLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyInventoryLocal" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "medicineName" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "sellingPrice" DOUBLE PRECISION NOT NULL,
    "reorderLevel" INTEGER NOT NULL,

    CONSTRAINT "PharmacyInventoryLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingNotification" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "centralNotificationId" INTEGER,
    "notificationType" "NetworkNotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NetworkNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "responsePayload" JSONB,
    "responseStatus" TEXT,
    "responseError" TEXT,
    "processedById" INTEGER,
    "retryOfId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutgoingNotification" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "notificationType" "NetworkNotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NetworkNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "responsePayload" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 24,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "centralReferenceId" INTEGER,

    CONSTRAINT "OutgoingNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationProcessingLog" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "incomingNotificationId" INTEGER,
    "outgoingNotificationId" INTEGER,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationProcessingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CenterSystemAlert" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CenterSystemAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Center_code_key" ON "Center"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CenterAdministrator_centerId_userId_key" ON "CenterAdministrator"("centerId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_centerId_name_key" ON "Department"("centerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_medicalRecordNumber_key" ON "PatientProfile"("medicalRecordNumber");

-- CreateIndex
CREATE INDEX "PatientProfile_centerId_idx" ON "PatientProfile"("centerId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_licenseNumber_key" ON "DoctorProfile"("licenseNumber");

-- CreateIndex
CREATE INDEX "DoctorProfile_centerId_idx" ON "DoctorProfile"("centerId");

-- CreateIndex
CREATE INDEX "DoctorProfile_departmentId_idx" ON "DoctorProfile"("departmentId");

-- CreateIndex
CREATE INDEX "Appointment_centerId_scheduledAt_idx" ON "Appointment"("centerId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_patientId_scheduledAt_idx" ON "Appointment"("patientId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_scheduledAt_idx" ON "Appointment"("doctorId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Referral_fromCenterId_toCenterId_status_idx" ON "Referral"("fromCenterId", "toCenterId", "status");

-- CreateIndex
CREATE INDEX "Referral_patientId_idx" ON "Referral"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_patientId_doctorId_key" ON "MessageThread"("patientId", "doctorId");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Subscription_patientId_status_idx" ON "Subscription"("patientId", "status");

-- CreateIndex
CREATE INDEX "Subscription_centerId_status_idx" ON "Subscription"("centerId", "status");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_createdAt_idx" ON "Payment"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "KpiSnapshot_centerId_capturedAt_idx" ON "KpiSnapshot"("centerId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CentralCenter_centerCode_key" ON "CentralCenter"("centerCode");

-- CreateIndex
CREATE UNIQUE INDEX "CentralCenter_apiKey_key" ON "CentralCenter"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "CentralUser_username_key" ON "CentralUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "CentralUser_email_key" ON "CentralUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedPatient_unifiedId_key" ON "UnifiedPatient"("unifiedId");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedPatient_nationalId_key" ON "UnifiedPatient"("nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedPatient_primaryPhone_key" ON "UnifiedPatient"("primaryPhone");

-- CreateIndex
CREATE INDEX "UnifiedPatient_fullName_idx" ON "UnifiedPatient"("fullName");

-- CreateIndex
CREATE INDEX "UnifiedVisit_patientId_visitDate_idx" ON "UnifiedVisit"("patientId", "visitDate");

-- CreateIndex
CREATE INDEX "UnifiedVisit_centerId_visitDate_idx" ON "UnifiedVisit"("centerId", "visitDate");

-- CreateIndex
CREATE INDEX "MasterMedicine_category_idx" ON "MasterMedicine"("category");

-- CreateIndex
CREATE INDEX "MasterLabTest_category_idx" ON "MasterLabTest"("category");

-- CreateIndex
CREATE UNIQUE INDEX "MasterSpecialty_specialtyName_key" ON "MasterSpecialty"("specialtyName");

-- CreateIndex
CREATE INDEX "CentralReferral_fromCenterId_status_idx" ON "CentralReferral"("fromCenterId", "status");

-- CreateIndex
CREATE INDEX "CentralReferral_toCenterId_status_idx" ON "CentralReferral"("toCenterId", "status");

-- CreateIndex
CREATE INDEX "CentralReferral_patientId_requestedAt_idx" ON "CentralReferral"("patientId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CenterDoctorAvailability_centerId_specialty_key" ON "CenterDoctorAvailability"("centerId", "specialty");

-- CreateIndex
CREATE UNIQUE INDEX "CenterOperatingRoomAvailability_centerId_key" ON "CenterOperatingRoomAvailability"("centerId");

-- CreateIndex
CREATE UNIQUE INDEX "CenterMedicineAvailability_centerId_medicineId_key" ON "CenterMedicineAvailability"("centerId", "medicineId");

-- CreateIndex
CREATE UNIQUE INDEX "CenterLoadSnapshot_centerId_key" ON "CenterLoadSnapshot"("centerId");

-- CreateIndex
CREATE INDEX "CentralNotification_targetCenterId_status_nextRetryAt_idx" ON "CentralNotification"("targetCenterId", "status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "CenterNotification_fromCenterId_status_receivedAt_idx" ON "CenterNotification"("fromCenterId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "CommunicationLog_centerId_createdAt_idx" ON "CommunicationLog"("centerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CenterConfig_centerId_configKey_key" ON "CenterConfig"("centerId", "configKey");

-- CreateIndex
CREATE UNIQUE INDEX "CenterUserAccount_username_key" ON "CenterUserAccount"("username");

-- CreateIndex
CREATE UNIQUE INDEX "CenterUserAccount_email_key" ON "CenterUserAccount"("email");

-- CreateIndex
CREATE INDEX "CenterUserAccount_centerId_role_idx" ON "CenterUserAccount"("centerId", "role");

-- CreateIndex
CREATE INDEX "LocalPatient_centerId_phone_idx" ON "LocalPatient"("centerId", "phone");

-- CreateIndex
CREATE INDEX "LocalPatient_unifiedPatientId_idx" ON "LocalPatient"("unifiedPatientId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalVisit_centralVisitId_key" ON "LocalVisit"("centralVisitId");

-- CreateIndex
CREATE INDEX "LocalVisit_centerId_syncState_visitDate_idx" ON "LocalVisit"("centerId", "syncState", "visitDate");

-- CreateIndex
CREATE INDEX "LocalVisit_patientId_visitDate_idx" ON "LocalVisit"("patientId", "visitDate");

-- CreateIndex
CREATE UNIQUE INDEX "LocalInvoice_visitId_key" ON "LocalInvoice"("visitId");

-- CreateIndex
CREATE INDEX "LocalInvoice_centerId_status_invoiceDate_idx" ON "LocalInvoice"("centerId", "status", "invoiceDate");

-- CreateIndex
CREATE INDEX "LabTestLocal_centerId_category_idx" ON "LabTestLocal"("centerId", "category");

-- CreateIndex
CREATE INDEX "LabRequestLocal_centerId_status_requestDate_idx" ON "LabRequestLocal"("centerId", "status", "requestDate");

-- CreateIndex
CREATE INDEX "PharmacyInventoryLocal_centerId_quantity_expiryDate_idx" ON "PharmacyInventoryLocal"("centerId", "quantity", "expiryDate");

-- CreateIndex
CREATE INDEX "IncomingNotification_centerId_status_receivedAt_idx" ON "IncomingNotification"("centerId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "OutgoingNotification_centerId_status_nextRetryAt_idx" ON "OutgoingNotification"("centerId", "status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "NotificationProcessingLog_centerId_createdAt_idx" ON "NotificationProcessingLog"("centerId", "createdAt");

-- CreateIndex
CREATE INDEX "CenterSystemAlert_centerId_severity_createdAt_idx" ON "CenterSystemAlert"("centerId", "severity", "createdAt");

-- AddForeignKey
ALTER TABLE "CenterAdministrator" ADD CONSTRAINT "CenterAdministrator_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterAdministrator" ADD CONSTRAINT "CenterAdministrator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_fromCenterId_fkey" FOREIGN KEY ("fromCenterId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_toCenterId_fkey" FOREIGN KEY ("toCenterId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_fromDoctorId_fkey" FOREIGN KEY ("fromDoctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_toDoctorId_fkey" FOREIGN KEY ("toDoctorId") REFERENCES "DoctorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiSnapshot" ADD CONSTRAINT "KpiSnapshot_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiSnapshot" ADD CONSTRAINT "KpiSnapshot_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedVisit" ADD CONSTRAINT "UnifiedVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "UnifiedPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnifiedVisit" ADD CONSTRAINT "UnifiedVisit_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentralReferral" ADD CONSTRAINT "CentralReferral_fromCenterId_fkey" FOREIGN KEY ("fromCenterId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentralReferral" ADD CONSTRAINT "CentralReferral_toCenterId_fkey" FOREIGN KEY ("toCenterId") REFERENCES "CentralCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentralReferral" ADD CONSTRAINT "CentralReferral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "UnifiedPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterDoctorAvailability" ADD CONSTRAINT "CenterDoctorAvailability_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterOperatingRoomAvailability" ADD CONSTRAINT "CenterOperatingRoomAvailability_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterMedicineAvailability" ADD CONSTRAINT "CenterMedicineAvailability_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterMedicineAvailability" ADD CONSTRAINT "CenterMedicineAvailability_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "MasterMedicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterLoadSnapshot" ADD CONSTRAINT "CenterLoadSnapshot_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CentralNotification" ADD CONSTRAINT "CentralNotification_targetCenterId_fkey" FOREIGN KEY ("targetCenterId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterNotification" ADD CONSTRAINT "CenterNotification_fromCenterId_fkey" FOREIGN KEY ("fromCenterId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterConfig" ADD CONSTRAINT "CenterConfig_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterUserAccount" ADD CONSTRAINT "CenterUserAccount_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterUserAccount" ADD CONSTRAINT "CenterUserAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "CenterUserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPatient" ADD CONSTRAINT "LocalPatient_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPatient" ADD CONSTRAINT "LocalPatient_unifiedPatientId_fkey" FOREIGN KEY ("unifiedPatientId") REFERENCES "UnifiedPatient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalVisit" ADD CONSTRAINT "LocalVisit_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalVisit" ADD CONSTRAINT "LocalVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "LocalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalVisit" ADD CONSTRAINT "LocalVisit_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "CenterUserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalVisit" ADD CONSTRAINT "LocalVisit_centralVisitId_fkey" FOREIGN KEY ("centralVisitId") REFERENCES "UnifiedVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPrescription" ADD CONSTRAINT "LocalPrescription_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "LocalVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalInvoice" ADD CONSTRAINT "LocalInvoice_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalInvoice" ADD CONSTRAINT "LocalInvoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "LocalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalInvoice" ADD CONSTRAINT "LocalInvoice_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "LocalVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTestLocal" ADD CONSTRAINT "LabTestLocal_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequestLocal" ADD CONSTRAINT "LabRequestLocal_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequestLocal" ADD CONSTRAINT "LabRequestLocal_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "LocalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequestLocal" ADD CONSTRAINT "LabRequestLocal_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "CenterUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequestLocal" ADD CONSTRAINT "LabRequestLocal_testId_fkey" FOREIGN KEY ("testId") REFERENCES "LabTestLocal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInventoryLocal" ADD CONSTRAINT "PharmacyInventoryLocal_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingNotification" ADD CONSTRAINT "IncomingNotification_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingNotification" ADD CONSTRAINT "IncomingNotification_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "CenterUserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingNotification" ADD CONSTRAINT "IncomingNotification_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "IncomingNotification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutgoingNotification" ADD CONSTRAINT "OutgoingNotification_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationProcessingLog" ADD CONSTRAINT "NotificationProcessingLog_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationProcessingLog" ADD CONSTRAINT "NotificationProcessingLog_incomingNotificationId_fkey" FOREIGN KEY ("incomingNotificationId") REFERENCES "IncomingNotification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationProcessingLog" ADD CONSTRAINT "NotificationProcessingLog_outgoingNotificationId_fkey" FOREIGN KEY ("outgoingNotificationId") REFERENCES "OutgoingNotification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterSystemAlert" ADD CONSTRAINT "CenterSystemAlert_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

