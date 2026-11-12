import { describe, expect, it } from "vitest";
import { NichtGefunden, setzeAktiv, speichereFahrzeug } from "../daten";
import { fahrzeugEingabe } from "../eingabe";
import { testDb, type TestDb } from "../testDb";
import {
  entfernePruefung, entferneReifensatz, erledigePruefung, KeinKilometerstand, KeinReifensatz, KilometerFehlt, KilometerRueckwaerts, ladeAkte,
  ladeAkten, PruefartSchonVorhanden, PruefungNichtGefunden, ReifenartSchonVorhanden, ReifensatzNichtGefunden, speicherePruefung,
  speichereReifensatz, speichereTechnik, TagInZukunft, trageKilometerEin, wechsleReifen,
} from "./daten";
import type { ErledigtEingabe, PruefungEingabe, TechnikEingabe } from "./typen";

const HEUTE = "2026-11-12";

function fahrzeug(db: TestDb, abweichung: Record<string, unknown> = {}) {
  return speichereFahrzeug(db, null, fahrzeugEingabe.parse({
    art: "fahrzeug", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "", kennzeichen: "", standort: "Uelzen", bemerkung: "", aktiv: true, ...abweichung,
  }));
}
const anhaenger = (db: TestDb) => fahrzeug(db, { art: "anhaenger", typ: "Anhänger", funkrufname: "Anhänger Betreuung" });

const technik: TechnikEingabe = {
  modell: "VW T6.1 Kombi", baujahr: 2020, laengeCm: 530, breiteCm: 190, hoeheCm: 199, zggKg: 3200, leerKg: 2510,
  staerke: [1, 1, 2], sitze: 5, tragen: 0, fuehrerschein: "B", besonderheiten: ["Sondersignal", "Tempo 100"],
};
const pruef = (abweichung: Partial<PruefungEingabe> = {}): PruefungEingabe =>
  ({ art: "Weitere", name: "Feuerlöscher", monate: 24, kmAbstand: null, zuletzt: null, vonHand: null, ...abweichung });
const erledigt = (abweichung: Partial<ErledigtEingabe> = {}): ErledigtEingabe =>
  ({ am: "2026-11-10", km: null, vonHand: null, bemerkung: "", ...abweichung });
const akte = (db: TestDb, id: string) => ladeAkte(db, id)!;

describe("Lesen", () => {
  it("ein Fahrzeug ohne Aktenzeile hat eine leere Akte", () => {
    const db = testDb();
    const f = fahrzeug(db);
    expect(ladeAkte(db, f.id)).toEqual({
      fahrzeug: f,
      technik: { modell: null, baujahr: null, laengeCm: null, breiteCm: null, hoeheCm: null, zggKg: null, leerKg: null, staerke: null, sitze: null, tragen: null, fuehrerschein: null, besonderheiten: [] },
      km: null, kmAm: null, aufgezogen: null, reifensaetze: [], pruefungen: [],
    });
    expect(db.$client.prepare("SELECT count(*) n FROM fahrzeugakte").get()).toEqual({ n: 0 });
  });

  it("ein unbekanntes Fahrzeug hat keine Akte", () => {
    expect(ladeAkte(testDb(), "gibt-es-nicht")).toBeNull();
  });

  it("ladeAkten: Reihenfolge wie die Fahrzeugliste, ohne Inaktive — außer auf Wunsch", () => {
    const db = testDb();
    const b = fahrzeug(db, { funkkenner: "11-83-10" });
    const a = fahrzeug(db, { funkkenner: "11-83-2" });
    const aus = fahrzeug(db, { funkkenner: "11-83-1" });
    setzeAktiv(db, aus.id, false);
    expect(ladeAkten(db).map((x) => x.fahrzeug.id)).toEqual([a.id, b.id]);
    expect(ladeAkten(db, { mitInaktiven: true }).map((x) => x.fahrzeug.id)).toEqual([aus.id, a.id, b.id]);
    expect(ladeAkte(db, aus.id)?.fahrzeug.aktiv).toBe(false);
  });

  it("Prüfungen kommen als HU, UVV, Service, dann Weitere nach Namen — je Fahrzeug getrennt", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const g = fahrzeug(db, { funkrufname: "Zweites" });
    for (const [art, name] of [["Weitere", "Ladebordwand"], ["Service", "Inspektion"], ["Weitere", "Feuerlöscher"], ["HU", "HU (TÜV)"], ["UVV", "UVV-Prüfung"]] as const) {
      speicherePruefung(db, f.id, null, pruef({ art, name }), HEUTE);
    }
    speicherePruefung(db, g.id, null, pruef({ art: "HU", name: "HU" }), HEUTE);
    expect(akte(db, f.id).pruefungen.map((p) => p.name)).toEqual(["HU (TÜV)", "UVV-Prüfung", "Inspektion", "Feuerlöscher", "Ladebordwand"]);
    expect(ladeAkten(db).map((x) => x.pruefungen.length)).toEqual([5, 1]);
  });
});

describe("Technik", () => {
  it("speichert und liest alle Felder; ein zweites Speichern ersetzt", () => {
    const db = testDb();
    const f = fahrzeug(db);
    speichereTechnik(db, f.id, technik);
    expect(akte(db, f.id).technik).toEqual(technik);
    speichereTechnik(db, f.id, { ...technik, staerke: null, besonderheiten: [], modell: null });
    expect(akte(db, f.id).technik).toEqual({ ...technik, staerke: null, besonderheiten: [], modell: null });
  });

  it("lässt Kilometerstand und Reifen stehen", () => {
    const db = testDb();
    const f = fahrzeug(db);
    trageKilometerEin(db, f.id, { km: 1000 }, HEUTE);
    speichereReifensatz(db, f.id, null, { art: "Winter", dot: "3822", lager: "" });
    speichereTechnik(db, f.id, technik);
    expect(akte(db, f.id)).toMatchObject({ km: 1000, kmAm: HEUTE, aufgezogen: "Winter" });
  });

  it("ein unbekanntes Fahrzeug ist nicht gefunden, und es entsteht keine Zeile", () => {
    const db = testDb();
    expect(() => speichereTechnik(db, "gibt-es-nicht", technik)).toThrow(NichtGefunden);
    expect(db.$client.prepare("SELECT count(*) n FROM fahrzeugakte").get()).toEqual({ n: 0 });
  });
});

describe("Kilometer eintragen", () => {
  it("ohne Ablesetag gilt heute; gleich oder höher geht, niedriger nicht", () => {
    const db = testDb();
    const f = fahrzeug(db);
    trageKilometerEin(db, f.id, { km: 84210 }, HEUTE);
    expect(akte(db, f.id)).toMatchObject({ km: 84210, kmAm: HEUTE });
    trageKilometerEin(db, f.id, { km: 84210, am: "2026-11-11" }, HEUTE);
    expect(akte(db, f.id)).toMatchObject({ km: 84210, kmAm: "2026-11-11" });
    expect(() => trageKilometerEin(db, f.id, { km: 84209 }, HEUTE)).toThrow(KilometerRueckwaerts);
    expect(() => trageKilometerEin(db, f.id, { km: 84209 }, HEUTE)).toThrow("Der Kilometerstand liegt unter dem bisherigen (84.210 km).");
    expect(akte(db, f.id).km).toBe(84210);
  });

  it("der Ablesetag liegt nie in der Zukunft", () => {
    const db = testDb();
    const f = fahrzeug(db);
    expect(() => trageKilometerEin(db, f.id, { km: 10, am: "2026-11-13" }, HEUTE)).toThrow(TagInZukunft);
    expect(akte(db, f.id).km).toBeNull();
  });

  it("ein Anhänger führt keinen Kilometerstand", () => {
    const db = testDb();
    expect(() => trageKilometerEin(db, anhaenger(db).id, { km: 10 }, HEUTE)).toThrow(KeinKilometerstand);
  });
});

describe("Prüfung anlegen und ändern", () => {
  it("mit Kilometerabstand und letztem Termin wird zuletztKm der Stand der Akte", () => {
    const db = testDb();
    const f = fahrzeug(db);
    trageKilometerEin(db, f.id, { km: 84210 }, HEUTE);
    expect(speicherePruefung(db, f.id, null, pruef({ art: "Service", name: "Inspektion", kmAbstand: 30000, zuletzt: "2026-05-01" }), HEUTE))
      .toMatchObject({ zuletztKm: 84210, kmAbstand: 30000, zuletzt: "2026-05-01", bemerkung: "" });
    expect(speicherePruefung(db, f.id, null, pruef({ name: "Ohne Termin", kmAbstand: 30000 }), HEUTE).zuletztKm).toBeNull();
    expect(speicherePruefung(db, f.id, null, pruef({ name: "Ohne Kilometer", zuletzt: "2026-05-01" }), HEUTE).zuletztKm).toBeNull();
  });

  it("ändern behält zuletztKm und die Bemerkung; ohne Kilometerabstand fällt zuletztKm weg", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const p = speicherePruefung(db, f.id, null, pruef({ art: "Service", name: "Inspektion", kmAbstand: 30000 }), HEUTE);
    erledigePruefung(db, p.id, erledigt({ km: 69400, bemerkung: "Ölwechsel" }), HEUTE);
    trageKilometerEin(db, f.id, { km: 80000 }, HEUTE);
    expect(speicherePruefung(db, f.id, p.id, pruef({ art: "Service", name: "Große Inspektion", monate: 12, kmAbstand: 20000, zuletzt: "2026-11-10", vonHand: "2027-06-01" }), HEUTE))
      .toEqual({ id: p.id, art: "Service", name: "Große Inspektion", monate: 12, kmAbstand: 20000, zuletzt: "2026-11-10", zuletztKm: 69400, vonHand: "2027-06-01", bemerkung: "Ölwechsel" });
    expect(speicherePruefung(db, f.id, p.id, pruef({ art: "Service", name: "Inspektion", zuletzt: "2026-11-10" }), HEUTE).zuletztKm).toBeNull();
    // Der Kilometerabstand kommt erst jetzt dazu: es gilt der Stand der Akte.
    expect(speicherePruefung(db, f.id, p.id, pruef({ art: "Service", name: "Inspektion", kmAbstand: 30000, zuletzt: "2026-11-10" }), HEUTE).zuletztKm).toBe(80000);
  });

  it("der letzte Termin liegt nie in der Zukunft, ein Handtermin schon", () => {
    const db = testDb();
    const f = fahrzeug(db);
    expect(() => speicherePruefung(db, f.id, null, pruef({ zuletzt: "2026-11-13" }), HEUTE)).toThrow(TagInZukunft);
    expect(speicherePruefung(db, f.id, null, pruef({ zuletzt: HEUTE, vonHand: "2028-01-01" }), HEUTE).vonHand).toBe("2028-01-01");
  });

  it("HU, UVV und Service gibt es je Fahrzeug einmal, Weitere beliebig oft", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const g = fahrzeug(db, { funkrufname: "Zweites" });
    const hu = speicherePruefung(db, f.id, null, pruef({ art: "HU", name: "HU (TÜV)" }), HEUTE);
    expect(() => speicherePruefung(db, f.id, null, pruef({ art: "HU", name: "HU 2" }), HEUTE)).toThrow(PruefartSchonVorhanden);
    speicherePruefung(db, f.id, hu.id, pruef({ art: "HU", name: "Hauptuntersuchung" }), HEUTE);
    speicherePruefung(db, g.id, null, pruef({ art: "HU", name: "HU" }), HEUTE);
    const w = speicherePruefung(db, f.id, null, pruef(), HEUTE);
    speicherePruefung(db, f.id, null, pruef(), HEUTE);
    expect(() => speicherePruefung(db, f.id, w.id, pruef({ art: "HU" }), HEUTE)).toThrow(PruefartSchonVorhanden);
    expect(akte(db, f.id).pruefungen.map((p) => p.art)).toEqual(["HU", "Weitere", "Weitere"]);
  });

  it("eine Prüfung eines anderen Fahrzeugs lässt sich nicht über eine fremde Fahrzeugkennung ändern", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const g = fahrzeug(db, { funkrufname: "Zweites" });
    const p = speicherePruefung(db, f.id, null, pruef(), HEUTE);
    expect(() => speicherePruefung(db, g.id, p.id, pruef({ name: "Gekapert" }), HEUTE)).toThrow(PruefungNichtGefunden);
    expect(() => speicherePruefung(db, f.id, "gibt-es-nicht", pruef(), HEUTE)).toThrow(PruefungNichtGefunden);
    expect(() => speicherePruefung(db, "gibt-es-nicht", null, pruef(), HEUTE)).toThrow(NichtGefunden);
    expect(akte(db, f.id).pruefungen[0].name).toBe("Feuerlöscher");
    expect(akte(db, g.id).pruefungen).toEqual([]);
  });

  it("entfernen nimmt genau diese Prüfung", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const p = speicherePruefung(db, f.id, null, pruef(), HEUTE);
    speicherePruefung(db, f.id, null, pruef({ name: "Ladebordwand" }), HEUTE);
    entfernePruefung(db, p.id);
    expect(akte(db, f.id).pruefungen.map((x) => x.name)).toEqual(["Ladebordwand"]);
    expect(() => entfernePruefung(db, p.id)).toThrow(PruefungNichtGefunden);
  });
});

describe("Prüfung erledigt", () => {
  it("setzt Termin, Handtermin und Bemerkung; null löscht einen alten Handtermin", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const p = speicherePruefung(db, f.id, null, pruef({ vonHand: "2026-12-01" }), HEUTE);
    expect(erledigePruefung(db, p.id, erledigt({ vonHand: "2027-03-01", bemerkung: "Plakette neu" }), HEUTE))
      .toMatchObject({ zuletzt: "2026-11-10", vonHand: "2027-03-01", bemerkung: "Plakette neu", zuletztKm: null });
    expect(erledigePruefung(db, p.id, erledigt({ am: HEUTE }), HEUTE)).toMatchObject({ zuletzt: HEUTE, vonHand: null, bemerkung: "" });
  });

  it("der Prüftag liegt nie in der Zukunft", () => {
    const db = testDb();
    const p = speicherePruefung(db, fahrzeug(db).id, null, pruef(), HEUTE);
    expect(() => erledigePruefung(db, p.id, erledigt({ am: "2026-11-13" }), HEUTE)).toThrow(TagInZukunft);
    expect(() => erledigePruefung(db, "gibt-es-nicht", erledigt(), HEUTE)).toThrow(PruefungNichtGefunden);
  });

  it("mit Kilometerabstand ist der Kilometerstand Pflicht und wird zuletztKm", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const p = speicherePruefung(db, f.id, null, pruef({ art: "Service", name: "Inspektion", kmAbstand: 30000 }), HEUTE);
    expect(() => erledigePruefung(db, p.id, erledigt(), HEUTE)).toThrow(KilometerFehlt);
    expect(akte(db, f.id).pruefungen[0].zuletzt).toBeNull();
    expect(erledigePruefung(db, p.id, erledigt({ km: 69400 }), HEUTE).zuletztKm).toBe(69400);
  });

  it("ohne Kilometerabstand bleibt zuletztKm leer, auch wenn ein Stand mitkommt", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const p = speicherePruefung(db, f.id, null, pruef(), HEUTE);
    expect(erledigePruefung(db, p.id, erledigt({ km: 500 }), HEUTE).zuletztKm).toBeNull();
    expect(akte(db, f.id)).toMatchObject({ km: 500, kmAm: "2026-11-10" });
  });

  it("ein höherer Stand hebt die Akte, ein niedrigerer lässt sie stehen", () => {
    const db = testDb();
    const f = fahrzeug(db);
    trageKilometerEin(db, f.id, { km: 84210, am: "2026-11-01" }, HEUTE);
    const p = speicherePruefung(db, f.id, null, pruef({ art: "Service", name: "Inspektion", kmAbstand: 30000 }), HEUTE);
    expect(erledigePruefung(db, p.id, erledigt({ am: "2026-10-01", km: 80000 }), HEUTE).zuletztKm).toBe(80000);
    expect(akte(db, f.id)).toMatchObject({ km: 84210, kmAm: "2026-11-01" });
    erledigePruefung(db, p.id, erledigt({ am: "2026-11-10", km: 85000 }), HEUTE);
    expect(akte(db, f.id)).toMatchObject({ km: 85000, kmAm: "2026-11-10" });
  });

  it("beim Anhänger ist kein Kilometerstand nötig, und ein mitgegebener wird verworfen", () => {
    const db = testDb();
    const a = anhaenger(db);
    const p = speicherePruefung(db, a.id, null, pruef({ art: "Service", name: "Wartung", kmAbstand: 30000 }), HEUTE);
    expect(erledigePruefung(db, p.id, erledigt({ km: 1234 }), HEUTE)).toMatchObject({ zuletzt: "2026-11-10", zuletztKm: null });
    expect(akte(db, a.id).km).toBeNull();
  });
});

describe("Reifen", () => {
  it("der erste Satz gilt als aufgezogen, der zweite ändert daran nichts", () => {
    const db = testDb();
    const f = fahrzeug(db);
    expect(akte(db, f.id).aufgezogen).toBeNull();
    speichereReifensatz(db, f.id, null, { art: "Sommer", dot: "1423", lager: "Regal 2" });
    speichereReifensatz(db, f.id, null, { art: "Winter", dot: "3822", lager: "" });
    expect(akte(db, f.id).aufgezogen).toBe("Sommer");
    expect(akte(db, f.id).reifensaetze.map((s) => [s.art, s.dot, s.lager])).toEqual([["Winter", "3822", ""], ["Sommer", "1423", "Regal 2"]]);
  });

  it("je Fahrzeug höchstens ein Satz je Art", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const g = fahrzeug(db, { funkrufname: "Zweites" });
    const winter = speichereReifensatz(db, f.id, null, { art: "Winter", dot: "3822", lager: "" });
    const sommer = speichereReifensatz(db, f.id, null, { art: "Sommer", dot: "1423", lager: "" });
    expect(() => speichereReifensatz(db, f.id, null, { art: "Winter", dot: "4020", lager: "" })).toThrow(ReifenartSchonVorhanden);
    expect(() => speichereReifensatz(db, f.id, sommer.id, { art: "Winter", dot: "1423", lager: "" })).toThrow("Dieses Fahrzeug hat schon einen Satz Winterreifen.");
    speichereReifensatz(db, g.id, null, { art: "Winter", dot: "4020", lager: "" });
    expect(speichereReifensatz(db, f.id, winter.id, { art: "Winter", dot: "4124", lager: "Keller" })).toEqual({ id: winter.id, art: "Winter", dot: "4124", lager: "Keller" });
  });

  it("ändert der aufgezogene Satz seine Art, bleibt er aufgezogen", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const s = speichereReifensatz(db, f.id, null, { art: "Winter", dot: "3822", lager: "" });
    speichereReifensatz(db, f.id, s.id, { art: "Ganzjahres", dot: "3822", lager: "" });
    expect(akte(db, f.id).aufgezogen).toBe("Ganzjahres");
  });

  it("ein Satz eines anderen Fahrzeugs lässt sich nicht über eine fremde Fahrzeugkennung ändern", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const g = fahrzeug(db, { funkrufname: "Zweites" });
    const s = speichereReifensatz(db, f.id, null, { art: "Winter", dot: "3822", lager: "" });
    expect(() => speichereReifensatz(db, g.id, s.id, { art: "Winter", dot: "0101", lager: "" })).toThrow(ReifensatzNichtGefunden);
    expect(akte(db, f.id).reifensaetze[0].dot).toBe("3822");
  });

  it("der Wechsel geht nur auf eine Art mit Satz", () => {
    const db = testDb();
    const f = fahrzeug(db);
    speichereReifensatz(db, f.id, null, { art: "Winter", dot: "3822", lager: "" });
    speichereReifensatz(db, f.id, null, { art: "Sommer", dot: "1423", lager: "" });
    wechsleReifen(db, f.id, { aufgezogen: "Sommer" });
    expect(akte(db, f.id).aufgezogen).toBe("Sommer");
    expect(() => wechsleReifen(db, f.id, { aufgezogen: "Ganzjahres" })).toThrow(KeinReifensatz);
    expect(() => wechsleReifen(db, "gibt-es-nicht", { aufgezogen: "Sommer" })).toThrow(NichtGefunden);
    expect(akte(db, f.id).aufgezogen).toBe("Sommer");
  });

  it("den aufgezogenen Satz entfernen heißt: nichts aufgezogen; einen anderen entfernen ändert nichts", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const winter = speichereReifensatz(db, f.id, null, { art: "Winter", dot: "3822", lager: "" });
    const sommer = speichereReifensatz(db, f.id, null, { art: "Sommer", dot: "1423", lager: "" });
    const ganz = speichereReifensatz(db, f.id, null, { art: "Ganzjahres", dot: "2224", lager: "" });
    entferneReifensatz(db, ganz.id);
    expect(akte(db, f.id).aufgezogen).toBe("Winter");
    entferneReifensatz(db, winter.id);
    expect(akte(db, f.id)).toMatchObject({ aufgezogen: null, reifensaetze: [{ id: sommer.id }] });
    expect(() => entferneReifensatz(db, winter.id)).toThrow(ReifensatzNichtGefunden);
    // Solange nichts aufgezogen ist, gilt der nächste angelegte Satz als aufgezogen.
    speichereReifensatz(db, f.id, null, { art: "Winter", dot: "4124", lager: "" });
    expect(akte(db, f.id).aufgezogen).toBe("Winter");
  });
});

describe("Datenbank", () => {
  it("jede Änderung an der Akte landet im Audit-Ausgang, ein Speichern ohne neuen Wert nicht", () => {
    const db = testDb();
    const f = fahrzeug(db);
    db.$client.exec("DELETE FROM audit_outbox");
    speichereTechnik(db, f.id, technik);
    speichereTechnik(db, f.id, technik);
    const p = speicherePruefung(db, f.id, null, pruef(), HEUTE);
    erledigePruefung(db, p.id, erledigt(), HEUTE);
    entfernePruefung(db, p.id);
    const s = speichereReifensatz(db, f.id, null, { art: "Winter", dot: "3822", lager: "" });
    entferneReifensatz(db, s.id);
    expect(db.$client.prepare("SELECT action, object_type FROM audit_outbox ORDER BY rowid").all().map((z) => { const a = z as { action: string; object_type: string }; return `${a.action} ${a.object_type}`; })).toEqual([
      "create fahrzeugakte",
      "create pruefung", "update pruefung", "delete pruefung",
      "create reifensatz", "update fahrzeugakte", "delete reifensatz", "update fahrzeugakte",
    ]);
  });

  it("die Datenbank selbst lehnt eine unbekannte Art, eine krumme DOT und einen zweiten Satz je Art ab", () => {
    const db = testDb();
    const f = fahrzeug(db);
    const sql = db.$client;
    expect(() => sql.prepare("INSERT INTO pruefung (id, stamm_id, art, name, monate, angelegt_am) VALUES ('p', ?, 'AU', 'x', 12, 0)").run(f.id)).toThrow(/CHECK/);
    expect(() => sql.prepare("INSERT INTO reifensatz (id, stamm_id, art, dot) VALUES ('r', ?, 'Winter', '38-2')").run(f.id)).toThrow(/CHECK/);
    sql.prepare("INSERT INTO reifensatz (id, stamm_id, art, dot) VALUES ('r1', ?, 'Winter', '3822')").run(f.id);
    expect(() => sql.prepare("INSERT INTO reifensatz (id, stamm_id, art, dot) VALUES ('r2', ?, 'Winter', '3822')").run(f.id)).toThrow(/UNIQUE/);
    expect(() => sql.prepare("INSERT INTO fahrzeugakte (stamm_id) VALUES ('gibt-es-nicht')").run()).toThrow(/FOREIGN KEY/);
    sql.prepare("INSERT INTO fahrzeugakte (stamm_id) VALUES (?)").run(f.id);
    expect(akte(db, f.id).technik.besonderheiten).toEqual([]);
  });
});
