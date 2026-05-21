-- CreateTable
CREATE TABLE IF NOT EXISTS "LocalResultReport" (
    "id" SERIAL NOT NULL,
    "centerId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "visitId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "summary" TEXT NOT NULL,
    "findings" TEXT,
    "recommendations" TEXT,
    "recommendedFollowUp" TEXT,
    "shareWithPatient" BOOLEAN NOT NULL DEFAULT true,
    "attachmentFileName" TEXT,
    "attachmentMimeType" TEXT,
    "attachmentBase64" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalResultReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LocalResultReport_centerId_createdAt_idx" ON "LocalResultReport"("centerId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LocalResultReport_patientId_createdAt_idx" ON "LocalResultReport"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LocalResultReport_visitId_createdAt_idx" ON "LocalResultReport"("visitId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LocalResultReport_centerId_fkey'
  ) THEN
    ALTER TABLE "LocalResultReport" ADD CONSTRAINT "LocalResultReport_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "CentralCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LocalResultReport_patientId_fkey'
  ) THEN
    ALTER TABLE "LocalResultReport" ADD CONSTRAINT "LocalResultReport_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "LocalPatient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LocalResultReport_visitId_fkey'
  ) THEN
    ALTER TABLE "LocalResultReport" ADD CONSTRAINT "LocalResultReport_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "LocalVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LocalResultReport_authorId_fkey'
  ) THEN
    ALTER TABLE "LocalResultReport" ADD CONSTRAINT "LocalResultReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "CenterUserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
