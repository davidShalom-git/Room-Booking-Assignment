-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('WHATSAPP', 'ADMIN');

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pricePerNight" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "bed" TEXT NOT NULL,
    "ac" BOOLEAN NOT NULL,
    "size" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amenities" TEXT[],
    "images" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "roomId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "guests" INTEGER NOT NULL,
    "checkInAt" TIMESTAMPTZ(3) NOT NULL,
    "checkOutAt" TIMESTAMPTZ(3) NOT NULL,
    "ratePerNight" INTEGER NOT NULL,
    "nights" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "advancePaid" INTEGER NOT NULL DEFAULT 0,
    "status" "BookingStatus" NOT NULL,
    "source" "BookingSource" NOT NULL,
    "holdExpiresAt" TIMESTAMPTZ(3),
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "phone" TEXT NOT NULL,
    "roomId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'browsing',
    "draft" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "ProcessedMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_seq_key" ON "Booking"("seq");

-- CreateIndex
CREATE INDEX "Booking_roomId_checkInAt_idx" ON "Booking"("roomId", "checkInAt");

-- CreateIndex
CREATE INDEX "Booking_guestPhone_idx" ON "Booking"("guestPhone");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
