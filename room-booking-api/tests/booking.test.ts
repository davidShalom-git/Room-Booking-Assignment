import { describe, test, expect, beforeEach } from "bun:test";
import { resetDb, seedResource } from "./helpers/testDb.ts";
import { gql } from "./helpers/gql.ts";

const CREATE_BOOKING = `
  mutation Create($input: CreateBookingInput!) {
    createBooking(input: $input) { id startTime endTime status }
  }
`;

const RESCHEDULE = `
  mutation Reschedule($id: ID!, $input: RescheduleBookingInput!) {
    rescheduleBooking(id: $id, input: $input) { id startTime endTime }
  }
`;

const CANCEL = `
  mutation Cancel($id: ID!) {
    cancelBooking(id: $id) { id status }
  }
`;

interface CreateBookingResult {
  createBooking: { id: string; startTime: string; endTime: string; status: string };
}

describe("booking overlap rules", () => {
  beforeEach(resetDb);

  test("rejects overlapping confirmed bookings on the same resource", async () => {
    const resource = await seedResource();

    const first = await gql<CreateBookingResult>(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "Standup", startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" },
    });
    expect(first.errors).toBeUndefined();

    const second = await gql(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "Overlap", startTime: "2026-09-01T10:30:00Z", endTime: "2026-09-01T11:30:00Z" },
    });
    expect(second.errors?.[0]?.extensions?.["code"]).toBe("BOOKING_CONFLICT");
  });

  test("allows back-to-back bookings (half-open interval)", async () => {
    const resource = await seedResource();

    const first = await gql(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "First", startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" },
    });
    expect(first.errors).toBeUndefined();

    const second = await gql(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "Second", startTime: "2026-09-01T11:00:00Z", endTime: "2026-09-01T12:00:00Z" },
    });
    expect(second.errors).toBeUndefined();
  });

  test("cancelled bookings do not block their old slot", async () => {
    const resource = await seedResource();

    const created = await gql<CreateBookingResult>(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "First", startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" },
    });
    const id = created.data!.createBooking.id;

    const cancelled = await gql(CANCEL, { id });
    expect(cancelled.errors).toBeUndefined();

    const rebooked = await gql(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "Reuses slot", startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" },
    });
    expect(rebooked.errors).toBeUndefined();
  });

  test("reschedule excludes the booking being moved from its own conflict check", async () => {
    const resource = await seedResource();

    const created = await gql<CreateBookingResult>(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "Meeting", startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" },
    });
    const id = created.data!.createBooking.id;

    const moved = await gql(RESCHEDULE, {
      id,
      input: { startTime: "2026-09-01T10:15:00Z", endTime: "2026-09-01T11:15:00Z" },
    });
    expect(moved.errors).toBeUndefined();
  });

  test("reschedule into a real conflict with another booking is rejected", async () => {
    const resource = await seedResource();

    await gql(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "A", startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" },
    });
    const b = await gql<CreateBookingResult>(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "B", startTime: "2026-09-01T12:00:00Z", endTime: "2026-09-01T13:00:00Z" },
    });
    const bId = b.data!.createBooking.id;

    const moved = await gql(RESCHEDULE, {
      id: bId,
      input: { startTime: "2026-09-01T10:30:00Z", endTime: "2026-09-01T11:30:00Z" },
    });
    expect(moved.errors?.[0]?.extensions?.["code"]).toBe("BOOKING_CONFLICT");
  });

  test("rejects startTime >= endTime", async () => {
    const resource = await seedResource();
    const res = await gql(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "Backwards", startTime: "2026-09-01T11:00:00Z", endTime: "2026-09-01T10:00:00Z" },
    });
    expect(res.errors?.[0]?.extensions?.["code"]).toBe("BAD_USER_INPUT");
  });

  test("overlap on a different resource is allowed", async () => {
    const resourceA = await seedResource({ name: "Room A" });
    const resourceB = await seedResource({ name: "Room B" });

    await gql(CREATE_BOOKING, {
      input: { resourceId: resourceA.id, title: "A", startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" },
    });
    const second = await gql(CREATE_BOOKING, {
      input: { resourceId: resourceB.id, title: "B", startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" },
    });
    expect(second.errors).toBeUndefined();
  });
});
