-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ADVANCE', 'EXTENSION', 'BALANCE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('AWAITING', 'CLAIMED', 'ACKNOWLEDGED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "BookingSource" ADD VALUE 'WEB';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "utr" TEXT,
    "proof" TEXT,
    "claimedAt" TIMESTAMPTZ(3),
    "acknowledgedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMPTZ(3) NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "sendCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("phone")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_utr_idx" ON "Payment"("utr");

-- CreateIndex
CREATE INDEX "Booking_parentId_idx" ON "Booking"("parentId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every phone that has booked becomes a customer (named after their latest booking),
-- and existing money becomes payment records, so accounts and the ledger start complete.
INSERT INTO "Customer" ("id", "phone", "name", "createdAt", "updatedAt")
SELECT 'cust_' || md5(latest."guestPhone"), latest."guestPhone", latest."guestName", now(), now()
FROM (
  SELECT DISTINCT ON ("guestPhone") "guestPhone", "guestName"
  FROM "Booking" ORDER BY "guestPhone", "createdAt" DESC
) latest
ON CONFLICT ("phone") DO NOTHING;

UPDATE "Booking" b SET "customerId" = c."id"
FROM "Customer" c
WHERE c."phone" = b."guestPhone" AND b."customerId" IS NULL;

INSERT INTO "Payment" ("id", "bookingId", "kind", "amount", "status", "proof", "acknowledgedAt", "createdAt", "updatedAt")
SELECT 'pay_' || md5(b."id" || ':advance'), b."id", 'ADVANCE'::"PaymentKind", b."advancePaid", 'ACKNOWLEDGED'::"PaymentStatus",
       'recorded before the payment ledger', b."updatedAt", now(), now()
FROM "Booking" b WHERE b."advancePaid" > 0;

INSERT INTO "Payment" ("id", "bookingId", "kind", "amount", "status", "createdAt", "updatedAt")
SELECT 'pay_' || md5(b."id" || ':awaiting'), b."id",
       (CASE WHEN b."parentId" IS NULL THEN 'ADVANCE' ELSE 'EXTENSION' END)::"PaymentKind",
       CASE WHEN b."parentId" IS NULL THEN round(b."total" * 0.5)::int ELSE b."total" END,
       'AWAITING'::"PaymentStatus", now(), now()
FROM "Booking" b WHERE b."status" = 'PENDING';
