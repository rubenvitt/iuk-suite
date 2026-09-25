import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { anker, ankerAbweichung, rechner } from "../../_db/schema";
import type { RechnerZeile } from "./geraet";
import { testDb } from "../testDb";
import { kettenanker, meldeAnker } from "./anker";

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

/** Legt einen Rechner der gegebenen Art direkt an (ohne den Umweg über `richteEin`) und liefert die Zeile. */
function legeRechnerAn(db: ReturnType<typeof testDb>, o: { id: string; art: "echt" | "test"; widerrufenAm?: Date }): RechnerZeile {
  db.insert(rechner).values({
    id: o.id, art: o.art, name: `Rechner ${o.id}`, tokenHash: `hash-${o.id}`,
    eingerichtetAm: JETZT, eingerichtetVon: "Jana Albers", eingerichtetVonSub: "sub-1",
    widerrufenAm: o.widerrufenAm,
  }).run();
  return db.select().from(rechner).where(eq(rechner.id, o.id)).get()!;
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

describe("kettenanker", () => {
  it("echter Rechner: über alle echten Rechner, auch widerrufene — der aktive ohne eigene Anker liest den höchsten Block des widerrufenen", () => {
    const db = testDb();
    legeRechnerAn(db, { id: "alt", art: "echt", widerrufenAm: JETZT });
    const neu = legeRechnerAn(db, { id: "neu", art: "echt" });
    for (let block = 1; block <= 5; block++) {
      db.insert(anker).values({ rechnerId: "alt", block, hash: block.toString().repeat(64).slice(0, 64), gemeldetAm: JETZT }).run();
    }
    expect(kettenanker(db, neu)).toEqual({ ok: true, anker: { block: 5, hash: "5".repeat(64) } });
  });

  it("Test-Rechner sieht nur eigene Anker, nie die echten", () => {
    const db = testDb();
    legeRechnerAn(db, { id: "echt1", art: "echt" });
    db.insert(anker).values({ rechnerId: "echt1", block: 9, hash: H1, gemeldetAm: JETZT }).run();
    const test = legeRechnerAn(db, { id: "probe", art: "test" });
    expect(kettenanker(db, test)).toEqual({ ok: true, anker: null });

    db.insert(anker).values({ rechnerId: "probe", block: 2, hash: H2, gemeldetAm: JETZT }).run();
    expect(kettenanker(db, test)).toEqual({ ok: true, anker: { block: 2, hash: H2 } });
  });

  it("gleicher höchster Block, verschiedene Hashes bei zwei echten Rechnern → mehrdeutig", () => {
    const db = testDb();
    const a = legeRechnerAn(db, { id: "a", art: "echt", widerrufenAm: JETZT });
    const b = legeRechnerAn(db, { id: "b", art: "echt" });
    db.insert(anker).values({ rechnerId: "a", block: 4, hash: H1, gemeldetAm: JETZT }).run();
    db.insert(anker).values({ rechnerId: "b", block: 4, hash: H2, gemeldetAm: JETZT }).run();
    expect(kettenanker(db, a)).toEqual({ ok: false });
    expect(kettenanker(db, b)).toEqual({ ok: false });
  });

  it("ohne Anker → null", () => {
    const db = testDb();
    const echt = legeRechnerAn(db, { id: "echt1", art: "echt" });
    expect(kettenanker(db, echt)).toEqual({ ok: true, anker: null });
  });
});
