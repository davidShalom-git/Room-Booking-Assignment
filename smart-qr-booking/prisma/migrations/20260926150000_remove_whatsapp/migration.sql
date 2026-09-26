-- WhatsApp is gone: guests book in the website chat, and the owner works in the owner app.

-- Website sign-in codes (they were sent on WhatsApp) and WhatsApp webhook dedupe markers.
DROP TABLE "OtpCode";
DROP TABLE "ProcessedMessage";

-- Conversations are website chats only, keyed by the chat ("web:<id>"). Renamed, not recreated,
-- so chats in progress carry on.
DELETE FROM "Conversation" WHERE "phone" NOT LIKE 'web:%';
ALTER TABLE "Conversation" DROP COLUMN "lastInboundAt", DROP COLUMN "pendingOut";
ALTER TABLE "Conversation" RENAME COLUMN "phone" TO "chat";
