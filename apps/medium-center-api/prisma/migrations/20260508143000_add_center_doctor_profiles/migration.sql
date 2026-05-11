-- CreateTable
CREATE TABLE "CenterDoctorProfile" (
    "id" SERIAL NOT NULL,
    "userAccountId" INTEGER NOT NULL,
    "centerId" INTEGER NOT NULL,
    "nationalId" TEXT NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'PREFER_NOT_TO_SAY',
    "specialization" TEXT NOT NULL,
    "yearsExperience" INTEGER NOT NULL DEFAULT 0,
    "licenseNumber" TEXT NOT NULL,
    "qualification" TEXT,
    "shiftDays" TEXT[],
    "shiftStartTime" TEXT,
    "shiftEndTime" TEXT,
    "consultationRoom" TEXT,
    "hireDate" TIMESTAMP(3),
    "bio" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CenterDoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CenterDoctorProfile_userAccountId_key" ON "CenterDoctorProfile"("userAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CenterDoctorProfile_nationalId_key" ON "CenterDoctorProfile"("nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "CenterDoctorProfile_licenseNumber_key" ON "CenterDoctorProfile"("licenseNumber");

-- CreateIndex
CREATE INDEX "CenterDoctorProfile_centerId_specialization_idx" ON "CenterDoctorProfile"("centerId", "specialization");

-- AddForeignKey
ALTER TABLE "CenterDoctorProfile" ADD CONSTRAINT "CenterDoctorProfile_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "CenterUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CenterDoctorProfile" ADD CONSTRAINT "CenterDoctorProfile_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
