-- CreateEnum
CREATE TYPE "AttentionReason" AS ENUM ('ASSISTANCE', 'BILL');

-- AlterTable
ALTER TABLE "Table" ADD COLUMN     "attentionReason" "AttentionReason";
