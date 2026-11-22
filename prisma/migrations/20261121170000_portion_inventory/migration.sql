-- Inventario mínimo de porciones vendibles e idempotencia de rondas.
CREATE TYPE "SubmissionSource" AS ENUM ('CUSTOMER', 'STAFF');
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING', 'RESERVATION', 'ADJUSTMENT');

ALTER TABLE "Product" ADD COLUMN "availableQuantity" INTEGER;
ALTER TABLE "Product" ADD CONSTRAINT "Product_availableQuantity_nonnegative"
  CHECK ("availableQuantity" IS NULL OR "availableQuantity" >= 0);

CREATE TABLE "OrderSubmission" (
  "id" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "isNew" BOOLEAN NOT NULL,
  "requestHash" TEXT NOT NULL,
  "source" "SubmissionSource" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "submissionId" TEXT,
  "actorId" TEXT,
  "operationId" TEXT,
  "type" "InventoryMovementType" NOT NULL,
  "delta" INTEGER NOT NULL,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "reason" VARCHAR(200),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryMovement_balance_nonnegative"
    CHECK ("balanceBefore" >= 0 AND "balanceAfter" >= 0),
  CONSTRAINT "InventoryMovement_balance_matches_delta"
    CHECK ("balanceAfter" = "balanceBefore" + "delta"),
  CONSTRAINT "InventoryMovement_reservation_negative"
    CHECK ("type" <> 'RESERVATION' OR "delta" < 0)
);

CREATE UNIQUE INDEX "OrderSubmission_orderId_round_key" ON "OrderSubmission"("orderId", "round");
CREATE INDEX "OrderSubmission_tableId_createdAt_idx" ON "OrderSubmission"("tableId", "createdAt");
CREATE UNIQUE INDEX "InventoryMovement_operationId_key" ON "InventoryMovement"("operationId");
CREATE UNIQUE INDEX "InventoryMovement_submissionId_productId_key" ON "InventoryMovement"("submissionId", "productId");
CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");

ALTER TABLE "OrderSubmission" ADD CONSTRAINT "OrderSubmission_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderSubmission" ADD CONSTRAINT "OrderSubmission_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "OrderSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
