import { GraphQLError } from "graphql";
import { prisma } from "../db.ts";
import { BookingStatus } from "../../generated/prisma/client.ts";

export function conflictError(): GraphQLError {
  return new GraphQLError("Booking conflicts with an existing confirmed booking on this resource", {
    extensions: { code: "BOOKING_CONFLICT" },
  });
}

/** Half-open [start, end) overlap check: intervals overlap iff start < otherEnd AND otherStart < end. */
export async function hasOverlap(
  resourceId: string,
  startTime: Date,
  endTime: Date,
  excludeBookingId?: string,
): Promise<boolean> {
  const conflict = await prisma.booking.findFirst({
    where: {
      resourceId,
      status: BookingStatus.CONFIRMED,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { id: true },
  });
  return conflict !== null;
}

/**
 * Prisma maps an unrecognized DB constraint failure (our EXCLUDE constraint has no
 * dedicated Prisma error code) to P2004, with the Postgres message text attached.
 * This is the race-window fallback for when two requests both pass the pre-check.
 */
export function isExclusionViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code !== "P2004") return false;
  const message = typeof e.message === "string" ? e.message : "";
  return message.includes("booking_no_overlap") || message.toLowerCase().includes("exclusion constraint");
}
