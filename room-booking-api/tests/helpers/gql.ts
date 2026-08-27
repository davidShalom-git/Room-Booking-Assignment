import { graphql, type GraphQLFormattedError } from "graphql";
import { schema } from "../../src/schema.ts";

export interface GqlResult<T> {
  data?: T | null;
  errors?: readonly GraphQLFormattedError[];
}

export async function gql<T = Record<string, unknown>>(
  source: string,
  variableValues?: Record<string, unknown>,
): Promise<GqlResult<T>> {
  const result = await graphql({ schema, source, variableValues });
  return { data: result.data as T | null | undefined, errors: result.errors?.map((e) => e.toJSON()) };
}
