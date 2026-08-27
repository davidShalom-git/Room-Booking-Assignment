import { GraphQLScalarType, GraphQLError, Kind } from "graphql";

function parse(value: unknown): Date {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new GraphQLError("DateTime must be a string or number");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new GraphQLError(`DateTime cannot represent invalid date: ${value}`);
  }
  return date;
}

export const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO-8601 date-time string, e.g. 2026-08-24T14:00:00.000Z",
  serialize(value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return parse(value).toISOString();
    throw new GraphQLError("DateTime serialize: expected Date or string");
  },
  parseValue(value) {
    return parse(value);
  },
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError("DateTime literal must be a string", { nodes: ast });
    }
    return parse(ast.value);
  },
});
