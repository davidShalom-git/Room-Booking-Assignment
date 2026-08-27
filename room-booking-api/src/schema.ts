import { createSchema } from "graphql-yoga";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvers } from "./resolvers/index.ts";

const schemaDir = join(import.meta.dir, "..", "schema");
const typeDefs = readdirSync(schemaDir)
  .filter((file) => file.endsWith(".graphql"))
  .map((file) => readFileSync(join(schemaDir, file), "utf8"));

export const schema = createSchema({ typeDefs, resolvers });
