import { GraphQLError } from "graphql";

export interface Cursor {
  startTime: Date;
  id: string;
}

export function encodeCursor(startTime: Date, id: string): string {
  return Buffer.from(`${startTime.toISOString()}|${id}`, "utf8").toString("base64");
}

export function decodeCursor(cursor: string): Cursor {
  let raw: string;
  try {
    raw = Buffer.from(cursor, "base64").toString("utf8");
  } catch {
    throw new GraphQLError("Invalid cursor", { extensions: { code: "BAD_CURSOR" } });
  }
  const [startTimeRaw, id] = raw.split("|");
  const startTime = startTimeRaw ? new Date(startTimeRaw) : undefined;
  if (!startTime || Number.isNaN(startTime.getTime()) || !id) {
    throw new GraphQLError("Invalid cursor", { extensions: { code: "BAD_CURSOR" } });
  }
  return { startTime, id };
}
