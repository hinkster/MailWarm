-- CreateTable
CREATE TABLE "ReputationCheck" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "signals" JSONB NOT NULL,
    "listedOn" TEXT[],
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReputationCheck_domainId_idx" ON "ReputationCheck"("domainId");

-- CreateIndex
CREATE INDEX "ReputationCheck_checkedAt_idx" ON "ReputationCheck"("checkedAt");

-- AddForeignKey
ALTER TABLE "ReputationCheck" ADD CONSTRAINT "ReputationCheck_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
