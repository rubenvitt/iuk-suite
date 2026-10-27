import { describe, expect, it } from "vitest";
import { zugang } from "../_db/schema";
import { bearerAus, hashVon, legeZugangAn, listeZugaenge, widerrufeZugang, zugangAusSchluessel } from "./schluessel";
import { testDb } from "./testDb";

const anfrage = (authorization?: string) => new Request("http://lagemonitor.localtest.me/api/konfiguration", { headers: authorization ? { authorization } : {} });

describe("Schlüssel für den Lagemonitor", () => {
  it("nur der Hash wird gespeichert, der Schlüssel öffnet", () => {
    const db = testDb();
    const { id, schluessel } = legeZugangAn(db, "FüKw Uelzen", "Ruben");
    expect(schluessel).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const zeile = db.select().from(zugang).get()!;
    expect(zeile.schluesselHash).toBe(hashVon(schluessel));
    expect(JSON.stringify(zeile)).not.toContain(schluessel);
    expect(zugangAusSchluessel(db, schluessel, new Date("2026-10-27T18:00:00Z"))).toBe(id);
    expect(listeZugaenge(db)[0].zuletztAbgeholtAm).toBe("2026-10-27T18:00:00.000Z");
  });

  it("ein falscher oder widerrufener Schlüssel öffnet nicht", () => {
    const db = testDb();
    const { id, schluessel } = legeZugangAn(db, "FüKw", "Ruben");
    expect(zugangAusSchluessel(db, "x".repeat(43))).toBeNull();
    expect(zugangAusSchluessel(db, null)).toBeNull();
    expect(widerrufeZugang(db, id)).toBe(true);
    expect(widerrufeZugang(db, id)).toBe(false);
    expect(zugangAusSchluessel(db, schluessel)).toBeNull();
  });

  it("liest nur ein wohlgeformtes Bearer-Token", () => {
    const s = "A".repeat(43);
    expect(bearerAus(anfrage(`Bearer ${s}`))).toBe(s);
    expect(bearerAus(anfrage(`bearer ${s}`))).toBeNull();
    expect(bearerAus(anfrage("Bearer kurz"))).toBeNull();
    expect(bearerAus(anfrage())).toBeNull();
  });
});
