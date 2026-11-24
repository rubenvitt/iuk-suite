import { describe, expect, it } from "vitest";
import { lifelineZugang } from "../_db/schema";
import { bearerAus, hashVon, hatLifelineZugang, legeZugangAn, listeZugaenge, widerrufeZugang, zugangAusSchluessel } from "./schluessel";
import { testDb } from "./testDb";

const anfrage = (authorization?: string) => new Request("http://helfer.localtest.me/api/stammdaten", { headers: authorization ? { authorization } : {} });

describe("Zugang für Lifeline Hub (LLH-1194)", () => {
  it("nur der Hash wird gespeichert, der Schlüssel öffnet und vermerkt die Abholung", () => {
    const db = testDb();
    const { id, schluessel } = legeZugangAn(db, "Lifeline Hub", "Ruben");
    expect(schluessel).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const zeile = db.select().from(lifelineZugang).get()!;
    expect(zeile.schluesselHash).toBe(hashVon(schluessel));
    expect(JSON.stringify(zeile)).not.toContain(schluessel);
    expect(zugangAusSchluessel(db, schluessel, new Date("2026-11-25T08:00:00Z"))).toBe(id);
    expect(listeZugaenge(db)[0].zuletztAbgeholtAm).toBe("2026-11-25T08:00:00.000Z");
  });

  it("ein falscher, fehlender oder widerrufener Schlüssel öffnet nicht", () => {
    const db = testDb();
    const { id, schluessel } = legeZugangAn(db, "Lifeline Hub", "Ruben");
    expect(zugangAusSchluessel(db, "x".repeat(43))).toBeNull();
    expect(zugangAusSchluessel(db, null)).toBeNull();
    expect(widerrufeZugang(db, id)).toBe(true);
    expect(widerrufeZugang(db, id)).toBe(false);
    expect(zugangAusSchluessel(db, schluessel)).toBeNull();
  });

  it("hatLifelineZugang folgt dem Bestand", () => {
    const db = testDb();
    expect(hatLifelineZugang(db)).toBe(false);
    const { id } = legeZugangAn(db, "Lifeline Hub", "Ruben");
    expect(hatLifelineZugang(db)).toBe(true);
    widerrufeZugang(db, id);
    expect(hatLifelineZugang(db)).toBe(false);
  });

  it("liest nur ein wohlgeformtes Bearer-Token", () => {
    const s = "a".repeat(43);
    expect(bearerAus(anfrage(`Bearer ${s}`))).toBe(s);
    expect(bearerAus(anfrage(`bearer ${s}`))).toBeNull();
    expect(bearerAus(anfrage(`Bearer ${s}x`))).toBeNull();
    expect(bearerAus(anfrage())).toBeNull();
  });
});
