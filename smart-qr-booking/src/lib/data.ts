/**
 * Property photos for the home and about pages. Rooms (and their photos) live in the
 * database and are managed at /admin/rooms; the initial set is in prisma/seed-data.ts.
 */
const U = (id: string, w = 1400) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const PROPERTY_IMAGES = {
  hero: U("1611892440504-42a792e24d32", 2000),
  courtyard: U("1560448204-e02f11c3d0e2", 1600),
  cafe: U("1618773928121-c32242e63f39", 1600),
};
