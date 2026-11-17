CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'MIXED');

ALTER TABLE "Table" ADD COLUMN "pendingPaymentMethod" "PaymentMethod";
