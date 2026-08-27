-- Needed to mix an equality column (resourceId) with a range type (tsrange) in one GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- The real concurrency guarantee for "no two CONFIRMED bookings on the same resource
-- may overlap": Postgres rejects the losing INSERT/UPDATE atomically, even when two
-- transactions race each other. Application code (see src/lib/overlap.ts) only adds a
-- friendly pre-check on top of this; this constraint is what makes it actually safe.
--
-- '[)' makes the range half-open, so back-to-back bookings (one ends exactly when the
-- next starts) do not count as overlapping.
ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  )
  WHERE ("status" = 'CONFIRMED');
