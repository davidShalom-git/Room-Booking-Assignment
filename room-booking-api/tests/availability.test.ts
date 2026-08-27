import { describe, test, expect, beforeEach } from "bun:test";
import { resetDb, seedResource } from "./helpers/testDb.ts";
import { gql } from "./helpers/gql.ts";

const CREATE_BOOKING = `
  mutation Create($input: CreateBookingInput!) {
    createBooking(input: $input) { id }
  }
`;

const IS_AVAILABLE = `
  query Avail($resourceId: ID!, $start: DateTime!, $end: DateTime!) {
    isAvailable(resourceId: $resourceId, start: $start, end: $end)
  }
`;

describe("availability", () => {
  beforeEach(resetDb);

  test("slot is available before any booking exists", async () => {
    const resource = await seedResource();
    const res = await gql<{ isAvailable: boolean }>(IS_AVAILABLE, {
      resourceId: resource.id,
      start: "2026-09-01T10:00:00Z",
      end: "2026-09-01T11:00:00Z",
    });
    expect(res.data?.isAvailable).toBe(true);
  });

  test("slot is unavailable once a confirmed booking covers it", async () => {
    const resource = await seedResource();
    await gql(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "X", startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" },
    });

    const res = await gql<{ isAvailable: boolean }>(IS_AVAILABLE, {
      resourceId: resource.id,
      start: "2026-09-01T10:30:00Z",
      end: "2026-09-01T10:45:00Z",
    });
    expect(res.data?.isAvailable).toBe(false);
  });

  test("adjacent slot (touching, not overlapping) is available", async () => {
    const resource = await seedResource();
    await gql(CREATE_BOOKING, {
      input: { resourceId: resource.id, title: "X", startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" },
    });

    const res = await gql<{ isAvailable: boolean }>(IS_AVAILABLE, {
      resourceId: resource.id,
      start: "2026-09-01T11:00:00Z",
      end: "2026-09-01T12:00:00Z",
    });
    expect(res.data?.isAvailable).toBe(true);
  });
});
