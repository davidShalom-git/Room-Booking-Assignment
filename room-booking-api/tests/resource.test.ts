import { describe, test, expect, beforeEach } from "bun:test";
import { resetDb } from "./helpers/testDb.ts";
import { gql } from "./helpers/gql.ts";

const CREATE_RESOURCE = `
  mutation Create($input: CreateResourceInput!) {
    createResource(input: $input) { id name capacity }
  }
`;

const RESOURCE_WITH_BOOKINGS = `
  query R($id: ID!) {
    resource(id: $id) { id name bookings { id title } }
  }
`;

describe("resources", () => {
  beforeEach(resetDb);

  test("creates a resource", async () => {
    const res = await gql<{ createResource: { id: string; name: string; capacity: number } }>(CREATE_RESOURCE, {
      input: { name: "Room A", capacity: 4 },
    });
    expect(res.errors).toBeUndefined();
    expect(res.data?.createResource.name).toBe("Room A");
    expect(res.data?.createResource.capacity).toBe(4);
  });

  test("rejects non-positive capacity", async () => {
    const res = await gql(CREATE_RESOURCE, { input: { name: "Room B", capacity: 0 } });
    expect(res.errors?.[0]?.extensions?.["code"]).toBe("BAD_USER_INPUT");
  });

  test("rejects empty name", async () => {
    const res = await gql(CREATE_RESOURCE, { input: { name: "   ", capacity: 2 } });
    expect(res.errors?.[0]?.extensions?.["code"]).toBe("BAD_USER_INPUT");
  });

  test("resource query resolves nested bookings", async () => {
    const created = await gql<{ createResource: { id: string } }>(CREATE_RESOURCE, {
      input: { name: "Room C", capacity: 2 },
    });
    const id = created.data?.createResource.id;
    const result = await gql<{ resource: { bookings: unknown[] } }>(RESOURCE_WITH_BOOKINGS, { id });
    expect(result.data?.resource.bookings).toEqual([]);
  });

  test("unknown resource id returns null", async () => {
    const result = await gql<{ resource: unknown }>(RESOURCE_WITH_BOOKINGS, { id: "does-not-exist" });
    expect(result.errors).toBeUndefined();
    expect(result.data?.resource).toBeNull();
  });
});
