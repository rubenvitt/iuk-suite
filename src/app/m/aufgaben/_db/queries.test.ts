import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "./testdb";
import { migrierteTestDb } from "./testdb";
import {
  personen,
  aufgaben,
  routinen,
  nachweise,
  dateien,
  verlauf,
  type PersonRow,
  type Rolle,
} from "./schema";
import {
  allePersonen,
  aktivePersonen,
  aktualisierePerson,
  alleAufgaben,
  bufdis,
  erstellePerson,
  personNachSub,
  personNachId,
  aufgabe,
  aufgabenFuerPerson,
  posteingang,
  freigabenFuer,
  aufgabenVonErsteller,
  archiv,
  routinenFuer,
  verlaufFuer,
  nachweiseFuer,
  nachweiseSeitLetzterZurueckweisung,
  planRangFuerEinplanen,
  rangGrenzen,
  erstelleNachweis,
  erstelleDatei,
  dateiNachId,
  nachweisNachId,
  mitDatei,
  schreibeVerlauf,
  verteilDaten,
  wochenAuslastungFuerBufdis,
  freigabeDaten,
} from "./queries";

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
});
afterEach(() => t.schliessen());

const HEUTE = "2026-08-13";

function legePerson(sub: string, rolle: Rolle, extra: Partial<PersonRow> = {}): PersonRow {
  return t.db
    .insert(personen)
    .values({
      sub,
      name: extra.name ?? sub,
      initialen: extra.initialen ?? sub.slice(0, 2).toUpperCase(),
      rolle,
      // `?? extra.sollMinutenTag` (Aufgabe 14): erst ab hier von einem Aufrufer gebraucht
      // (`wochenAuslastungFuerBufdis`-Tests brauchen unterschiedliche Sollwerte je Person) — ohne
      // Angabe bleibt es beim Schema-Vorgabewert 468, wie vorher.
      sollMinutenTag: extra.sollMinutenTag ?? 468,
      aktivVon: extra.aktivVon ?? "2026-01-01",
      aktivBis: extra.aktivBis ?? null,
    })
    .returning()
    .get();
}

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert>) {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      erstellerId: extra.erstellerId as string,
      status: "eingegangen",
      faelligAm: "2026-08-20",
      dauerMinuten: 60,
      ...extra,
    })
    .returning()
    .get();
}

describe("allePersonen — sortiert nach Rolle, dann Name", () => {
  it("koordination vor auftrag vor bufdi, innerhalb der Rolle alphabetisch", () => {
    legePerson("b1", "bufdi", { name: "Zoe" });
    legePerson("b2", "bufdi", { name: "Anna" });
    legePerson("a1", "auftrag", { name: "Bert" });
    legePerson("k1", "koordination", { name: "Rike" });
    const namen = allePersonen(t.db).map((p) => p.name);
    expect(namen).toEqual(["Rike", "Bert", "Anna", "Zoe"]);
  });
});

describe("aktivePersonen — schliesst ausgeschiedene aus", () => {
  it("nimmt nur, wer an `heute` aktiv ist", () => {
    const aktiv = legePerson("akt", "bufdi");
    legePerson("ex", "bufdi", { aktivBis: "2026-08-01" });
    const ergebnis = aktivePersonen(t.db, HEUTE);
    expect(ergebnis.map((p) => p.id)).toEqual([aktiv.id]);
  });
});

describe("bufdis — aktive Personen mit rolle === 'bufdi'", () => {
  it("schliesst koordination/auftrag UND ausgeschiedene BuFDis aus", () => {
    const alina = legePerson("alina", "bufdi");
    legePerson("bendix-ex", "bufdi", { aktivBis: "2026-08-01" });
    legePerson("rike", "koordination");
    legePerson("malte", "auftrag");
    expect(bufdis(t.db, HEUTE).map((p) => p.id)).toEqual([alina.id]);
  });
});

describe("personNachSub / personNachId", () => {
  it("findet ueber sub, liefert null ohne Treffer", () => {
    const p = legePerson("gesucht", "bufdi");
    expect(personNachSub(t.db, "gesucht")?.id).toBe(p.id);
    expect(personNachSub(t.db, "nicht-vorhanden")).toBeNull();
  });

  it("findet ueber id, liefert null ohne Treffer", () => {
    const p = legePerson("gesucht2", "bufdi");
    expect(personNachId(t.db, p.id)?.sub).toBe("gesucht2");
    expect(personNachId(t.db, "unbekannte-id")).toBeNull();
  });
});

describe("aufgabe — Einzelabruf", () => {
  it("liefert die Zeile, null ohne Treffer", () => {
    const ersteller = legePerson("e1", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id });
    expect(aufgabe(t.db, a.id)?.id).toBe(a.id);
    expect(aufgabe(t.db, "unbekannt")).toBeNull();
  });
});

describe("aufgabenFuerPerson — zugewiesenAn === personId", () => {
  it("schliesst Aufgaben anderer Personen aus", () => {
    const ersteller = legePerson("e2", "auftrag");
    const alina = legePerson("alina2", "bufdi");
    const bendix = legePerson("bendix2", "bufdi");
    const alinaAufgabe = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: alina.id });
    legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bendix.id });
    const ergebnis = aufgabenFuerPerson(t.db, alina.id);
    expect(ergebnis.map((a) => a.id)).toEqual([alinaAufgabe.id]);
  });
});

describe("posteingang — status === 'eingegangen'", () => {
  it("schliesst andere Stati aus", () => {
    const ersteller = legePerson("e3", "auftrag");
    const offen = legeAufgabe({ erstellerId: ersteller.id, status: "eingegangen" });
    legeAufgabe({ erstellerId: ersteller.id, status: "verteilt" });
    expect(posteingang(t.db).map((a) => a.id)).toEqual([offen.id]);
  });
});

describe("freigabenFuer — filtert serverseitig auf darfFreigeben", () => {
  it("ein Dritter (weder Pruefer noch koordination) sieht die Warteschlange leer", () => {
    const ersteller = legePerson("fe1-ersteller", "auftrag");
    const pruefer = legePerson("fe1-pruefer", "auftrag");
    const bufdi = legePerson("fe1-bufdi", "bufdi");
    const dritter = legePerson("fe1-dritter", "auftrag");
    legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(freigabenFuer(t.db, dritter, HEUTE)).toEqual([]);
  });

  it("der eingetragene Pruefer sieht genau seine Aufgabe, keine fremde", () => {
    const ersteller = legePerson("fe2-ersteller", "auftrag");
    const pruefer = legePerson("fe2-pruefer", "auftrag");
    const bufdi = legePerson("fe2-bufdi", "bufdi");
    const andererPruefer = legePerson("fe2-anderer-pruefer", "auftrag");
    const meine = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: andererPruefer.id,
      status: "freigabe_offen",
    });
    expect(freigabenFuer(t.db, pruefer, HEUTE).map((a) => a.id)).toEqual([meine.id]);
  });

  it("koordination sieht ALLE offenen Freigaben, auch fremde", () => {
    const ersteller = legePerson("fe3-ersteller", "auftrag");
    const pruefer = legePerson("fe3-pruefer", "auftrag");
    const bufdi = legePerson("fe3-bufdi", "bufdi");
    const rike = legePerson("fe3-rike", "koordination");
    legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      prueferId: pruefer.id,
      status: "freigabe_offen",
    });
    expect(freigabenFuer(t.db, rike, HEUTE)).toHaveLength(1);
  });

  it("schliesst Aufgaben aus, die nicht freigabe_offen sind — auch fuer koordination", () => {
    const ersteller = legePerson("fe4-ersteller", "auftrag");
    const bufdi = legePerson("fe4-bufdi", "bufdi");
    const rike = legePerson("fe4-rike", "koordination");
    legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id, status: "in_arbeit" });
    expect(freigabenFuer(t.db, rike, HEUTE)).toEqual([]);
  });

  it("eine Selbstaufgabe im Status freigabe_offen kann es nicht geben — aber selbst dann liefert die Funktion nichts an eine ausgeschiedene koordination", () => {
    const bufdi = legePerson("fe5-bufdi", "bufdi");
    const rikeEx = legePerson("fe5-rike-ex", "koordination", { aktivBis: "2026-08-01" });
    legeAufgabe({
      erstellerId: bufdi.id,
      zugewiesenAn: bufdi.id,
      prueferId: null,
      istSelbst: true,
      status: "freigabe_offen",
    });
    expect(freigabenFuer(t.db, rikeEx, HEUTE)).toEqual([]);
  });
});

describe("freigabeDaten — die eine Ladefunktion fuer die Warteschlange (Aufgabe 15)", () => {
  it("trennt „meine“ von „in Vertretung“ und loest Ersteller-/Zugewiesenennamen auf", () => {
    const rike = legePerson("fd1-rike", "koordination");
    const malte = legePerson("fd1-malte", "auftrag", { name: "Malte" });
    const alina = legePerson("fd1-alina", "bufdi", { name: "Alina" });
    const meineAufgabe = legeAufgabe({
      titel: "Meine",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: rike.id,
      status: "freigabe_offen",
    });
    const vertretungsAufgabe = legeAufgabe({
      titel: "Vertretung",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "freigabe_offen",
    });

    const daten = freigabeDaten(t.db, rike, HEUTE);

    expect(daten.meine.map((z) => z.aufgabe.id)).toEqual([meineAufgabe.id]);
    expect(daten.vertretung.map((z) => z.aufgabe.id)).toEqual([vertretungsAufgabe.id]);
    expect(daten.meine[0]!.erstellerName).toBe("Malte");
    expect(daten.meine[0]!.zugewiesenName).toBe("Alina");
  });

  it("traegt nur Nachweise seit der letzten Zurueckweisung, ueber `nachweiseSeitLetzterZurueckweisung`", () => {
    const rike = legePerson("fd2-rike", "koordination");
    const malte = legePerson("fd2-malte", "auftrag");
    const alina = legePerson("fd2-alina", "bufdi");
    const a = legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: rike.id,
      status: "freigabe_offen",
    });
    // Feste, aufsteigende Zeitpunkte statt der Systemuhr: `nachweiseSeitLetzterZurueckweisung`
    // vergleicht `nachweise.erstelltAm` gegen den `ts` der letzten Zurueckweisung — beides muss
    // hier eindeutig auseinanderliegen, nicht auf demselben `new Date()`-Tick beruhen.
    t.db
      .insert(nachweise)
      .values({
        aufgabeId: a.id, art: "text", text: "Alt", erstelltVon: alina.id,
        erstelltAm: new Date(1000),
      })
      .run();
    t.db
      .insert(verlauf)
      .values({
        aufgabeId: a.id, ereignis: "zurueckgewiesen", akteurId: rike.id, ts: new Date(2000),
      })
      .run();
    t.db
      .insert(nachweise)
      .values({
        aufgabeId: a.id, art: "text", text: "Neu", erstelltVon: alina.id,
        erstelltAm: new Date(3000),
      })
      .run();

    const daten = freigabeDaten(t.db, rike, HEUTE);
    const texte = daten.meine[0]!.nachweise.map((n) => n.nachweis.text);
    expect(texte).toEqual(["Neu"]);
  });

  it("eine ausgeschiedene Person sieht keine Freigaben mehr (istAktiv gilt weiter)", () => {
    const rikeEx = legePerson("fd3-rike-ex", "koordination", { aktivBis: "2026-08-01" });
    const malte = legePerson("fd3-malte", "auftrag");
    const alina = legePerson("fd3-alina", "bufdi");
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "freigabe_offen",
    });
    const daten = freigabeDaten(t.db, rikeEx, HEUTE);
    expect(daten.meine).toEqual([]);
    expect(daten.vertretung).toEqual([]);
  });

  /*
   * ADVISOR-FUND: die einzige bis dahin vorhandene Selbstaufgaben-Gegenprobe auf dieser Ebene
   * (unten, "eine Selbstaufgabe ... kann es nicht geben") setzte eine AUSGESCHIEDENE Koordination
   * ein — `istAktiv` allein liefert dort schon `[]`, die Zeile bewiese also nichts ueber
   * `darfFreigeben`s ERSTE Klausel (`if (a.istSelbst) return false`). Diese Zeile nimmt eine AKTIVE
   * Koordination: nur so kann ein geloeschtes `istSelbst`-Gate ueberhaupt rot werden.
   */
  it("eine Selbstaufgabe erscheint in KEINER Freigabe-Warteschlange — auch nicht bei einer aktiven Koordination", () => {
    const rike = legePerson("fd4-rike", "koordination");
    const bufdi = legePerson("fd4-bufdi", "bufdi");
    // Fachlich unerreichbar (Spec §5.2: Selbstaufgaben nehmen die Kurzstrecke ohne
    // `freigabe_offen`), aber `darfFreigeben`s erste Klausel soll sich nicht auf diese Invariante
    // verlassen — dieselbe Verteidigungslinie wie `zugang.test.ts`s Kreuzprobe.
    legeAufgabe({
      erstellerId: bufdi.id,
      zugewiesenAn: bufdi.id,
      prueferId: null,
      istSelbst: true,
      status: "freigabe_offen",
    });
    const daten = freigabeDaten(t.db, rike, HEUTE);
    expect(daten.meine).toEqual([]);
    expect(daten.vertretung).toEqual([]);
  });
});

describe("aufgabenVonErsteller", () => {
  it("schliesst Aufgaben anderer Ersteller aus", () => {
    const e1 = legePerson("ave1", "auftrag");
    const e2 = legePerson("ave2", "auftrag");
    const meine = legeAufgabe({ erstellerId: e1.id });
    legeAufgabe({ erstellerId: e2.id });
    expect(aufgabenVonErsteller(t.db, e1.id).map((a) => a.id)).toEqual([meine.id]);
  });
});

describe("archiv — status === 'abgeschlossen'", () => {
  it("schliesst nicht abgeschlossene Aufgaben aus", () => {
    const ersteller = legePerson("arc1", "auftrag");
    const fertig = legeAufgabe({ erstellerId: ersteller.id, status: "abgeschlossen" });
    legeAufgabe({ erstellerId: ersteller.id, status: "in_arbeit" });
    expect(archiv(t.db).map((a) => a.id)).toEqual([fertig.id]);
  });
});

describe("routinenFuer", () => {
  it("schliesst Routinen anderer Personen aus", () => {
    const alina = legePerson("rou1-alina", "bufdi");
    const bendix = legePerson("rou1-bendix", "bufdi");
    const meine = t.db
      .insert(routinen)
      .values({ personId: alina.id, titel: "R", wochentage: 31, dauerMinuten: 30 })
      .returning()
      .get();
    t.db
      .insert(routinen)
      .values({ personId: bendix.id, titel: "R2", wochentage: 31, dauerMinuten: 30 })
      .run();
    expect(routinenFuer(t.db, alina.id).map((r) => r.id)).toEqual([meine.id]);
  });
});

describe("verlaufFuer — aufsteigend nach ts", () => {
  it("schliesst Verlauf anderer Aufgaben aus und sortiert die eigenen aufsteigend", () => {
    const ersteller = legePerson("vlf1", "auftrag");
    const a1 = legeAufgabe({ erstellerId: ersteller.id });
    const a2 = legeAufgabe({ erstellerId: ersteller.id });
    // EXPLIZITE, verschiedene `ts`-Werte statt dreier `schreibeVerlauf`-Aufrufe in derselben
    // Sekunde — `ts` speichert Unix-SEKUNDEN, zwei Aufrufe im selben Testlauf koennten sonst
    // denselben Wert tragen und die Aufsteigend-Aussage waere vom Timing abhaengig, nicht belegt.
    const frueher = t.db
      .insert(verlauf)
      .values({
        aufgabeId: a1.id,
        ereignis: "eingestellt",
        akteurId: ersteller.id,
        ts: new Date("2026-08-01T08:00:00Z"),
      })
      .returning()
      .get();
    const spaeter = t.db
      .insert(verlauf)
      .values({
        aufgabeId: a1.id,
        ereignis: "verteilt",
        akteurId: ersteller.id,
        ts: new Date("2026-08-02T08:00:00Z"),
      })
      .returning()
      .get();
    t.db
      .insert(verlauf)
      .values({ aufgabeId: a2.id, ereignis: "eingestellt", akteurId: ersteller.id })
      .run();
    const ergebnis = verlaufFuer(t.db, a1.id);
    expect(ergebnis.map((v) => v.id)).toEqual([frueher.id, spaeter.id]);
    expect(ergebnis.every((v) => v.aufgabeId === a1.id)).toBe(true);
  });

  /**
   * QUELLTEXTLICHER ZUSATZ (Fix-Runde 1, Important 2 — Gegenprobe empirisch widerlegt eine
   * Annahme des Reviews): der Review verlangte, die drei Verlaufszeilen in `a/[id]/page.test.tsx`
   * VERDREHT einzufuegen, damit ein entferntes `orderBy` den Journal-Test rot macht. Das wurde
   * umgesetzt (s. dort) — ABER eine gezielte Gegenprobe (temporaer `orderBy` entfernt, dieselbe
   * Fixtur, zusaetzlich `EXPLAIN QUERY PLAN` gegen die echte Datenbank gefahren) zeigt: SQLite
   * nutzt fuer diese Abfrage den Index `verlauf_aufgabe_idx` auf `(aufgabe_id, ts)`
   * (`SEARCH verlauf USING INDEX verlauf_aufgabe_idx (aufgabe_id=?)`), und ein Index-Scan liefert
   * die Zeilen eines `aufgabe_id`-Werts bereits in `ts`-Reihenfolge — VOELLIG UNABHAENGIG von der
   * Einfuegereihenfolge und OHNE explizites `ORDER BY`. Der DOM-Test in `a/[id]/page.test.tsx`
   * bleibt deshalb auch bei entferntem `orderBy` GRUEN — er kann diesen einen Mechanismus nicht rot
   * machen, so lange der Index existiert (an den Controller gemeldet, s. Bericht).
   *
   * DIESER TEST SCHLIESST GENAU DIESE LUECKE, quelltextlich statt verhaltensbasiert: er liest
   * `_db/queries.ts` und prueft, dass `verlaufFuer`s Funktionskoerper `orderBy(asc(verlauf.ts))`
   * woertlich enthaelt. Ein geloeschtes `orderBy` macht IHN rot, unabhaengig davon, ob SQLites
   * Index-Wahl das Symptom gerade verdeckt — dieselbe Technik wie andernorts im Modul (`nav.test.ts`
   * prueft z. B. die Abwesenheit von `"use client"` quelltextlich, nicht ueber Laufzeitverhalten).
   */
  it("`verlaufFuer` traegt `orderBy(asc(verlauf.ts))` im Quelltext — Gegenprobe fuer eine Faelle, die die Datenbank selbst kaschiert", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_db/queries.ts", "utf8");
    const start = quelle.indexOf("export function verlaufFuer");
    expect(start, "verlaufFuer nicht gefunden").toBeGreaterThan(-1);
    const naechsteFunktion = quelle.indexOf("\nexport function", start + 1);
    const koerper = quelle.slice(start, naechsteFunktion === -1 ? undefined : naechsteFunktion);
    expect(koerper).toContain("orderBy(asc(verlauf.ts))");
  });
});

describe("nachweiseFuer", () => {
  it("schliesst Nachweise anderer Aufgaben aus", () => {
    const ersteller = legePerson("nwf1", "auftrag");
    const bufdi = legePerson("nwf1-bufdi", "bufdi");
    const a1 = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    const a2 = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    const meiner = t.db
      .insert(nachweise)
      .values({ aufgabeId: a1.id, art: "text", text: "Erledigt.", erstelltVon: bufdi.id })
      .returning()
      .get();
    t.db
      .insert(nachweise)
      .values({ aufgabeId: a2.id, art: "text", text: "Anderer.", erstelltVon: bufdi.id })
      .run();
    expect(nachweiseFuer(t.db, a1.id).map((n) => n.id)).toEqual([meiner.id]);
  });
});

describe("nachweiseSeitLetzterZurueckweisung (Aufgabe 10, Review Fix-Runde 1, Befund #6)", () => {
  it("ohne Zurueckweisung in der Historie zaehlen alle Nachweise", () => {
    const ersteller = legePerson("nszw1", "auftrag");
    const bufdi = legePerson("nszw1-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    const n1 = t.db
      .insert(nachweise)
      .values({ aufgabeId: a.id, art: "text", text: "Erster.", erstelltVon: bufdi.id })
      .returning()
      .get();
    expect(nachweiseSeitLetzterZurueckweisung(t.db, a.id).map((n) => n.id)).toEqual([n1.id]);
  });

  it("ein Nachweis von VOR der letzten Zurueckweisung zaehlt nicht mehr", () => {
    const ersteller = legePerson("nszw2", "auftrag");
    const bufdi = legePerson("nszw2-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    t.db
      .insert(nachweise)
      .values({
        aufgabeId: a.id,
        art: "text",
        text: "Alt.",
        erstelltVon: bufdi.id,
        erstelltAm: new Date("2026-08-10T08:00:00Z"),
      })
      .run();
    t.db
      .insert(verlauf)
      .values({
        aufgabeId: a.id,
        ereignis: "zurueckgewiesen",
        akteurId: ersteller.id,
        ts: new Date("2026-08-11T08:00:00Z"),
      })
      .run();
    expect(nachweiseSeitLetzterZurueckweisung(t.db, a.id)).toEqual([]);
  });

  it("ein Nachweis von NACH der letzten Zurueckweisung zaehlt", () => {
    const ersteller = legePerson("nszw3", "auftrag");
    const bufdi = legePerson("nszw3-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    t.db
      .insert(verlauf)
      .values({
        aufgabeId: a.id,
        ereignis: "zurueckgewiesen",
        akteurId: ersteller.id,
        ts: new Date("2026-08-11T08:00:00Z"),
      })
      .run();
    const neu = t.db
      .insert(nachweise)
      .values({
        aufgabeId: a.id,
        art: "text",
        text: "Neu.",
        erstelltVon: bufdi.id,
        erstelltAm: new Date("2026-08-12T08:00:00Z"),
      })
      .returning()
      .get();
    expect(nachweiseSeitLetzterZurueckweisung(t.db, a.id).map((n) => n.id)).toEqual([neu.id]);
  });

  it("zaehlt ab der LETZTEN Zurueckweisung, nicht der ersten", () => {
    const ersteller = legePerson("nszw4", "auftrag");
    const bufdi = legePerson("nszw4-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    // Nachweis ZWISCHEN den beiden Zurueckweisungen — er zaehlt NICHT, weil es eine ZWEITE gab.
    t.db
      .insert(verlauf)
      .values({ aufgabeId: a.id, ereignis: "zurueckgewiesen", akteurId: ersteller.id, ts: new Date("2026-08-10T08:00:00Z") })
      .run();
    t.db
      .insert(nachweise)
      .values({ aufgabeId: a.id, art: "text", text: "Zwischendrin.", erstelltVon: bufdi.id, erstelltAm: new Date("2026-08-11T08:00:00Z") })
      .run();
    t.db
      .insert(verlauf)
      .values({ aufgabeId: a.id, ereignis: "zurueckgewiesen", akteurId: ersteller.id, ts: new Date("2026-08-12T08:00:00Z") })
      .run();
    expect(nachweiseSeitLetzterZurueckweisung(t.db, a.id)).toEqual([]);
  });
});

describe("planRangFuerEinplanen (Aufgabe 10, Review Fix-Runde 1, Minor #4)", () => {
  it("leerer Zieltag: 0", () => {
    const ersteller = legePerson("prfe1", "auftrag");
    const bufdi = legePerson("prfe1-bufdi", "bufdi");
    const task = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id, planRang: 7 });
    expect(planRangFuerEinplanen(t.db, task, "2026-08-17")).toBe(0);
  });

  it("belegter Zieltag: max(planRang) + 1", () => {
    const ersteller = legePerson("prfe2", "auftrag");
    const bufdi = legePerson("prfe2-bufdi", "bufdi");
    legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id, planDatum: "2026-08-17", planRang: 0 });
    legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id, planDatum: "2026-08-17", planRang: 2 });
    const neue = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    expect(planRangFuerEinplanen(t.db, neue, "2026-08-17")).toBe(3);
  });

  it("derselbe Zieltag wie bisher: der bisherige planRang bleibt stehen", () => {
    const ersteller = legePerson("prfe3", "auftrag");
    const bufdi = legePerson("prfe3-bufdi", "bufdi");
    const task = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id, planDatum: "2026-08-17", planRang: 4 });
    expect(planRangFuerEinplanen(t.db, task, "2026-08-17")).toBe(4);
  });

  it("zugewiesenAn === null: fruehe 0, laut Invariante unerreichbar, aber pruefbar", () => {
    const ersteller = legePerson("prfe4", "auftrag");
    const task = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: null });
    expect(planRangFuerEinplanen(t.db, task, "2026-08-17")).toBe(0);
  });
});

describe("erstelleNachweis (Aufgabe 10, Review Fix-Runde 1, Minor #4)", () => {
  it("schreibt einen Textnachweis, dateiId bleibt null", () => {
    const ersteller = legePerson("en1", "auftrag");
    const bufdi = legePerson("en1-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    const n = erstelleNachweis(t.db, { aufgabeId: a.id, art: "text", text: "Erledigt.", erstelltVon: bufdi.id });
    expect(n.art).toBe("text");
    expect(n.text).toBe("Erledigt.");
    expect(n.erstelltVon).toBe(bufdi.id);
    expect(n.dateiId).toBeNull();
  });

  it("schreibt einen Bildnachweis mit dateiId (Aufgabe 19)", () => {
    const ersteller = legePerson("en2", "auftrag");
    const bufdi = legePerson("en2-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    const datei = t.db
      .insert(dateien)
      .values({ aufgabeId: a.id, dateiname: "b.jpg", mime: "image/jpeg", groesse: 10 })
      .returning()
      .get();
    const n = erstelleNachweis(t.db, { aufgabeId: a.id, art: "bild", text: null, dateiId: datei.id, erstelltVon: bufdi.id });
    expect(n.art).toBe("bild");
    expect(n.text).toBeNull();
    expect(n.dateiId).toBe(datei.id);
  });
});

describe("erstelleDatei / dateiNachId / nachweisNachId (Aufgabe 19)", () => {
  it("erstelleDatei legt eine Zeile mit der gegebenen id an, dateiNachId findet sie wieder", () => {
    const ersteller = legePerson("ed1", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id });
    const zeile = erstelleDatei(t.db, { id: "ed1datei00000000000x", aufgabeId: a.id, dateiname: "b.jpg", mime: "image/jpeg", groesse: 42 });
    expect(zeile.id).toBe("ed1datei00000000000x");
    expect(zeile.scanStatus).toBe("offen");
    expect(dateiNachId(t.db, zeile.id)).toEqual(zeile);
  });

  it("dateiNachId liefert null fuer eine unbekannte id, statt zu werfen", () => {
    expect(dateiNachId(t.db, "unbekannt")).toBeNull();
  });

  it("nachweisNachId findet eine Zeile ueber ihre id, null bei unbekannter id", () => {
    const ersteller = legePerson("nn1", "auftrag");
    const bufdi = legePerson("nn1-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    const n = erstelleNachweis(t.db, { aufgabeId: a.id, art: "text", text: "T", erstelltVon: bufdi.id });
    expect(nachweisNachId(t.db, n.id)).toEqual(n);
    expect(nachweisNachId(t.db, "unbekannt")).toBeNull();
  });
});

/**
 * `mitDatei` — DIE EINE STELLE, DIE `istFreigegeben` FUER DIE ANZEIGE AUFRUFT (Aufgabe 19, „keine
 * zweite Fassung einer Bedingung"). `freigebenDaten` (Freigabe-Warteschlange) und `a/[id]/page.tsx`
 * teilen sich diese Funktion — hier direkt getestet, ueber alle vier Scan-Zustaende UND den
 * Text-Nachweis-Fall (kein `dateiId`).
 */
describe("mitDatei — freigegeben ist genau istFreigegeben(datei.scanStatus), nie zweimal berechnet", () => {
  it("ein Text-Nachweis (dateiId: null) hat datei: null und freigegeben: false", () => {
    const ersteller = legePerson("md1", "auftrag");
    const bufdi = legePerson("md1-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    const n = erstelleNachweis(t.db, { aufgabeId: a.id, art: "text", text: "T", erstelltVon: bufdi.id });
    const [ergebnis] = mitDatei(t.db, [n]);
    expect(ergebnis).toEqual({ nachweis: n, datei: null, freigegeben: false });
  });

  it.each(["offen", "befund", "fehler"] as const)("scanStatus '%s': freigegeben ist false", (status) => {
    const ersteller = legePerson(`md-${status}`, "auftrag");
    const bufdi = legePerson(`md-${status}-bufdi`, "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    const datei = t.db.insert(dateien).values({ aufgabeId: a.id, dateiname: "b.jpg", mime: "image/jpeg", groesse: 1, scanStatus: status }).returning().get();
    const n = erstelleNachweis(t.db, { aufgabeId: a.id, art: "bild", text: null, dateiId: datei.id, erstelltVon: bufdi.id });
    const [ergebnis] = mitDatei(t.db, [n]);
    expect(ergebnis!.freigegeben).toBe(false);
    expect(ergebnis!.datei).toEqual(datei);
  });

  it("scanStatus 'sauber': freigegeben ist true", () => {
    const ersteller = legePerson("md-sauber", "auftrag");
    const bufdi = legePerson("md-sauber-bufdi", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bufdi.id });
    const datei = t.db.insert(dateien).values({ aufgabeId: a.id, dateiname: "b.jpg", mime: "image/jpeg", groesse: 1, scanStatus: "sauber" }).returning().get();
    const n = erstelleNachweis(t.db, { aufgabeId: a.id, art: "bild", text: null, dateiId: datei.id, erstelltVon: bufdi.id });
    const [ergebnis] = mitDatei(t.db, [n]);
    expect(ergebnis!.freigegeben).toBe(true);
  });
});

describe("schreibeVerlauf — das eine Schreibprimitiv dieser Aufgabe", () => {
  it("schreibt eine Zeile mit Akteur, Ereignis und optionaler Notiz", () => {
    const ersteller = legePerson("sv1", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id });
    const zeile = schreibeVerlauf(t.db, {
      aufgabeId: a.id,
      ereignis: "eingestellt",
      akteurId: ersteller.id,
      notiz: "Testnotiz",
    });
    expect(zeile.aufgabeId).toBe(a.id);
    expect(zeile.ereignis).toBe("eingestellt");
    expect(zeile.akteurId).toBe(ersteller.id);
    expect(zeile.notiz).toBe("Testnotiz");
  });

  it("notiz ist optional und wird ohne Angabe null", () => {
    const ersteller = legePerson("sv2", "auftrag");
    const a = legeAufgabe({ erstellerId: ersteller.id });
    const zeile = schreibeVerlauf(t.db, {
      aufgabeId: a.id,
      ereignis: "eingestellt",
      akteurId: ersteller.id,
    });
    expect(zeile.notiz).toBeNull();
  });
});

describe("rangGrenzen (Aufgabe 13) — istErste/istLetzte aus derselben Skala wie planEintraegeFuerTag", () => {
  it("ein einzelner Eintrag an einem Tag ist zugleich erste und letzte Zeile", () => {
    const ersteller = legePerson("rg1", "auftrag");
    const bufdi = legePerson("rg1-bufdi", "bufdi");
    const a = legeAufgabe({
      erstellerId: ersteller.id,
      zugewiesenAn: bufdi.id,
      status: "verteilt",
      planDatum: "2026-08-17",
      planRang: 0,
    });
    expect(rangGrenzen(t.db, bufdi.id, ["2026-08-17"])).toEqual({
      [a.id]: { istErste: true, istLetzte: true, index: 0 },
    });
  });

  /*
   * REVIEW FIX-RUNDE 1, Minor #4: die drei Zeilen wurden vorher in EXAKT ihrer Rangreihenfolge
   * (0, 1, 2) eingefuegt — eine kaputte Sortierung in `rangGrenzen`/`planEintraegeFuerTag` (z. B.
   * nach Einfuegereihenfolge statt nach `planRang`) haette diesen Test unveraendert bestanden.
   * Jetzt in umgekehrter Rangreihenfolge eingefuegt (2, 0, 1), damit die Assertion tatsaechlich auf
   * `planRang` beruht, nicht auf der Einfuegereihenfolge.
   */
  it("mehrere Eintraege an einem Tag: nur die aeusseren Raender tragen istErste/istLetzte", () => {
    const ersteller = legePerson("rg2", "auftrag");
    const bufdi = legePerson("rg2-bufdi", "bufdi");
    const letzte = legeAufgabe({
      erstellerId: ersteller.id, zugewiesenAn: bufdi.id, status: "verteilt",
      planDatum: "2026-08-17", planRang: 2,
    });
    const erste = legeAufgabe({
      erstellerId: ersteller.id, zugewiesenAn: bufdi.id, status: "verteilt",
      planDatum: "2026-08-17", planRang: 0,
    });
    const mitte = legeAufgabe({
      erstellerId: ersteller.id, zugewiesenAn: bufdi.id, status: "verteilt",
      planDatum: "2026-08-17", planRang: 1,
    });
    const ergebnis = rangGrenzen(t.db, bufdi.id, ["2026-08-17"]);
    expect(ergebnis[erste.id]).toEqual({ istErste: true, istLetzte: false, index: 0 });
    expect(ergebnis[mitte.id]).toEqual({ istErste: false, istLetzte: false, index: 1 });
    expect(ergebnis[letzte.id]).toEqual({ istErste: false, istLetzte: true, index: 2 });
  });

  it("deckt mehrere Tage der Woche ab, jeder Tag mit seiner eigenen Skala", () => {
    const ersteller = legePerson("rg3", "auftrag");
    const bufdi = legePerson("rg3-bufdi", "bufdi");
    const montag = legeAufgabe({
      erstellerId: ersteller.id, zugewiesenAn: bufdi.id, status: "verteilt",
      planDatum: "2026-08-17", planRang: 0,
    });
    const dienstag = legeAufgabe({
      erstellerId: ersteller.id, zugewiesenAn: bufdi.id, status: "verteilt",
      planDatum: "2026-08-18", planRang: 0,
    });
    const ergebnis = rangGrenzen(t.db, bufdi.id, ["2026-08-17", "2026-08-18"]);
    expect(ergebnis[montag.id]).toEqual({ istErste: true, istLetzte: true, index: 0 });
    expect(ergebnis[dienstag.id]).toEqual({ istErste: true, istLetzte: true, index: 0 });
  });

  it("eine noch nicht eingeplante Aufgabe (planDatum null) taucht in keinem Tag auf", () => {
    const ersteller = legePerson("rg4", "auftrag");
    const bufdi = legePerson("rg4-bufdi", "bufdi");
    const nichtGeplant = legeAufgabe({
      erstellerId: ersteller.id, zugewiesenAn: bufdi.id, status: "verteilt", planDatum: null,
    });
    const ergebnis = rangGrenzen(t.db, bufdi.id, ["2026-08-17"]);
    expect(ergebnis[nichtGeplant.id]).toBeUndefined();
  });

  it("eine leere Tagesliste ergibt ein leeres Ergebnis, kein Wurf", () => {
    const bufdi = legePerson("rg5-bufdi", "bufdi");
    expect(rangGrenzen(t.db, bufdi.id, [])).toEqual({});
  });
});

/*
 * AB HIER AUFGABE 14 — DIE POSTEINGANG-TABELLE, DIE PERSONENVERWALTUNG.
 */

describe("alleAufgaben — ungefiltert, fuer den systemweiten Ueberblick der Koordination", () => {
  it("liefert Aufgaben JEDER Person, nicht nur einer einzelnen", () => {
    const ersteller = legePerson("aa1", "auftrag");
    const alina = legePerson("aa1-alina", "bufdi");
    const bendix = legePerson("aa1-bendix", "bufdi");
    const a = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: alina.id });
    const b = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: bendix.id });
    expect(alleAufgaben(t.db).map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("wochenAuslastungFuerBufdis — dieselbe Rechnung wie tagesBudget, aufsummiert", () => {
  it("summiert ueber alle uebergebenen Tage, je BuFDi getrennt", () => {
    const ersteller = legePerson("wa1", "auftrag");
    const alina = legePerson("wa1-alina", "bufdi", { sollMinutenTag: 400 });
    const bendix = legePerson("wa1-bendix", "bufdi", { sollMinutenTag: 400 });
    legeAufgabe({
      erstellerId: ersteller.id, zugewiesenAn: alina.id, status: "verteilt",
      planDatum: "2026-08-17", dauerMinuten: 120,
    });
    legeAufgabe({
      erstellerId: ersteller.id, zugewiesenAn: alina.id, status: "verteilt",
      planDatum: "2026-08-18", dauerMinuten: 90,
    });
    // Bendix bleibt an beiden Tagen leer — die Rechnung darf ihn trotzdem mit 0 fuehren, nicht
    // auslassen.
    const ergebnis = wochenAuslastungFuerBufdis(
      t.db,
      [alina, bendix],
      ["2026-08-17", "2026-08-18"],
    );
    const alinaZeile = ergebnis.find((z) => z.person.id === alina.id)!;
    const bendixZeile = ergebnis.find((z) => z.person.id === bendix.id)!;
    expect(alinaZeile.verplantMinuten).toBe(210);
    expect(alinaZeile.sollMinuten).toBe(800);
    expect(alinaZeile.ueberbucht).toBe(false);
    expect(bendixZeile.verplantMinuten).toBe(0);
    expect(bendixZeile.sollMinuten).toBe(800);
  });

  it("meldet ueberbucht, wenn die Summe echt ueber dem Soll liegt", () => {
    const ersteller = legePerson("wa2", "auftrag");
    const bendix = legePerson("wa2-bendix", "bufdi", { sollMinutenTag: 100 });
    legeAufgabe({
      erstellerId: ersteller.id, zugewiesenAn: bendix.id, status: "verteilt",
      planDatum: "2026-08-17", dauerMinuten: 150,
    });
    const ergebnis = wochenAuslastungFuerBufdis(t.db, [bendix], ["2026-08-17"]);
    expect(ergebnis[0]!.ueberbucht).toBe(true);
  });
});

/**
 * DIE EINE LADEFUNKTION FUER DEN POSTEINGANG (Aufgabe 14, Fix-Runde 1, Important 1+2) —
 * `EinstiegKoordination.tsx` UND `verteilen/page.tsx` rufen ausschliesslich SIE, keine eigene
 * Fassung mehr. Diese Gegenprobe bindet die Zielliste an DER QUELLE, statt sich auf die beiden
 * Aufrufer zu verlassen: sie WUERDE ROT, ersetzte `verteilDaten` `bufdis()` durch `aktivePersonen()`
 * — die Fixtur traegt bewusst eine `koordination`- UND eine `auftrag`-Person zusaetzlich zu den
 * BuFDis (derselbe Aufbau wie die bisherige `verteilen/page.test.tsx`-Gegenprobe), damit ein
 * schwaecherer Filter (`rolle !== "koordination"`) ebenfalls auffiele.
 */
describe("verteilDaten — die Zielliste kommt aus bufdis(), nicht aus aktivePersonen()", () => {
  it("liefert genau die aktiven BuFDis als Zielliste — nicht koordination, nicht auftrag", () => {
    legePerson("vd1-rike", "koordination");
    const malte = legePerson("vd1-malte", "auftrag");
    const alina = legePerson("vd1-alina", "bufdi");
    const bendix = legePerson("vd1-bendix", "bufdi");
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });

    const daten = verteilDaten(t.db, HEUTE);
    expect(daten.bufdis.map((p) => p.id).sort()).toEqual([alina.id, bendix.id].sort());
  });

  it("bindet Posteingang, Auftraggeber-Namen und Auslastung im selben Aufruf", () => {
    const malte = legePerson("vd2-malte", "auftrag", { name: "Malte" });
    const alina = legePerson("vd2-alina", "bufdi", { name: "Alina" });
    const aufgabe1 = legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });

    const daten = verteilDaten(t.db, HEUTE);
    expect(daten.posteingang.map((a) => a.id)).toEqual([aufgabe1.id]);
    expect(daten.erstellerNamen[malte.id]).toBe("Malte");
    expect(daten.auslastung.map((z) => z.person.id)).toEqual([alina.id]);
    expect(daten.tage).toHaveLength(5);
  });
});

describe("erstellePerson / aktualisierePerson", () => {
  it("legt eine Person mit den uebergebenen Werten an", () => {
    const p = erstellePerson(t.db, {
      sub: "neu@localtest.me",
      name: "Neu",
      initialen: "NE",
      rolle: "bufdi",
      sollMinutenTag: 300,
      aktivVon: "2026-08-14",
      aktivBis: null,
    });
    expect(personNachId(t.db, p.id)).toMatchObject({
      sub: "neu@localtest.me", name: "Neu", rolle: "bufdi", sollMinutenTag: 300,
    });
  });

  it("aendert eine bestehende Person, ohne `sub` anzufassen", () => {
    const p = legePerson("aend-sub@localtest.me", "bufdi", { name: "Alt" });
    const aktualisiert = aktualisierePerson(t.db, p.id, { name: "Neu", sollMinutenTag: 500 });
    expect(aktualisiert.name).toBe("Neu");
    expect(aktualisiert.sollMinutenTag).toBe(500);
    expect(aktualisiert.sub).toBe("aend-sub@localtest.me");
  });

  it("Beenden setzt nur `aktivBis`, aendert sonst nichts", () => {
    const p = legePerson("beenden@localtest.me", "bufdi", { aktivBis: null });
    const beendet = aktualisierePerson(t.db, p.id, { aktivBis: "2026-08-14" });
    expect(beendet.aktivBis).toBe("2026-08-14");
    expect(beendet.name).toBe(p.name);
  });
});
