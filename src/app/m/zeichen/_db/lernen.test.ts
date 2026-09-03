import { describe, expect, it } from "vitest";
import { lernsets, lernsetZeichen, lernstand, newId } from "./schema";
import { testDb } from "./testdb";
import {
  aktiveLernsets,
  alleLernsetsMitAnzahl,
  einLernsetMitEintraegen,
  idsAusSet,
  lernUebersicht,
  naechsteKarte,
  schreibeAntwort,
} from "./lernen";

const SUB = "dev:a";
const HEUTE = "2026-09-03";

function mitLernsets(db: ReturnType<typeof testDb>) {
  const id = newId();
  db.insert(lernsets).values({
    id, slug: "rd", titel: "Rettungsdienst", aktiv: true, erstelltVon: SUB,
  }).run();
  db.insert(lernsetZeichen).values([
    { lernsetId: id, zeichenId: "rezept:C.1.1", titelSchnappschuss: "Löschstaffel", position: 0 },
    { lernsetId: id, zeichenId: "rezept:GIBTSNICHT", titelSchnappschuss: "Weg", position: 1 },
  ]).run();
  return id;
}

describe("lernUebersicht", () => {
  /*
   * DIE VIER ZAHLEN SUMMIEREN SICH AUF 232, nicht auf 246 — die 14 Grundzeichen sind
   * nicht fragbar. Eine Uebersicht, deren Summe nicht dem Bestand entspricht, ist eine
   * stille Luege ueber den eigenen Fortschritt.
   */
  it("summiert sich auf den fragbaren Bestand", () => {
    const db = testDb();
    const u = lernUebersicht(db, SUB, HEUTE);
    expect(u.gesamt).toBe(232);
    expect(u.gefestigt + u.inArbeit + u.faellig + u.nieGefragt).toBe(232);
    expect(u.nieGefragt).toBe(232);
  });

  it("zaehlt gefestigt, in Arbeit und faellig auseinander", () => {
    const db = testDb();
    db.insert(lernstand).values([
      { sub: SUB, zeichenId: "rezept:C.1.1", stufe: 3, faelligAm: "2099-01-01" },
      { sub: SUB, zeichenId: "rezept:E.1.1", stufe: 2, faelligAm: "2099-01-01" },
      { sub: SUB, zeichenId: "rezept:I.3.5", stufe: 1, faelligAm: "2000-01-01" },
    ]).run();
    const u = lernUebersicht(db, SUB, HEUTE);
    expect(u.gefestigt).toBe(1);
    expect(u.inArbeit).toBe(1);
    expect(u.faellig).toBe(1);
    expect(u.nieGefragt).toBe(229);
  });

  it("rechnet bei gewaehltem Set nur dessen aufloesbare Zeichen", () => {
    const db = testDb();
    mitLernsets(db);
    const u = lernUebersicht(db, SUB, HEUTE, idsAusSet(db, "rd"));
    // Zwei Eintraege, einer davon nicht mehr im Katalog.
    expect(u.gesamt).toBe(1);
  });
});

describe("naechsteKarte", () => {
  it("liefert null, wenn nichts faellig ist und alles gefestigt", () => {
    const db = testDb();
    for (const z of ["rezept:C.1.1"]) {
      db.insert(lernstand).values({ sub: SUB, zeichenId: z, stufe: 4, faelligAm: "2099-01-01" }).run();
    }
    // Es gibt 231 nie gefragte — die kommen zuerst.
    expect(naechsteKarte(db, SUB, HEUTE)).not.toBeNull();
  });

  it("bevorzugt faellige vor nie gefragten", () => {
    const db = testDb();
    db.insert(lernstand).values({
      sub: SUB, zeichenId: "rezept:C.1.1", stufe: 1, faelligAm: "2000-01-01",
    }).run();
    expect(naechsteKarte(db, SUB, HEUTE)?.zeichen.id).toBe("rezept:C.1.1");
  });

  /*
   * EINE LERNSTANDSZEILE OHNE AUFLOESUNG WIRD UEBERSPRUNGEN, NICHT GELOESCHT (Spec §4.6
   * Stufe 2): der Katalog koennte sie zurueckbringen. Ohne diesen Fall lieferte
   * naechsteKarte ein `null`-Zeichen und die Runde bliebe leer, ohne Fehlermeldung.
   */
  it("ueberspringt Zeilen, deren Zeichen der Katalog nicht mehr fuehrt", () => {
    const db = testDb();
    db.insert(lernstand).values({
      sub: SUB, zeichenId: "rezept:GIBTSNICHT", stufe: 0, faelligAm: "2000-01-01",
    }).run();
    const karte = naechsteKarte(db, SUB, HEUTE);
    expect(karte).not.toBeNull();
    expect(karte!.zeichen.id).not.toBe("rezept:GIBTSNICHT");
  });
});

describe("schreibeAntwort", () => {
  it("legt eine Zeile an und zaehlt richtig", () => {
    const db = testDb();
    schreibeAntwort(db, SUB, "rezept:C.1.1", "richtig", HEUTE);
    const z = db.select().from(lernstand).all()[0];
    expect(z.stufe).toBe(1);
    expect(z.richtig).toBe(1);
    expect(z.faelligAm).toBe("2026-09-06");
  });

  it("setzt bei falsch zurueck und zaehlt weiter", () => {
    const db = testDb();
    schreibeAntwort(db, SUB, "rezept:C.1.1", "richtig", HEUTE);
    schreibeAntwort(db, SUB, "rezept:C.1.1", "falsch", HEUTE);
    const z = db.select().from(lernstand).all()[0];
    expect(z.stufe).toBe(0);
    expect(z.richtig).toBe(1);
    expect(z.falsch).toBe(1);
    expect(z.faelligAm).toBe(HEUTE);
  });

  /*
   * FREIWILLIGES UEBEN AENDERT DEN STAND NICHT. Wer ein Zeichen uebt, das erst in zwoelf
   * Tagen faellig waere, arbeitet sich sonst mit Fleiss aus dem Stapel, ohne etwas zu
   * behalten — die Zahl "gefestigt" stiege, das Wissen nicht.
   */
  it("laesst einen noch nicht faelligen Stand unveraendert", () => {
    const db = testDb();
    db.insert(lernstand).values({
      sub: SUB, zeichenId: "rezept:C.1.1", stufe: 3, faelligAm: "2099-01-01", richtig: 5,
    }).run();
    schreibeAntwort(db, SUB, "rezept:C.1.1", "richtig", HEUTE);
    const z = db.select().from(lernstand).all()[0];
    expect(z.stufe).toBe(3);
    expect(z.faelligAm).toBe("2099-01-01");
    expect(z.richtig).toBe(5);
  });
});

describe("aktiveLernsets", () => {
  it("nennt Groesse und aufloesbare Groesse getrennt", () => {
    const db = testDb();
    mitLernsets(db);
    const [set] = aktiveLernsets(db);
    expect(set.slug).toBe("rd");
    expect(set.groesse).toBe(2);
    expect(set.verfuegbar).toBe(1);
  });

  it("zeigt nur aktive Sets", () => {
    const db = testDb();
    db.insert(lernsets).values({
      id: newId(), slug: "entwurf", titel: "Entwurf", aktiv: false, erstelltVon: SUB,
    }).run();
    expect(aktiveLernsets(db)).toEqual([]);
  });
});

describe("alleLernsetsMitAnzahl", () => {
  /*
   * FUER DIE VERWALTUNG, NICHT FUER `/lernen`: dort muessen auch Entwuerfe (aktiv: false)
   * sichtbar sein, sonst gaebe es keinen Weg, ein neu angelegtes Set ueberhaupt zu sehen
   * und mit Zeichen zu fuellen, bevor es veroeffentlicht wird.
   */
  it("zeigt aktive UND inaktive Sets, mit ihrer Groesse", () => {
    const db = testDb();
    mitLernsets(db);
    db.insert(lernsets).values({
      id: newId(), slug: "entwurf", titel: "Entwurf", aktiv: false, erstelltVon: SUB,
    }).run();
    const zeilen = alleLernsetsMitAnzahl(db);
    expect(zeilen.map((z) => z.slug).sort()).toEqual(["entwurf", "rd"]);
    const rd = zeilen.find((z) => z.slug === "rd")!;
    expect(rd.aktiv).toBe(true);
    expect(rd.anzahl).toBe(2);
    const entwurf = zeilen.find((z) => z.slug === "entwurf")!;
    expect(entwurf.aktiv).toBe(false);
    expect(entwurf.anzahl).toBe(0);
  });
});

describe("einLernsetMitEintraegen", () => {
  it("liefert null fuer eine unbekannte ID", () => {
    const db = testDb();
    expect(einLernsetMitEintraegen(db, "gibtsnicht")).toBeNull();
  });

  it("liefert Set und Eintraege in Positionsreihenfolge", () => {
    const db = testDb();
    const id = mitLernsets(db);
    const ergebnis = einLernsetMitEintraegen(db, id);
    expect(ergebnis?.set.slug).toBe("rd");
    expect(ergebnis?.eintraege.map((e) => e.zeichenId)).toEqual([
      "rezept:C.1.1",
      "rezept:GIBTSNICHT",
    ]);
  });
});
