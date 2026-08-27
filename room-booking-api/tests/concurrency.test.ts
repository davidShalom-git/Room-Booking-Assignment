import { describe, test, expect, beforeEach } from "bun:test";
import { resetDb, seedResource } from "./helpers/testDb.ts";
import { gql, type GqlResult } from "./helpers/gql.ts";

const CREATE_BOOKING = `
  mutation Create($input: CreateBookingInput!) {
    createBooking(input: $input) { id }
  }
`;

interface CreateBookingResult {
  createBooking: { id: string };
}

/**
 * The app-level pre-check (findFirst before insert) is NOT race-proof by itself:
 * two requests can both pass the check before either commits. Real safety comes
 * from the Postgres EXCLUDE constraint (see prisma/migrations) rejecting the
 * loser at the DB level, which the resolver then reports as BOOKING_CONFLICT.
 */
describe("concurrency safety", () => {
  beforeEach(resetDb);

  test("only one of two simultaneous overlapping requests succeeds", async () => {
    const resource = await seedResource();
    const input = { resourceId: resource.id, startTime: "2026-09-01T10:00:00Z", endTime: "2026-09-01T11:00:00Z" };

    const [a, b] = await Promise.all([
      gql<CreateBookingResult>(CREATE_BOOKING, { input: { ...input, title: "A" } }),
      gql<CreateBookingResult>(CREATE_BOOKING, { input: { ...input, title: "B" } }),
    ]);

    const results: GqlResult<CreateBookingResult>[] = [a, b];
    const succeeded = results.filter((r) => !r.errors);
    const failed = results.filter((r) => r.errors);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.errors![0]!.extensions?.["code"]).toBe("BOOKING_CONFLICT");
  });

  test("exactly one of many concurrent requests for the same slot wins", async () => {
    const resource = await seedResource();
    const input = { resourceId: resource.id, startTime: "2026-09-02T10:00:00Z", endTime: "2026-09-02T11:00:00Z" };

    const attempts = Array.from({ length: 8 }, (_, i) =>
      gql<CreateBookingResult>(CREATE_BOOKING, { input: { ...input, title: `Attempt ${i}` } }),
    );
    const results = await Promise.all(attempts);

    expect(results.filter((r) => !r.errors)).toHaveLength(1);
    expect(results.filter((r) => r.errors)).toHaveLength(7);
  });
});
