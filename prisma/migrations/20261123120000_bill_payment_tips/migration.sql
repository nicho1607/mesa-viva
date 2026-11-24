ALTER TABLE "Bill"
  ADD COLUMN "closeOperationId" TEXT,
  ADD COLUMN "closeRequestHash" TEXT,
  ADD COLUMN "tipCashAmount" INTEGER,
  ADD COLUMN "tipTransferAmount" INTEGER,
  ADD COLUMN "cashReceivedAmount" INTEGER;

CREATE UNIQUE INDEX "Bill_closeOperationId_key" ON "Bill"("closeOperationId");

-- Los históricos conservan sus null: no conocemos cómo se repartió su propina.
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_payment_reconciles" CHECK (
  ("closeOperationId" IS NULL AND "closeRequestHash" IS NULL
    AND "tipCashAmount" IS NULL AND "tipTransferAmount" IS NULL AND "cashReceivedAmount" IS NULL)
  OR COALESCE(
    "closeOperationId" IS NOT NULL AND "closeRequestHash" ~ '^[a-f0-9]{64}$'
    AND subtotal >= 0 AND "taxAmount" >= 0 AND "tipAmount" >= 0 AND total >= "tipAmount"
    AND "tipRate" BETWEEN 0 AND 1
    AND (
      ("paymentMethod" = 'CARD' AND "cashAmount" IS NULL AND "transferAmount" IS NULL
        AND "tipCashAmount" IS NULL AND "tipTransferAmount" IS NULL AND "cashReceivedAmount" IS NULL)
      OR (
        "paymentMethod" IN ('CASH', 'TRANSFER', 'MIXED')
        AND "cashAmount" >= 0 AND "transferAmount" >= 0
        AND "cashAmount"::bigint + "transferAmount"::bigint = total
        AND "tipCashAmount" BETWEEN 0 AND "cashAmount"
        AND "tipTransferAmount" BETWEEN 0 AND "transferAmount"
        AND "tipCashAmount"::bigint + "tipTransferAmount"::bigint = "tipAmount"
        AND ("paymentMethod" <> 'CASH' OR "transferAmount" = 0)
        AND ("paymentMethod" <> 'TRANSFER' OR "cashAmount" = 0)
        AND (
          (("paymentMethod" = 'CASH' OR "cashAmount" > 0) AND "cashReceivedAmount" >= "cashAmount")
          OR ("paymentMethod" <> 'CASH' AND "cashAmount" = 0 AND "cashReceivedAmount" IS NULL)
        )
      )
    ), FALSE)
);
