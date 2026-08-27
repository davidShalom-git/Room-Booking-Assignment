import { createYoga } from "graphql-yoga";
import { schema } from "./schema.ts";

const yoga = createYoga({ schema });

const server = Bun.serve({
  port: Number(process.env["PORT"] ?? 4000),
  fetch: yoga.fetch,
});

console.log(`GraphQL server ready at http://localhost:${server.port}/graphql`);
