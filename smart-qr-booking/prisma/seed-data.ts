/**
 * Initial rooms for a fresh database (`npm run db:seed`). After that, rooms are managed
 * in /admin/rooms — editing this file does not change an existing database.
 */
export type SeedRoom = {
  id: string;
  name: string;
  type: string;
  pricePerNight: number;
  capacity: number;
  bed: string;
  ac: boolean;
  size: string;
  floor: number;
  shortDescription: string;
  description: string;
  amenities: string[];
  images: string[];
};

const U = (id: string, w = 1400) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

// A small pool of hand-checked hotel-interior photos, reused across rooms.
const PHOTO = {
  woodRoom: "1611892440504-42a792e24d32", // warm wood bedroom, garden view
  lampRoom: "1522771739844-6a9f6d5f14af", // bed, reading lamp, nightstand
  plantRoom: "1631049307264-da0ec9d70304", // bright modern bed with plant
  classicRoom: "1590490360182-c33d57733427", // classic bed, drapes, settee
  kingRoom: "1618773928121-c32242e63f39", // warm king room, twin lamps, art
  sitting: "1560448204-e02f11c3d0e2", // bright sitting room, big windows
  lounge: "1611048267451-e6ed903d4a38", // double-height lounge, staircase
};

const CORE = ["Free WiFi", "TV", "Hot Water", "Attached Bathroom", "Daily Housekeeping"];

export const seedRooms: SeedRoom[] = [
  {
    id: "101",
    name: "Deluxe Double Room",
    type: "Deluxe Double",
    pricePerNight: 1800,
    capacity: 2,
    bed: "King Bed",
    ac: true,
    size: "24 m²",
    floor: 1,
    shortDescription:
      "Our signature room — a calm, high-ceilinged retreat with a king bed and courtyard light.",
    description:
      "The Deluxe Double is the room we send our favourite guests to. Tall shuttered windows open onto the inner courtyard, filling the space with soft filtered light through the afternoon. Expect a proper king bed with a firm-but-forgiving mattress, blackout curtains for lazy mornings, a compact work nook, and a rain shower in the attached bathroom. Complimentary breakfast on the rooftop is included.",
    amenities: [...CORE, "Air Conditioning", "Room Service", "Work Desk", "Mini Fridge", "Tea/Coffee Kit", "Blackout Curtains"],
    images: [U(PHOTO.lampRoom), U(PHOTO.woodRoom), U(PHOTO.lounge), U(PHOTO.classicRoom)],
  },
  {
    id: "102",
    name: "Standard Double Room",
    type: "Standard Double",
    pricePerNight: 1500,
    capacity: 2,
    bed: "Queen Bed",
    ac: true,
    size: "20 m²",
    floor: 1,
    shortDescription:
      "An easy, well-priced double with everything you need for a comfortable city stay.",
    description:
      "A straightforward, comfortable room for two. The queen bed is dressed in cotton linen, the AC is quiet, and the bathroom is fully tiled with a hot-water shower that actually runs hot. A good base for exploring Fort Kochi on foot — the spice market and the Chinese fishing nets are a ten-minute walk away.",
    amenities: [...CORE, "Air Conditioning", "Room Service", "Tea/Coffee Kit"],
    images: [U(PHOTO.classicRoom), U(PHOTO.plantRoom), U(PHOTO.lampRoom)],
  },
  {
    id: "103",
    name: "Family Room",
    type: "Family Room",
    pricePerNight: 2200,
    capacity: 4,
    bed: "1 King + 2 Single Beds",
    ac: true,
    size: "34 m²",
    floor: 1,
    shortDescription:
      "Room for the whole family — a king plus two singles, and space that doesn't feel crowded.",
    description:
      "Built for four without anyone drawing the short straw. A king bed for the grown-ups, two proper single beds for the kids, and enough floor space for open suitcases and a game of cards. The bathroom has a bathtub as well as a shower. Cots and high chairs are available on request at no charge.",
    amenities: [...CORE, "Air Conditioning", "Room Service", "Mini Fridge", "Bathtub", "Tea/Coffee Kit", "Extra Bedding"],
    images: [U(PHOTO.sitting), U(PHOTO.kingRoom), U(PHOTO.woodRoom), U(PHOTO.lounge)],
  },
  {
    id: "104",
    name: "Garden Twin Room",
    type: "Garden Twin",
    pricePerNight: 1200,
    capacity: 2,
    bed: "2 Single Beds",
    ac: false,
    size: "18 m²",
    floor: 1,
    shortDescription:
      "A breezy non-AC twin opening onto the garden — our best value room for two friends.",
    description:
      "A naturally cool, fan-ventilated room that opens straight onto the garden. Two single beds, terracotta floors, and the sound of birds in the frangipani tree. Popular with friends travelling together and with guests who'd rather sleep with the windows open. Hot-water shower in the attached bathroom.",
    amenities: [...CORE, "Ceiling Fan", "Garden View", "Tea/Coffee Kit"],
    images: [U(PHOTO.plantRoom), U(PHOTO.lampRoom), U(PHOTO.sitting)],
  },
  {
    id: "201",
    name: "Deluxe Balcony Room",
    type: "Deluxe Balcony",
    pricePerNight: 2000,
    capacity: 2,
    bed: "King Bed",
    ac: true,
    size: "26 m²",
    floor: 2,
    shortDescription:
      "First-floor deluxe with a private balcony over the street — coffee outside at sunrise.",
    description:
      "The same calm interior as our Deluxe Double, with the addition of a private balcony that catches the morning sun and the evening breeze. Two chairs and a small table make it the nicest spot in the building for a first coffee. King bed, blackout curtains, rain shower, and a writing desk by the window.",
    amenities: [...CORE, "Air Conditioning", "Private Balcony", "Room Service", "Work Desk", "Mini Fridge", "Tea/Coffee Kit", "Blackout Curtains"],
    images: [U(PHOTO.woodRoom), U(PHOTO.kingRoom), U(PHOTO.lounge), U(PHOTO.classicRoom)],
  },
  {
    id: "202",
    name: "Standard Double Room",
    type: "Standard Double",
    pricePerNight: 1500,
    capacity: 2,
    bed: "Queen Bed",
    ac: true,
    size: "20 m²",
    floor: 2,
    shortDescription:
      "A quiet second-floor double, set back from the street for light sleepers.",
    description:
      "Same layout as room 102, one floor up and towards the back of the building — the quietest Standard Double we have. Queen bed, quiet AC, tiled hot-water bathroom. A reliable, restful choice at a fair price.",
    amenities: [...CORE, "Air Conditioning", "Room Service", "Tea/Coffee Kit"],
    images: [U(PHOTO.kingRoom), U(PHOTO.classicRoom), U(PHOTO.lampRoom)],
  },
  {
    id: "203",
    name: "Premium Suite",
    type: "Premium Suite",
    pricePerNight: 2800,
    capacity: 3,
    bed: "King Bed + Sofa Bed",
    ac: true,
    size: "42 m²",
    floor: 2,
    shortDescription:
      "Our largest room — a separate sitting area, the best bathroom in the house, and space to spread out.",
    description:
      "The Premium Suite is a full step up: a bedroom with a king bed, a separate sitting room with a sofa that converts to a comfortable third bed, and a large bathroom with a rain shower and a deep tub. South-facing windows keep it bright all day. Ideal for a longer stay, a small family, or anyone who works from the room.",
    amenities: [...CORE, "Air Conditioning", "Separate Sitting Room", "Room Service", "Work Desk", "Mini Fridge", "Bathtub", "Tea/Coffee Kit", "Blackout Curtains", "Air Purifier"],
    images: [U(PHOTO.kingRoom), U(PHOTO.lounge), U(PHOTO.sitting), U(PHOTO.woodRoom)],
  },
  {
    id: "204",
    name: "Budget Single Room",
    type: "Budget Single",
    pricePerNight: 1000,
    capacity: 1,
    bed: "Single Bed",
    ac: false,
    size: "12 m²",
    floor: 2,
    shortDescription:
      "A compact, honest single for the solo traveller who's out all day anyway.",
    description:
      "Small, clean, and priced accordingly. A single bed, a fan, a shelf and hooks for your things, and a private hot-water bathroom just across the landing. No frills — but the linen is fresh, the roof cafe is included, and you're two minutes from the water.",
    amenities: [...CORE, "Ceiling Fan", "Tea/Coffee Kit"],
    images: [U(PHOTO.lampRoom), U(PHOTO.plantRoom), U(PHOTO.classicRoom)],
  },
];
