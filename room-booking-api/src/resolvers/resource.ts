import { prisma } from "../db.ts";
import { notFound, badInput } from "../lib/errors.ts";
import type { Resource } from "../../generated/prisma/client.ts";

interface CreateResourceInput {
  name: string;
  capacity: number;
}

export const resourceResolvers = {
  Query: {
    resources: () => prisma.resource.findMany({ orderBy: { createdAt: "asc" } }),
    resource: (_parent: unknown, args: { id: string }) => prisma.resource.findUnique({ where: { id: args.id } }),
  },
  Mutation: {
    createResource: async (_parent: unknown, args: { input: CreateResourceInput }) => {
      const { name, capacity } = args.input;
      if (!name.trim()) throw badInput("name must not be empty");
      if (!Number.isInteger(capacity) || capacity < 1) throw badInput("capacity must be a positive integer");
      return prisma.resource.create({ data: { name, capacity } });
    },
  },
  Resource: {
    bookings: (parent: Resource) =>
      prisma.booking.findMany({ where: { resourceId: parent.id }, orderBy: { startTime: "asc" } }),
  },
};

export async function requireResource(resourceId: string) {
  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!resource) throw notFound("Resource");
  return resource;
}
