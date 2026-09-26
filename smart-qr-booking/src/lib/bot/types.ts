/**
 * Types for the booking assistant (the website chat). No I/O here: `step` (see step.ts) is a
 * function of (conversation, event, ports) -> (conversation, outgoing messages). Everything that
 * touches the outside world (database, clock, settings) comes in through `Ports` (ports-prisma.ts).
 */
import type { Settings } from "@/lib/settings";

export type Stage =
  | "browsing"
  | "need_name"
  | "need_contact"
  | "need_guests"
  | "need_checkin"
  | "need_checkout"
  | "choose_room"
  | "review"
  | "awaiting_payment"
  | "need_utr"
  | "ext_need_date"
  | "ext_choose_room";

export type Draft = {
  /** What the guest is doing with the dates they give: just checking, or booking. */
  intent?: "avail" | "book";
  name?: string;
  /** The guest's mobile number (digits, with country code) — the booking is made under it. */
  phone?: string;
  guests?: number;
  /** YYYY-MM-DD, property time. */
  checkIn?: string;
  nights?: number;
  /** The unpaid hold (a new stay, or an extension) this chat is paying for. */
  bookingId?: string;
  /** Stay being extended, and the check-out the guest asked for (while choosing a room). */
  extendStayId?: string;
  extendTo?: string;
  /** Booking whose "check out as planned" the owner was already told about. */
  checkoutAcked?: string;
};

export type ConvState = {
  /** The website chat ("web:<id>", kept in the visitor's cookie). */
  chat: string;
  /** The room this chat is about (from the room page / QR code). */
  roomId: string | null;
  stage: Stage;
  draft: Draft;
};

export type InEvent = { kind: "text"; from: string; text: string } | { kind: "button"; from: string; id: string };

export type Row = { id: string; title: string; description?: string };

/** Recipient for the owner app's push notifications. */
export const OWNER_PUSH = "push:owner";

/** One outgoing message: to a website chat, or to the owner app (OWNER_PUSH). */
export type Out = {
  to: string;
  text: string;
  buttons?: { id: string; title: string }[];
  list?: { button: string; rows: Row[] };
};

export type RoomInfo = {
  id: string;
  name: string;
  pricePerNight: number;
  capacity: number;
  bed: string;
  ac: boolean;
  size: string;
  shortDescription: string;
  amenities: string[];
};

/** A booking as the assistant sees it: plain strings, property-local dates and times. */
export type BookingView = {
  id: string;
  ref: string;
  roomId: string;
  roomName: string;
  ratePerNight: number;
  guestName: string;
  guestPhone: string;
  contactPhone: string | null;
  /** The website chat that made this booking — where messages about it go, and the only chat that can act on it. */
  chat: string | null;
  guests: number;
  checkIn: string;
  checkInTime: string;
  checkOut: string;
  checkOutTime: string;
  nights: number;
  total: number;
  /** Paid so far (acknowledged payments). */
  advancePaid: number;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  /** ISO instant; set while the room is held for payment (or after the hold lapsed). */
  holdExpiresAt: string | null;
  parentId: string | null;
};

export type PaymentView = {
  id: string;
  bookingId: string;
  kind: "ADVANCE" | "EXTENSION" | "BALANCE";
  amount: number;
  status: "AWAITING" | "CLAIMED" | "ACKNOWLEDGED" | "REJECTED" | "CANCELLED";
  utr: string | null;
  booking: BookingView;
};

/** A stay: the first booking plus its extensions / moves. */
export type StayView = {
  root: BookingView;
  segments: BookingView[];
  /** The last confirmed part — where the next extension starts. */
  end: BookingView;
  /** An extension still waiting for payment. */
  pending: BookingView | null;
};

export type PortFail = {
  ok: false;
  code: "CONFLICT" | "NOT_FOUND" | "INVALID" | "CAPACITY" | "INACTIVE" | "SUPERSEDED" | "LIMIT";
  message: string;
  conflict?: { ref: string; checkIn: string; checkOut: string; guestName: string };
};
export type PortResult<T> = { ok: true; value: T } | PortFail;

export interface Ports {
  /** The owner's settings (property details, times, advance, UPI). */
  settings(): Promise<Settings>;
  now(): Date;
  rooms(): Promise<RoomInfo[]>;
  room(id: string): Promise<RoomInfo | null>;
  /** Active rooms free for the whole stay that sleep at least `minCapacity` (default times). */
  freeRooms(checkIn: string, checkOut: string, minCapacity: number, excludeRoomId?: string): Promise<RoomInfo[]>;
  createHold(i: {
    roomId: string;
    guestName: string;
    guestPhone: string;
    guests: number;
    checkIn: string;
    checkOut: string;
    /** The chat making the hold. */
    chatKey: string;
  }): Promise<PortResult<BookingView>>;
  cancel(id: string): Promise<PortResult<BookingView>>;
  booking(id: string): Promise<BookingView | null>;
  /** CONFIRMED bookings that end a stay on this check-out date. */
  checkingOutOn(date: string): Promise<BookingView[]>;
  /** A chat's PENDING/CONFIRMED bookings that haven't ended yet, soonest first. */
  activeByChat(chat: string): Promise<BookingView[]>;
  /** Record that the last-day message for a booking went out for `date`; false if it already had. */
  claimNudge(id: string, date: string): Promise<boolean>;
  // payments
  openPayment(bookingId: string): Promise<PaymentView | null>;
  claim(bookingId: string, utr: string): Promise<PortResult<PaymentView & { duplicateRef: string | null }>>;
  // stays & extensions
  stay(id: string): Promise<StayView | null>;
  extensionOptions(stayId: string, newCheckOut: string): Promise<PortResult<{ stay: StayView; sameRoomFree: boolean; freeRooms: RoomInfo[] }>>;
  /** Hold the extra nights (same room or another), paid in full. */
  extend(stayId: string, roomId: string, newCheckOut: string): Promise<PortResult<BookingView>>;
}

export type StepResult = { conv: ConvState; out: Out[] };
