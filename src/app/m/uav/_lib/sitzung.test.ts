import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { testDb } from "./testDb";
import { SID_COOKIE, sessionErzeugen, sessionValidieren, sessionLoeschen, sidCookieOptionen, tokenHash } from "./sitzung";
import { participants, sessions } from "../_db/schema";

const ROH = "alt-fixture-roh-token-0001";
const HEX = createHash("sha256").update(ROH).digest("hex"); // = Alt-Hash (sessions.ts:39)

describe("Teilnehmer-Session", () => {
  let db: ReturnType<typeof testDb>;
  beforeEach(() => {
    db = testDb();
    db.insert(participants).values({ id: "p1", name: "Ada", loginCode: "ABCDEFGH", aktiv: 1, createdAt: "2026-01-01T00:00:00.000Z" }).run();
  });
  it("heißt sid, path=/, httpOnly, lax, ohne domain", () => {
    expect(SID_COOKIE).toBe("sid");
    const o = sidCookieOptionen();
    expect(o).toMatchObject({ path: "/", httpOnly: true, sameSite: "lax", maxAge: 180 * 86400 });
    expect("domain" in o).toBe(false);
  });
  it("erkennt eine importierte Alt-Session am Alt-Hash", () => {
    db.insert(sessions).values({ token: HEX, kind: "participant", subjectId: "p1", createdAt: "2026-08-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" }).run();
    expect(tokenHash(ROH)).toBe(HEX);
    expect(sessionValidieren(db, ROH)).toEqual({ kind: "participant", id: "p1", name: "Ada" });
  });
  it("neue Session: Roh-Token im Rückgabewert, Hash in der Tabelle, 180 Tage", () => {
    const roh = sessionErzeugen(db, "p1");
    const zeile = db.select().from(sessions).all()[0];
    expect(zeile.token).toBe(tokenHash(roh));
    expect(zeile.token).not.toBe(roh);
    const ttl = new Date(zeile.expiresAt).getTime() - new Date(zeile.createdAt).getTime();
    expect(ttl).toBe(180 * 86400 * 1000);
  });
  it("abgelaufen → null und die Zeile ist weg; inaktiver Teilnehmer → null; admin-kind → null", () => {
    db.insert(sessions).values({ token: tokenHash("alt"), kind: "participant", subjectId: "p1", createdAt: "2020-01-01T00:00:00.000Z", expiresAt: "2020-01-02T00:00:00.000Z" }).run();
    expect(sessionValidieren(db, "alt")).toBeNull();
    expect(db.select().from(sessions).all()).toHaveLength(0);
    const roh = sessionErzeugen(db, "p1");
    db.update(participants).set({ aktiv: 0 }).run();
    expect(sessionValidieren(db, roh)).toBeNull();
    // Kollisionsfall: eine AKTIVE Teilnehmer-ID gleich der Admin-subjectId — ohne den
    // kind-Guard würde die Admin-Session sonst fälschlich als Teilnehmer durchgehen.
    db.insert(participants).values({ id: "x", name: "Kollision", loginCode: "ZZZZZZZZ", aktiv: 1, createdAt: "2026-01-01T00:00:00.000Z" }).run();
    db.insert(sessions).values({ token: tokenHash("adm"), kind: "admin", subjectId: "x", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" }).run();
    expect(sessionValidieren(db, "adm")).toBeNull();
  });
  it("löschen entfernt genau diese Session", () => {
    const a = sessionErzeugen(db, "p1"); const b = sessionErzeugen(db, "p1");
    sessionLoeschen(db, a);
    expect(sessionValidieren(db, a)).toBeNull();
    expect(sessionValidieren(db, b)).not.toBeNull();
  });
});
