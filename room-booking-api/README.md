# Room Booking GraphQL API

Meeting-room / shared-resource booking backend. Bun + TypeScript (strict) + GraphQL Yoga (schema-first `.graphql` files) + Prisma + PostgreSQL.

## Setup

```bash
bun install
cp .env.example .env   # fill in DATABASE_URL (and optionally TEST_DATABASE_URL)
bunx prisma migrate dev   # applies migrations, incl. the exclusion constraint below
bun run dev                # http://localhost:4000/graphql
```

Run tests (hits a real Postgres DB — set `TEST_DATABASE_URL` in `.env` to keep it separate from dev data):

```bash
bun test
```

## The core problem: no two CONFIRMED bookings on a resource may overlap

Two layers, doing different jobs:

1. **Postgres `EXCLUDE` constraint** (`prisma/migrations/..._add_booking_exclusion_constraint`) is the actual guarantee:

   ```sql
   ALTER TABLE "Booking"
     ADD CONSTRAINT "booking_no_overlap"
     EXCLUDE USING gist (
       "resourceId" WITH =,
       tstzrange("startTime", "endTime", '[)') WITH &&
     )
     WHERE ("status" = 'CONFIRMED');
   ```

   The database itself refuses any insert/update that would create an overlapping pair for the same resource, even if two requests race each other in parallel transactions. No app-level lock can be forgotten or coded wrong, because the guarantee doesn't live in app code. `'[)'` makes the range half-open, so a booking ending at 11:00 and one starting at 11:00 do not count as overlapping — back-to-back is allowed. The `WHERE` clause means CANCELLED rows are invisible to the constraint, so a cancelled slot is immediately reusable. `btree_gist` is required to mix the plain equality column (`resourceId`) with the range column in one GiST index.

2. **Application pre-check** (`src/lib/overlap.ts`) runs a normal `findFirst` for a conflicting CONFIRMED booking before attempting the write, so the common case returns a clean `BOOKING_CONFLICT` GraphQL error immediately. It is *not* the safety mechanism — under true concurrency two requests can both pass this check before either commits. When that happens, the constraint above rejects the loser and the resolver catches Postgres's constraint-violation error (Prisma error `P2004`) and turns it into the same `BOOKING_CONFLICT` error. See `tests/concurrency.test.ts` for the test that only exercises this path (fires N concurrent `createBooking` mutations at the identical slot, asserts exactly one wins).

Rescheduling reuses `hasOverlap` with the moved booking's own id excluded, so a booking never conflicts with itself.

## Schema

```graphql
type Resource { id: ID! name: String! capacity: Int! createdAt: DateTime! bookings: [Booking!]! }
type Booking  { id: ID! resource: Resource! title: String! startTime: DateTime! endTime: DateTime!
                status: BookingStatus! createdAt: DateTime! updatedAt: DateTime! }
enum BookingStatus { CONFIRMED CANCELLED }

type Query {
  resources: [Resource!]!
  resource(id: ID!): Resource
  bookings(resourceId: ID, status: BookingStatus, first: Int = 20, after: String): BookingConnection!
  isAvailable(resourceId: ID!, start: DateTime!, end: DateTime!): Boolean!
}

type Mutation {
  createResource(input: CreateResourceInput!): Resource!
  createBooking(input: CreateBookingInput!): Booking!
  rescheduleBooking(id: ID!, input: RescheduleBookingInput!): Booking!
  cancelBooking(id: ID!): Booking!
  deleteBooking(id: ID!): Boolean!
}
```

Full SDL lives in [`schema/`](schema/) (`resource.graphql`, `booking.graphql`, `scalar.graphql`) — loaded and merged at startup in [`src/schema.ts`](src/schema.ts).

### Example

```graphql
mutation {
  createBooking(input: {
    resourceId: "res_123"
    title: "Standup"
    startTime: "2026-09-01T10:00:00Z"
    endTime: "2026-09-01T10:30:00Z"
  }) { id status }
}

query {
  bookings(resourceId: "res_123", first: 10) {
    edges { cursor node { title startTime endTime status } }
    pageInfo { hasNextPage endCursor }
  }
}
```

## Pagination

`bookings` uses keyset (cursor) pagination ordered by `(startTime, id)` — `id` breaks ties between bookings with the same `startTime`, so pages never skip or repeat a row even under concurrent inserts. The cursor is `base64("<startTime ISO>|<id>")`, opaque to the client. Backed by the `Booking(resourceId, startTime)` index, which also serves the availability check and per-resource listing.

## Design choices / trade-offs

- **Errors** carry `extensions.code` (`BOOKING_CONFLICT`, `NOT_FOUND`, `BAD_USER_INPUT`) so clients can branch on them without string-matching messages.
- **No GraphQL codegen.** The schema is small enough that hand-written resolver arg types (see each file in `src/resolvers/`) stay easier to read than generated ones — would reach for `graphql-code-generator` if the schema grew past a handful of types.
- **`Booking.resource` / `Resource.bookings`** resolve with a plain `findUnique`/`findMany` per field (no DataLoader batching). Fine at this scale; would add batching if list queries commonly nested deep resource lookups.
- **Delete vs cancel**: `cancelBooking` sets `status: CANCELLED` (soft, keeps history, frees the slot); `deleteBooking` hard-deletes and returns `false` instead of throwing if the id doesn't exist, matching its `Boolean!` "did this leave a booking deleted" semantics.
