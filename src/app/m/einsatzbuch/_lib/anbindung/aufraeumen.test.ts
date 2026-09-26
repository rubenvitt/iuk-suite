import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { einmalcode, sitzung } from "../../_db/schema";
import { testDb, type TestDb } from "../testDb";
import { raeumeAnbindungAuf, starteEinsatzbuchHintergrund, stoppeEinsatzbuchHintergrund } from "./aufraeumen";

// Vorbild `src/app/m/radio/_lib/boot.test.ts`: `getDb()` wird gemockt, der Mock zeigt auf ein im
// Test selbst geöffnetes Handle (`testDb()`), damit der Takt-Block unten dieselbe DB sieht wie
// `starteEinsatzbuchHintergrund()` intern über `getDb()` öffnet.
const dbHalter = vi.hoisted(() => ({ db: undefined as unknown as TestDb }));
vi.mock("../../_db/client", () => ({ getDb: (): TestDb => dbHalter.db }));

const JETZT = new Date("2026-09-25T08:00:00Z");
const vor = (ms: number) => new Date(JETZT.getTime() - ms);
const nach = (ms: number) => new Date(JETZT.getTime() + ms);

function legeCode(db: TestDb, hash: string, ablauf: Date, eingeloest = false): void {
  db.insert(einmalcode).values({
    codeHash: hash, challenge: "c", sub: "sub-1", name: "Jana Albers", ablauf,
    eingeloestAm: eingeloest ? ablauf : null,
  }).run();
}
function legeSitzung(db: TestDb, hash: string, ablauf: Date): void {
  db.insert(sitzung).values({ tokenHash: hash, sub: "sub-1", name: "Jana Albers", ablauf }).run();
}

describe("raeumeAnbindungAuf", () => {
  it("löscht abgelaufene Einmalcodes (eingelöst und nicht eingelöst) und abgelaufene Sitzungen, gültige bleiben", () => {
    const db = testDb();
    legeCode(db, "abgelaufen-frei", vor(1_000));
    legeCode(db, "abgelaufen-eingeloest", vor(1_000), true);
    legeCode(db, "gueltig", nach(1_000));
    legeSitzung(db, "abgelaufen", vor(1_000));
    legeSitzung(db, "gueltig", nach(1_000));

    const zahlen = raeumeAnbindungAuf(db, JETZT);
    expect(zahlen).toEqual({ einmalcodes: 2, sitzungen: 1 });
    expect(db.select().from(einmalcode).all().map((z) => z.codeHash)).toEqual(["gueltig"]);
    expect(db.select().from(sitzung).all().map((z) => z.tokenHash)).toEqual(["gueltig"]);
  });

  it("ein Code oder eine Sitzung genau im Ablaufmoment bleibt (< statt <=)", () => {
    const db = testDb();
    legeCode(db, "genau", JETZT);
    legeSitzung(db, "genau", JETZT);
    expect(raeumeAnbindungAuf(db, JETZT)).toEqual({ einmalcodes: 0, sitzungen: 0 });
  });

  it("ohne abgelaufene Zeilen bleibt alles stehen", () => {
    const db = testDb();
    legeCode(db, "gueltig", nach(1_000));
    legeSitzung(db, "gueltig", nach(1_000));
    expect(raeumeAnbindungAuf(db, JETZT)).toEqual({ einmalcodes: 0, sitzungen: 0 });
  });
});

describe("starteEinsatzbuchHintergrund — der Takt", () => {
  let db: TestDb;

  beforeEach(() => {
    db = testDb();
    dbHalter.db = db;
    vi.useFakeTimers();
    vi.setSystemTime(JETZT);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    stoppeEinsatzbuchHintergrund();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("ist idempotent: ein zweiter und dritter Aufruf registrieren keinen weiteren Takt", () => {
    starteEinsatzbuchHintergrund();
    starteEinsatzbuchHintergrund();
    starteEinsatzbuchHintergrund();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("räumt alle zehn Minuten auf, nicht sofort beim Start", () => {
    legeCode(db, "abgelaufen", vor(1_000));
    starteEinsatzbuchHintergrund();
    expect(db.select().from(einmalcode).all()).toHaveLength(1);

    vi.advanceTimersByTime(10 * 60_000);
    expect(db.select().from(einmalcode).all()).toHaveLength(0);

    legeCode(db, "abgelaufen-2", vor(1_000));
    vi.advanceTimersByTime(10 * 60_000);
    expect(db.select().from(einmalcode).all()).toHaveLength(0);
  });

  it("stoppeEinsatzbuchHintergrund hält den Takt an und macht einen erneuten Start möglich", () => {
    starteEinsatzbuchHintergrund();
    expect(vi.getTimerCount()).toBe(1);
    stoppeEinsatzbuchHintergrund();
    expect(vi.getTimerCount()).toBe(0);
    starteEinsatzbuchHintergrund();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("ein Fehler im Lauf wirft nicht aus dem Takt heraus", () => {
    starteEinsatzbuchHintergrund();
    dbHalter.db = undefined as unknown as TestDb;
    expect(() => vi.advanceTimersByTime(10 * 60_000)).not.toThrow();
  });
});
