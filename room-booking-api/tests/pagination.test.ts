import { describe, test, expect, beforeEach } from "bun:test";
import { resetDb, seedResource } from "./helpers/testDb.ts";
import { gql } from "./helpers/gql.ts";
import { prisma } from "../src/db.ts";

const BOOKINGS = `
  query Bookings($resourceId: ID, $first: Int, $after: String) {
    bookings(resourceId: $resourceId, first: $first, after: $after) {
      edges { cursor node { id startTime } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const BOOKINGS_BY_STATUS = `
  query BookingsByStatus($resourceId: ID, $first: Int, $status: BookingStatus) {
    bookings(resourceId: $resourceId, first: $first, status: $status) {
      edges { cursor node { id startTime } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface BookingsResult {
  bookings: {
    edges: { cursor: string; node: { id: string; startTime: string } }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

describe("bookings pagination", () => {
  beforeEach(resetDb);

  test("pages through results ordered by startTime, ascending", async () => {
    const resource = await seedResource();
    const base = new Date("2026-09-01T09:00:00Z").getTime();
    for (let i = 0; i < 5; i++) {
      await prisma.booking.create({
        data: {
          resourceId: resource.id,
          title: `Booking ${i}`,
          startTime: new Date(base + i * 3_600_000),
          endTime: new Date(base + i * 3_600_000 + 1_800_000),
        },
      });
    }

    const page1 = await gql<BookingsResult>(BOOKINGS, { resourceId: resource.id, first: 2 });
    expect(page1.data?.bookings.edges).toHaveLength(2);
    expect(page1.data?.bookings.pageInfo.hasNextPage).toBe(true);

    const page2 = await gql<BookingsResult>(BOOKINGS, {
      resourceId: resource.id,
      first: 2,
      after: page1.data!.bookings.pageInfo.endCursor,
    });
    expect(page2.data?.bookings.edges).toHaveLength(2);
    expect(page2.data?.bookings.pageInfo.hasNextPage).toBe(true);

    const page3 = await gql<BookingsResult>(BOOKINGS, {
      resourceId: resource.id,
      first: 2,
      after: page2.data!.bookings.pageInfo.endCursor,
    });
    expect(page3.data?.bookings.edges).toHaveLength(1);
    expect(page3.data?.bookings.pageInfo.hasNextPage).toBe(false);

    const allStartTimes = [...page1.data!.bookings.edges, ...page2.data!.bookings.edges, ...page3.data!.bookings.edges].map(
      (e) => e.node.startTime,
    );
    const noDupes = new Set(allStartTimes);
    expect(noDupes.size).toBe(5);
    expect(allStartTimes).toEqual([...allStartTimes].sort());
  });

  test("filters by status", async () => {
    const resource = await seedResource();
    await prisma.booking.create({
      data: { resourceId: resource.id, title: "Confirmed", startTime: new Date("2026-09-01T09:00:00Z"), endTime: new Date("2026-09-01T09:30:00Z") },
    });
    await prisma.booking.create({
      data: {
        resourceId: resource.id,
        title: "Cancelled",
        startTime: new Date("2026-09-01T10:00:00Z"),
        endTime: new Date("2026-09-01T10:30:00Z"),
        status: "CANCELLED",
      },
    });

    const res = await gql<BookingsResult>(BOOKINGS_BY_STATUS, {
      resourceId: resource.id,
      first: 10,
      status: "CANCELLED",
    });
    expect(res.data?.bookings.edges).toHaveLength(1);
  });
});
