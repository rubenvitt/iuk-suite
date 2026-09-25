import { describe, expect, it } from "vitest";
import { anker, ankerAbweichung, rechner } from "../../_db/schema";
import { testDb } from "../testDb";
import { meldeAnker } from "./anker";

const JETZT = new Date("2026-09-25T08:00:00Z");
const H1 = "1".repeat(64);
const H2 = "2".repeat(64);

function mitRechnern() {
  const db = testDb();
  for (const id of ["r1", "r2"]) {
    db.insert(rechner).values({
      id, art: "test", name: `Rechner ${id}`, tokenHash: `hash-${id}`,
      eingerichtetAm: JETZT, eingerichtetVon: "Jana Albers", eingerichtetVonSub: "sub-1",
    }).run();
  }
  return db;
}

describe("meldeAnker", () => {
  it("neu → ok, gleich → ok", () => {
    const db = mitRechnern();
    expect(meldeAnker(db, "r1", 1, H1, JETZT)).toEqual({ ok: true });
    expect(meldeAnker(db, "r1", 1, H1, new Date(JETZT.getTime() + 60_000))).toEqual({ ok: true });
    expect(db.select().from(anker).all()).toEqual([{ rechnerId: "r1", block: 1, hash: H1, gemeldetAm: JETZT }]);
    expect(db.select().from(ankerAbweichung).all()).toEqual([]);
  });

  it("anders → erwartet plus eine Zeile in anker_abweichung mit beiden Hashes; der Anker bleibt", () => {
    const db = mitRechnern();
    meldeAnker(db, "r1", 3, H1, JETZT);
    expect(meldeAnker(db, "r1", 3, H2, JETZT)).toEqual({ ok: false, erwartet: H1 });
    expect(db.select().from(ankerAbweichung).all()).toEqual([
      { id: expect.any(String), rechnerId: "r1", block: 3, erwartet: H1, gemeldet: H2, zeitpunkt: JETZT },
    ]);
    expect(db.select().from(anker).all()).toEqual([{ rechnerId: "r1", block: 3, hash: H1, gemeldetAm: JETZT }]);
  });

  it("dieselbe Abweichung erneut gemeldet → wieder erwartet, aber keine zweite Zeile", () => {
    const db = mitRechnern();
    meldeAnker(db, "r1", 3, H1, JETZT);
    expect(meldeAnker(db, "r1", 3, H2, JETZT)).toEqual({ ok: false, erwartet: H1 });
    expect(meldeAnker(db, "r1", 3, H2, new Date(JETZT.getTime() + 3_600_000))).toEqual({ ok: false, erwartet: H1 });
    expect(meldeAnker(db, "r1", 3, H2, new Date(JETZT.getTime() + 7_200_000))).toEqual({ ok: false, erwartet: H1 });
    expect(db.select().from(ankerAbweichung).all()).toEqual([
      { id: expect.any(String), rechnerId: "r1", block: 3, erwartet: H1, gemeldet: H2, zeitpunkt: JETZT },
    ]);
  });

  it("eine andere Abweichung am selben Block ist eine neue Zeile", () => {
    const db = mitRechnern();
    const H3 = "3".repeat(64);
    meldeAnker(db, "r1", 3, H1, JETZT);
    meldeAnker(db, "r1", 3, H2, JETZT);
    expect(meldeAnker(db, "r1", 3, H3, JETZT)).toEqual({ ok: false, erwartet: H1 });
    expect(db.select({ gemeldet: ankerAbweichung.gemeldet }).from(ankerAbweichung).all().map((z) => z.gemeldet).sort()).toEqual([H2, H3]);
  });

  it("Anker zweier Rechner stören sich nicht", () => {
    const db = mitRechnern();
    expect(meldeAnker(db, "r1", 1, H1, JETZT)).toEqual({ ok: true });
    expect(meldeAnker(db, "r2", 1, H2, JETZT)).toEqual({ ok: true });
    expect(db.select().from(ankerAbweichung).all()).toEqual([]);
    expect(db.select().from(anker).all()).toHaveLength(2);
  });
});
