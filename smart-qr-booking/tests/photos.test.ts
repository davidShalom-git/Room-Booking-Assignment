/**
 * Photos uploaded from the owner's phone: stored in Postgres, served at /photos/<id>, only real
 * images accepted, and ones nobody uses cleaned up.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { cleanupPhotos, readPhoto, savePhoto, MAX_PHOTO_BYTES } from "../src/lib/photos";
import { saveSettings } from "../src/lib/settings";
import { saveRoom } from "../src/lib/admin-ops";
import { GET as servePhoto } from "../src/app/photos/[id]/route";
import { resetDb, seedRooms } from "./helpers/db";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = new Uint8Array([...Buffer.from("RIFF"), 0x24, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]);
const idOf = (url: string) => url.replace("/photos/", "");

beforeEach(resetDb);

describe("uploading a photo", () => {
  test("JPEG, PNG and WebP are stored and served back with their type", async () => {
    for (const [bytes, type] of [[JPEG, "image/jpeg"], [PNG, "image/png"], [WEBP, "image/webp"]] as const) {
      const r = await savePhoto(bytes);
      assert.ok(r.ok, JSON.stringify(r));
      assert.match(r.url, /^\/photos\/[A-Za-z0-9_-]+$/);
      const back = await readPhoto(idOf(r.url));
      assert.equal(back?.type, type);
      assert.deepEqual([...back!.data], [...bytes]);
    }
  });

  test("anything that isn't a JPEG, PNG or WebP image is refused, whatever it claims to be", async () => {
    for (const bytes of [
      new Uint8Array(Buffer.from("<svg onload=alert(1)>")),
      new Uint8Array(Buffer.from("<html><script>")),
      new Uint8Array(Buffer.from("GIF89a")),
      new Uint8Array(0),
    ]) {
      const r = await savePhoto(bytes);
      assert.equal(r.ok, false);
    }
    assert.equal(await prisma.photo.count(), 0);
  });

  test("a photo over the size limit is refused", async () => {
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(JPEG);
    assert.equal((await savePhoto(big)).ok, false);
  });

  test("an unknown id is not found", async () => {
    assert.equal(await readPhoto("nope"), null);
  });

  test("served at /photos/<id> with its type, cached for good (a photo never changes); unknown ids 404", async () => {
    const r = await savePhoto(PNG);
    assert.ok(r.ok);
    const get = (id: string) => servePhoto(new Request(`http://x/photos/${id}`), { params: Promise.resolve({ id }) });
    const res = await get(idOf(r.url));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.match(res.headers.get("cache-control") ?? "", /immutable/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [...PNG]);
    assert.equal((await get("missing")).status, 404);
  });
});

describe("rooms and settings use uploaded photos", () => {
  test("a room can be saved with uploaded photos", async () => {
    const r = await savePhoto(JPEG);
    assert.ok(r.ok);
    const saved = await saveRoom({
      id: "105", name: "Garden Room", pricePerNight: "1500", capacity: "2", bed: "Queen Bed",
      shortDescription: "Looks onto the garden.", description: "A quiet room by the garden.", images: r.url,
    });
    assert.ok(saved.ok, JSON.stringify(saved));
    assert.deepEqual((await prisma.room.findUniqueOrThrow({ where: { id: "105" } })).images, [r.url]);
  });
});

describe("cleanup", () => {
  test("photos no room or setting uses are deleted after a day; used and fresh ones stay", async () => {
    await seedRooms([{ id: "101" }]);
    const now = new Date("2026-10-01T12:00:00Z");
    const old = new Date("2026-09-29T12:00:00Z");
    const make = async (createdAt: Date) => {
      const r = await savePhoto(JPEG);
      assert.ok(r.ok);
      await prisma.photo.update({ where: { id: idOf(r.url) }, data: { createdAt } });
      return r.url;
    };
    const inRoom = await make(old);
    const inSettings = await make(old);
    const unusedOld = await make(old);
    const unusedFresh = await make(now);
    await prisma.room.update({ where: { id: "101" }, data: { images: [inRoom] } });
    const f = {
      name: "Green Valley", tagline: "A farm stay", city: "Munnar, Kerala", address: "Chithirapuram, Munnar",
      phone: "94470 12345", about: "Four rooms on a working farm.", checkInTime: "12:00", checkOutTime: "10:00",
      advancePercent: "30", upiId: "gv@okaxis", upiName: "Green Valley", photos: inSettings,
    };
    assert.ok((await saveSettings(f)).ok);

    assert.equal(await cleanupPhotos(now), 1);
    const left = (await prisma.photo.findMany()).map((p) => `/photos/${p.id}`).sort();
    assert.deepEqual(left, [inRoom, inSettings, unusedFresh].sort());
    assert.ok(!left.includes(unusedOld));
  });
});
