import { DateTimeScalar } from "../scalars/dateTime.ts";
import { resourceResolvers } from "./resource.ts";
import { bookingResolvers } from "./booking.ts";

export const resolvers = {
  DateTime: DateTimeScalar,
  Query: {
    ...resourceResolvers.Query,
    ...bookingResolvers.Query,
  },
  Mutation: {
    ...resourceResolvers.Mutation,
    ...bookingResolvers.Mutation,
  },
  Resource: resourceResolvers.Resource,
  Booking: bookingResolvers.Booking,
};
