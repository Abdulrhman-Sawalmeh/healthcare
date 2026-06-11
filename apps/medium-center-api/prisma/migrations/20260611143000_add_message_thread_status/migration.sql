CREATE TYPE "MessageThreadStatus" AS ENUM ('OPEN', 'CLOSED');

ALTER TABLE "MessageThread"
  ADD COLUMN "status" "MessageThreadStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closedById" TEXT;

ALTER TABLE "MessageThread"
  ADD CONSTRAINT "MessageThread_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MessageThread_status_updatedAt_idx" ON "MessageThread"("status", "updatedAt");
