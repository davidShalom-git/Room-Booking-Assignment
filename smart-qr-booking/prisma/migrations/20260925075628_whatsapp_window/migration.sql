-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "lastInboundAt" TIMESTAMPTZ(3),
ADD COLUMN     "pendingOut" JSONB NOT NULL DEFAULT '[]';
