import { prisma } from "../db.ts";
import { BookingStatus } from "../../generated/prisma/client.ts";
import type { Booking } from "../../generated/prisma/client.ts";
import { notFound, badInput } from "../lib/errors.ts";
import { hasOverlap, conflictError, isExclusionViolation } from "../lib/overlap.ts";
import { encodeCursor, decodeCursor } from "../lib/cursor.ts";
import { requireResource } from "./resource.ts";

interface CreateBookingInput {
  resourceId: string;
  title: string;
  startTime: Date;
  endTime: Date;
}

interface RescheduleBookingInput {
  startTime: Date;
  endTime: Date;
}

function assertValidRange(startTime: Date, endTime: Date): void {
  if (startTime.getTime() >= endTime.getTime()) {
    throw badInput("startTime must be before endTime");
  }
}

async function requireBooking(id: string) {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw notFound("Booking");
  return booking;
}

export const bookingResolvers = {
  Query: {
    bookings: async (
      _parent: unknown,
      args: { resourceId?: string; status?: (typeof BookingStatus)[keyof typeof BookingStatus]; first?: number; after?: string },
    ) => {
      const first = args.first ?? 20;
      if (first < 1 || first > 100) throw badInput("first must be between 1 and 100");
      const cursor = args.after ? decodeCursor(args.after) : null;

      const rows = await prisma.booking.findMany({
        where: {
          ...(args.resourceId ? { resourceId: args.resourceId } : {}),
          ...(args.status ? { status: args.status } : {}),
          ...(cursor
            ? {
                OR: [
                  { startTime: { gt: cursor.startTime } },
                  { startTime: cursor.startTime, id: { gt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ startTime: "asc" }, { id: "asc" }],
        take: first + 1,
      });

      const hasNextPage = rows.length > first;
      const page = hasNextPage ? rows.slice(0, first) : rows;
      const edges = page.map((booking) => ({ cursor: encodeCursor(booking.startTime, booking.id), node: booking }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          endCursor: edges.length > 0 ? edges[edges.length - 1]!.cursor : null,
        },
      };
    },
    isAvailable: async (_parent: unknown, args: { resourceId: string; start: Date; end: Date }) => {
      assertValidRange(args.start, args.end);
      return !(await hasOverlap(args.resourceId, args.start, args.end));
    },
  },
  Mutation: {
    createBooking: async (_parent: unknown, args: { input: CreateBookingInput }) => {
      const { resourceId, title, startTime, endTime } = args.input;
      if (!title.trim()) throw badInput("title must not be empty");
      assertValidRange(startTime, endTime);
      await requireResource(resourceId);

      if (await hasOverlap(resourceId, startTime, endTime)) throw conflictError();

      try {
        return await prisma.booking.create({ data: { resourceId, title, startTime, endTime } });
      } catch (err) {
        if (isExclusionViolation(err)) throw conflictError();
        throw err;
      }
    },
    rescheduleBooking: async (_parent: unknown, args: { id: string; input: RescheduleBookingInput }) => {
      const { startTime, endTime } = args.input;
      assertValidRange(startTime, endTime);
      const booking = await requireBooking(args.id);

      if (await hasOverlap(booking.resourceId, startTime, endTime, booking.id)) throw conflictError();

      try {
        return await prisma.booking.update({ where: { id: args.id }, data: { startTime, endTime } });
      } catch (err) {
        if (isExclusionViolation(err)) throw conflictError();
        throw err;
      }
    },
    cancelBooking: async (_parent: unknown, args: { id: string }) => {
      await requireBooking(args.id);
      return prisma.booking.update({ where: { id: args.id }, data: { status: BookingStatus.CANCELLED } });
    },
    deleteBooking: async (_parent: unknown, args: { id: string }) => {
      try {
        await prisma.booking.delete({ where: { id: args.id } });
        return true;
      } catch {
        return false;
      }
    },
  },
  Booking: {
    resource: (parent: Booking) => prisma.resource.findUnique({ where: { id: parent.resourceId } }),
  },
};
