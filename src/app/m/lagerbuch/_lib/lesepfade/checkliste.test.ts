import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import {
  artikel, fahrzeugTemplates, geraete, lagerorte, lagerortVerfall,
  o2Flaschen, o2Messungen, sollPositionen, newId,
} from "../../_db/schema";
import {
  checklisteFuerFahrzeug, checklistenDaten, nachFaechern, standDatum,
} from "./checkliste";
import { HANDLAGER_ID } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-checkliste-");

  t.db.insert(fahrzeugTemplates).values(
    { id: "tpl", name: "RTW-Vorlage", aktiv: true, createdAt: NOW }).run();

  // Einfuegereihenfolge GEGEN die erwartete Sortierung (aktiv zuerst, dann
  // alphabetisch) — sonst faellt eine fehlende Sortierung nicht auf.
  //
  // ⚠️ KEIN `HANDLAGER_ID` HIER: die Zeile legt die Migration `0003_handlager`
  // an. Ein zweiter Einschub scheitert an `UNIQUE lagerorte.id` — und weil er
  // in `beforeEach` steht, faellt dann die GANZE Datei aus, nicht ein Test.
  t.db.insert(lagerorte).values([
    { id: "fz-still", name: "AAA Ersatzwagen", typ: "fahrzeug",
      kennung: "MS-9", aktiv: false },
    { id: "fz-b", name: "NEF 1", typ: "fahrzeug", kennung: "MS-2", aktiv: true },
    { id: "fz-a", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1",
      aktiv: true, templateId: "tpl" },
  ]).run();

  t.db.insert(artikel).values([
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "B-04",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a2", name: "NaCl", einheit: "Fl.", fach: "C-01",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();

  // sp-grab ist ein GRABSTEIN, sp-2b liegt im selben Fach wie sp-2a (damit der
  // `sort`-Tiebreaker greift), und die Reihenfolge der Werte steht gegen die
  // erwartete Ausgabe.
  t.db.insert(sollPositionen).values([
    { id: "sp-grab", fahrzeugId: "fz-a", fachLabel: "Fach 3", sort: 0,
      artikelId: "a2", soll: 9, templatePositionId: null,
      ueberschrieben: false, entfernt: true },
    { id: "sp-2b", fahrzeugId: "fz-a", fachLabel: "Fach 2", sort: 1,
      artikelId: "a2", soll: 3, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    { id: "sp-2a", fahrzeugId: "fz-a", fachLabel: "Fach 2", sort: 0,
      artikelId: "a1", soll: 2, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    { id: "sp-1", fahrzeugId: "fz-a", fachLabel: "Fach 1", sort: 0,
      artikelId: "a1", soll: 4, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
  ]).run();

  // Ein gemeldeter Verfall im WARNBEREICH (Juli 2026 gegen den 15.06.2026) und
  // einer weit in der Zukunft — beide am selben Fahrzeug, damit die
  // Auffaelligkeit nicht durch „alle gleich" gruen wird.
  t.db.insert(lagerortVerfall).values([
    { id: newId(), lagerortId: "fz-a", artikelId: "a1", verfall: "2026-07",
      erfasstAt: NOW, quelleTyp: "oidc", quelleId: "test" },
    { id: newId(), lagerortId: "fz-a", artikelId: "a2", verfall: "2030-01",
      erfasstAt: NOW, quelleTyp: "oidc", quelleId: "test" },
  ]).run();

  t.db.insert(geraete).values([
    { id: "g-inaktiv", typ: "objekt", name: "Altes Spineboard", barcode: null,
      lagerortId: "fz-a", aktiv: false, createdAt: NOW },
    { id: "g-med", typ: "medizin", name: "Defibrillator", barcode: null,
      lagerortId: "fz-a", mtkFaellig: "2026-07-01", aktiv: true, createdAt: NOW },
    { id: "g-obj", typ: "objekt", name: "Spineboard", barcode: null,
      lagerortId: "fz-a", aktiv: true, createdAt: NOW },
  ]).run();

  t.db.insert(o2Flaschen).values([
    { id: "o2-gemessen", name: "Flasche A", lagerortId: "fz-a",
      nennfuelldruckBar: 200, aktiv: true, createdAt: NOW },
    { id: "o2-nie", name: "Flasche B", lagerortId: "fz-a",
      nennfuelldruckBar: 300, aktiv: true, createdAt: NOW },
  ]).run();
  t.db.insert(o2Messungen).values(
    { id: newId(), flascheId: "o2-gemessen", ts: NOW, druckBar: 180,
      quelleTyp: "oidc", quelleId: "test" }).run();
});

afterEach(() => t.schliessen());

describe("nachFaechern — Gruppierung ohne Umsortierung", () => {
  const pos = (fachLabel: string, artikelName: string) => ({
    fachLabel, artikelId: artikelName, artikelName, einheit: "Stk.",
    handlagerFach: "A", soll: 1, verfallText: null, verfallAuffaellig: false,
  });

  it("behaelt die Reihenfolge der Eingabe — Faecher UND Positionen", () => {
    // Absichtlich NICHT alphabetisch: „Z" vor „A". Eine Map bewahrt die
    // Einfuegereihenfolge; wer hier `sort()` ergaenzt, faellt hier durch.
    const faecher = nachFaechern([
      pos("Z-Fach", "zuerst"),
      pos("A-Fach", "danach"),
      pos("Z-Fach", "zurueck ins erste Fach"),
    ]);
    expect(faecher.map((f) => f.label)).toEqual(["Z-Fach", "A-Fach"]);
    expect(faecher[0]!.positionen.map((p) => p.artikelName))
      .toEqual(["zuerst", "zurueck ins erste Fach"]);
  });

  it("traegt `fachLabel` nicht in die Position hinein", () => {
    // Das Label steht am Fach und darf nicht zusaetzlich an jeder Zeile
    // haengen — sonst gibt es zwei Wahrheiten fuer dieselbe Angabe.
    const [fach] = nachFaechern([pos("Fach 1", "x")]);
    expect(fach!.positionen[0]).not.toHaveProperty("fachLabel");
  });

  it("gibt fuer eine leere Eingabe eine leere Liste", () => {
    expect(nachFaechern([])).toEqual([]);
  });
});

describe("checklisteFuerFahrzeug", () => {
  it("gruppiert nach Fach in der Reihenfolge von `sollFuerFahrzeug`", () => {
    const blatt = checklisteFuerFahrzeug(t.db, "fz-a", NOW)!;
    expect(blatt.faecher.map((f) => f.label)).toEqual(["Fach 1", "Fach 2"]);
    expect(blatt.faecher[1]!.positionen.map((p) => p.artikelName))
      .toEqual(["Verband", "NaCl"]);
  });

  it("laesst GRABSTEINE weg — sie sind kein Soll", () => {
    const blatt = checklisteFuerFahrzeug(t.db, "fz-a", NOW)!;
    // „Fach 3" existiert nur als Grabstein. Stuende es auf dem Blatt, liefe
    // jemand los, um etwas zu suchen, das auf diesem Fahrzeug bewusst nicht
    // vorhanden ist.
    expect(blatt.faecher.map((f) => f.label)).not.toContain("Fach 3");
    expect(blatt.positionen).toBe(3);
  });

  it("zaehlt `positionen` ueber alle Faecher, nicht je Fach", () => {
    const blatt = checklisteFuerFahrzeug(t.db, "fz-a", NOW)!;
    const summe = blatt.faecher.reduce((s, f) => s + f.positionen.length, 0);
    expect(blatt.positionen).toBe(summe);
  });

  it("nimmt Soll, Einheit und HANDLAGER-Fach mit", () => {
    const blatt = checklisteFuerFahrzeug(t.db, "fz-a", NOW)!;
    const zeile = blatt.faecher[0]!.positionen[0]!;
    expect(zeile).toMatchObject({
      artikelName: "Verband", soll: 4, einheit: "Stk.", handlagerFach: "B-04",
    });
  });

  it("zeichnet einen auffaelligen Verfall aus und einen fernen nicht", () => {
    const blatt = checklisteFuerFahrzeug(t.db, "fz-a", NOW)!;
    const fach2 = blatt.faecher[1]!.positionen;
    const verband = fach2.find((p) => p.artikelName === "Verband")!;
    const nacl = fach2.find((p) => p.artikelName === "NaCl")!;
    expect(verband.verfallAuffaellig).toBe(true);
    expect(verband.verfallText).toBeTruthy();
    expect(nacl.verfallAuffaellig).toBe(false);
    expect(nacl.verfallText).toBeTruthy();
  });

  it("laesst `verfallText` null, wo nichts gemeldet ist", () => {
    // fz-b hat keine Verfallsmeldung — und keine Soll-Position; der Fall wird
    // deshalb ueber ein Fahrzeug mit Soll, aber ohne Meldung geprueft.
    t.db.insert(sollPositionen).values(
      { id: "sp-b", fahrzeugId: "fz-b", fachLabel: "Fach 1", sort: 0,
        artikelId: "a1", soll: 1, templatePositionId: null,
        ueberschrieben: false, entfernt: false }).run();
    const blatt = checklisteFuerFahrzeug(t.db, "fz-b", NOW)!;
    expect(blatt.faecher[0]!.positionen[0]).toMatchObject({
      verfallText: null, verfallAuffaellig: false,
    });
  });

  it("nimmt nur AKTIVE Geraete und traegt ihre Frist mit", () => {
    const blatt = checklisteFuerFahrzeug(t.db, "fz-a", NOW)!;
    expect(blatt.geraete.map((g) => g.name)).toEqual(["Defibrillator", "Spineboard"]);
    const defi = blatt.geraete[0]!;
    expect(defi.fristText).toContain("MTK");
    expect(defi.fristAuffaellig).toBe(true);
  });

  it("gibt einem Objekt ohne Ablaufdatum KEINE Frist — und keinen Befund", () => {
    // §5.10: ein grauer Chip an jedem Spineboard waere Grundrauschen. Auf dem
    // Blatt ist das dieselbe Entscheidung: keine Zeile Text ohne Aussage.
    const blatt = checklisteFuerFahrzeug(t.db, "fz-a", NOW)!;
    const spineboard = blatt.geraete.find((g) => g.name === "Spineboard")!;
    expect(spineboard.fristText).toBeNull();
    expect(spineboard.fristAuffaellig).toBe(false);
  });

  it("reicht `letzterDruck` unveraendert durch — `null` bleibt `null`", () => {
    // ⚠️ DER FEHLALARM AUS §5.12. Ein `?? 0` machte aus „nie gemessen" eine
    // leere Flasche; auf einem gedruckten Blatt schickt das jemanden los, um
    // eine VOLLE Flasche zu tauschen.
    const blatt = checklisteFuerFahrzeug(t.db, "fz-a", NOW)!;
    expect(blatt.flaschen).toEqual([
      { id: "o2-gemessen", name: "Flasche A", nennfuelldruckBar: 200, letzterDruck: 180 },
      { id: "o2-nie", name: "Flasche B", nennfuelldruckBar: 300, letzterDruck: null },
    ]);
  });

  it("nennt die verknuepfte Vorlage, und `null` ohne", () => {
    expect(checklisteFuerFahrzeug(t.db, "fz-a", NOW)!.vorlage).toBe("RTW-Vorlage");
    expect(checklisteFuerFahrzeug(t.db, "fz-b", NOW)!.vorlage).toBeNull();
  });

  it("gibt `null` fuer eine unbekannte ID", () => {
    expect(checklisteFuerFahrzeug(t.db, "gibtsnicht", NOW)).toBeNull();
  });

  it("gibt `null` fuer das HANDLAGER — eine Lager-ID ist kein Fahrzeug", () => {
    // Dieselbe zweite Linie, die `fahrzeugInhalt` mit `notFound()` zieht.
    expect(checklisteFuerFahrzeug(t.db, HANDLAGER_ID, NOW)).toBeNull();
  });
});

describe("checklistenDaten", () => {
  it("ohne Auswahl: alle AKTIVEN Fahrzeuge, alphabetisch", () => {
    const blaetter = checklistenDaten(t.db, null, NOW);
    expect(blaetter.map((b) => b.name)).toEqual(["NEF 1", "RTW 1"]);
  });

  it("mit Auswahl: genau diese — auch ein stillgelegtes Fahrzeug", () => {
    // Wer vom Fahrzeugblatt kommt, hat das Fahrzeug vor sich und meint es.
    const blaetter = checklistenDaten(t.db, ["fz-still"], NOW);
    expect(blaetter.map((b) => b.id)).toEqual(["fz-still"]);
  });

  it("laesst unbekannte IDs still fallen, ohne die uebrigen mitzunehmen", () => {
    const blaetter = checklistenDaten(t.db, ["gibtsnicht", "fz-a"], NOW);
    expect(blaetter.map((b) => b.id)).toEqual(["fz-a"]);
  });

  it("nimmt das Handlager auch dann nicht mit, wenn seine ID ausdruecklich dasteht", () => {
    expect(checklistenDaten(t.db, [HANDLAGER_ID], NOW)).toEqual([]);
  });

  it("sortiert aktive vor stillgelegte", () => {
    // „AAA Ersatzwagen" steht alphabetisch VOR beiden aktiven und ist inaktiv —
    // ohne den `aktiv`-Vorrang stuende es zuerst.
    const blaetter = checklistenDaten(t.db, ["fz-still", "fz-a", "fz-b"], NOW);
    expect(blaetter.map((b) => b.name)).toEqual(["NEF 1", "RTW 1", "AAA Ersatzwagen"]);
  });
});

describe("standDatum", () => {
  it("schreibt TT.MM.JJJJ", () => {
    expect(standDatum(new Date("2026-06-15T10:00:00Z"))).toBe("15.06.2026");
  });

  it("rechnet in Europe/Berlin, nicht in UTC", () => {
    // 23:30 UTC am 14.06. ist in Berlin (MESZ, UTC+2) bereits der 15.06. Ein
    // Blatt, das in der Nacht gedruckt wird, traegt sonst das Datum von
    // gestern — und ein Stand-Vermerk, dem man nicht trauen kann, ist
    // schlimmer als keiner.
    expect(standDatum(new Date("2026-06-14T23:30:00Z"))).toBe("15.06.2026");
  });
});
