import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestDb } from "./testdb";
import { migrierteTestDb } from "./testdb";
import {
  personen,
  aufgaben,
  routinen,
  nachweise,
  verlauf,
  type PersonRow,
  type Rolle,
} from "./schema";
import {
  allePersonen,
  aktivePersonen,
  bufdis,
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
  schreibeVerlauf,
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
    const n = erstelleNachweis(t.db, { aufgabeId: a.id, text: "Erledigt.", erstelltVon: bufdi.id });
    expect(n.art).toBe("text");
    expect(n.text).toBe("Erledigt.");
    expect(n.erstelltVon).toBe(bufdi.id);
    expect(n.dateiId).toBeNull();
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
      [a.id]: { istErste: true, istLetzte: true },
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
    expect(ergebnis[erste.id]).toEqual({ istErste: true, istLetzte: false });
    expect(ergebnis[mitte.id]).toEqual({ istErste: false, istLetzte: false });
    expect(ergebnis[letzte.id]).toEqual({ istErste: false, istLetzte: true });
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
    expect(ergebnis[montag.id]).toEqual({ istErste: true, istLetzte: true });
    expect(ergebnis[dienstag.id]).toEqual({ istErste: true, istLetzte: true });
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
