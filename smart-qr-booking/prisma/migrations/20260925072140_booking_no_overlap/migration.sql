-- The actual no-double-booking guarantee. Two bookings for the same room may not have
-- overlapping [checkInAt, checkOutAt) ranges while either is PENDING or CONFIRMED.
--   * '[)' is half-open: checkout 11:00 and the next check-in 13:00 (or even 11:00) don't clash.
--   * CANCELLED rows are invisible to it, so a cancelled / expired slot is reusable at once.
--   * btree_gist lets one GiST index mix the plain equality column with the range column.
-- Ported from room-booking-api's booking_no_overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist (
    "roomId" WITH =,
    tstzrange("checkInAt", "checkOutAt", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));
