-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "chatKey" TEXT;

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "chat" TEXT NOT NULL,
    "fromGuest" BOOLEAN NOT NULL,
    "text" TEXT NOT NULL,
    "buttons" JSONB,
    "list" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("endpoint")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ChatMessage_chat_id_idx" ON "ChatMessage"("chat", "id");

-- CreateIndex
CREATE INDEX "Booking_chatKey_idx" ON "Booking"("chatKey");
