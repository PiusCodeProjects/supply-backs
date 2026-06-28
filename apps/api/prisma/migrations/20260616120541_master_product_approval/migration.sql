-- AlterTable
ALTER TABLE "master_products" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "submittedById" TEXT;

-- AddForeignKey
ALTER TABLE "master_products" ADD CONSTRAINT "master_products_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
