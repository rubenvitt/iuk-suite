import { describe, expect, it } from "vitest";

import type { Entwurf, Fahrzeug, Person, Stammdatenpaket } from "../typen";
import {
  bereitText,
  dauerHinweis,
  fahrzeugFilter,
  fahrzeugTreffer,
  fehlendeAngaben,
  fristSatz,
  leererEntwurf,
  personFilter,
  personTreffer,
  schaltePerson,
  schalteFahrzeug,
  setzeZaehler,
  waehleErstenTreffer,
  zusammenfassung,
} from "./formular";

// Kleine, eigene Stammdaten-Fixture: 4 Fahrzeuge in 2 Standorten, 4 Personen, 2 Stichwortgruppen.
// Die IDs "11-83-1"/"p4" tauchen auch im Rust-Test-Entwurf auf (`src-tauri/src/befehle.rs`),
// bewusst gleich benannt, aber unabhängig — dieser Kern hier prüft nur Formularlogik.
const FAHRZEUGE: Fahrzeug[] = [
  { id: "11-83-1", typ: "RTW", kennung: "HH-BP 8301", ruf: "Rotkreuz Uelzen 83-1", standort: "Uelzen" },
  { id: "11-83-2", typ: "RTW", kennung: "HH-BP 8302", ruf: "Rotkreuz Uelzen 83-2", standort: "Uelzen" },
  { id: "11-84-1", typ: "RTW", kennung: "HH-BP 8401", ruf: "Rotkreuz Bad Bevensen 84-1", standort: "Bad Bevensen" },
  { id: "11-85-1", typ: "KTW", kennung: "HH-BP 8501", ruf: "Rotkreuz Bad Bevensen 85-1", standort: "Bad Bevensen" },
];

const PERSONAL: Person[] = [
  { id: "p1", name: "Anna Bauer", quali: "RS", ov: "Uelzen" },
  { id: "p2", name: "Ben Cordes", quali: "RS", ov: "Uelzen" },
  { id: "p3", name: "Clara Dietz", quali: "NotSan", ov: "Bad Bevensen" },
  { id: "p4", name: "David Ehlers", quali: "RH", ov: "Bad Bevensen" },
];

const STAMM = {
  fahrzeuge: FAHRZEUGE,
  personal: PERSONAL,
  stichworte: [
    { name: "Rettungsdienst", items: ["RD 1", "RD 2", "RD 3"] },
    { name: "Betreuung", items: ["BD 1", "BD 2"] },
  ],
};

const PAKET: Stammdatenpaket = {
  version: 1,
  stammdaten: STAMM,
  fristMinuten: 15,
  besatzung: true,
  zeitzone: "Europe/Berlin",
  bereitschaft: "Tagesdienst",
};

function mit(teil: Partial<Entwurf> = {}): Entwurf {
  return {
    stichwort: "",
    beginnDatum: "2026-09-24",
    beginnZeit: "10:00",
    endeDatum: "",
    endeZeit: "",
    strasse: "",
    ort: "",
    objekt: "",
    fahrzeuge: [],
    personal: [],
    vorOrt: 0,
    transport: 0,
    notizen: "",
    ...teil,
  };
}

describe("Pflichtfelder (Spec §4.3)", () => {
  it("leer: Stichwort, Beginn und Ort fehlen, Text wie die Vorlage", () => {
    const e = mit({ beginnDatum: "", beginnZeit: "" });
    expect(fehlendeAngaben(e)).toEqual(["Alarmstichwort", "Beginn", "Einsatzort"]);
    expect(bereitText(e)).toBe("Ohne Alarmstichwort, Beginn und Einsatzort wird nicht abgesendet.");
  });

  it("Ort ODER Straße genügt", () => {
    expect(fehlendeAngaben(mit({ stichwort: "RD 2", ort: "29525 Uelzen" }))).toEqual([]);
    expect(fehlendeAngaben(mit({ stichwort: "RD 2", strasse: "Lindenstraße 8" }))).toEqual([]);
  });

  it("bereit: Zusammenfassung in einer Zeile", () => {
    expect(
      bereitText(
        mit({ stichwort: "RD 2", ort: "Uelzen", fahrzeuge: ["11-83-1"], personal: [{ id: "p4", fahrzeugId: null }], vorOrt: 1, transport: 2 }),
      ),
    ).toBe("Bereit · RD 2, 1 Fahrzeuge, 1 Kräfte, 3 Patienten");
  });
});

describe("Dauer in der Suite-Zone", () => {
  it("über die Zeitumstellung (25.10.) zählt 180 statt 120 Minuten", () => {
    expect(dauerHinweis(mit({ beginnDatum: "2026-10-25", beginnZeit: "01:30", endeDatum: "2026-10-25", endeZeit: "03:30" }), "Europe/Berlin")).toBe(
      "Einsatzdauer 3 h 00 min",
    );
  });

  it("Ende vor Beginn blockiert nicht, erzeugt aber den Hinweis", () => {
    const e = mit({ stichwort: "RD 2", ort: "U", beginnDatum: "2026-09-23", beginnZeit: "18:00", endeDatum: "2026-09-23", endeZeit: "17:00" });
    expect(dauerHinweis(e, "Europe/Berlin")).toBe("Ende liegt vor dem Beginn — bitte prüfen.");
    expect(fehlendeAngaben(e)).toEqual([]);
  });

  it("offenes Ende", () => {
    expect(dauerHinweis(mit({ endeDatum: "", endeZeit: "" }), "Europe/Berlin")).toBe("Ende noch offen — kannst du auch später in der Frist nachtragen.");
  });
});

describe("Suche mit Enter", () => {
  it("wählt den ersten Treffer, wählt aber nie ab", () => {
    const treffer = fahrzeugTreffer(STAMM.fahrzeuge, "83-1", "Alle");
    expect(waehleErstenTreffer(treffer, [])).toEqual([treffer[0].id]);
    expect(waehleErstenTreffer(treffer, [treffer[0].id])).toEqual([treffer[0].id]);
    expect(waehleErstenTreffer([], [])).toBeNull();
  });

  it("sucht über Typ und Funkrufname, filtert nach Standort", () => {
    expect(fahrzeugTreffer(STAMM.fahrzeuge, "rtw", "Alle").map((f) => f.id)).toEqual(["11-83-1", "11-83-2", "11-84-1"]);
    expect(fahrzeugTreffer(STAMM.fahrzeuge, "rtw", "Bad Bevensen").map((f) => f.id)).toEqual(["11-84-1"]);
  });

  it("Personensuche über Name, Qualifikation und Ortsverein, gefiltert nach Qualifikation", () => {
    expect(personTreffer(STAMM.personal, "dietz", "Alle").map((p) => p.id)).toEqual(["p3"]);
    expect(personTreffer(STAMM.personal, "", "RS").map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});

describe("Filterlisten", () => {
  it("Standorte in Reihenfolge, mit vorangestelltem Alle", () => {
    expect(fahrzeugFilter(STAMM.fahrzeuge)).toEqual(["Alle", "Uelzen", "Bad Bevensen"]);
  });

  it("Qualifikationen in Reihenfolge, mit vorangestelltem Alle", () => {
    expect(personFilter(STAMM.personal)).toEqual(["Alle", "RS", "NotSan", "RH"]);
  });
});

it("Fahrzeug abwählen löst die Besatzungszuordnung", () => {
  const e = schalteFahrzeug(mit({ fahrzeuge: ["11-83-1"], personal: [{ id: "p4", fahrzeugId: "11-83-1" }] }), "11-83-1");
  expect(e.personal).toEqual([{ id: "p4", fahrzeugId: null }]);
  expect(e.fahrzeuge).toEqual([]);
});

it("Fahrzeug erneut anwählen fügt es wieder hinzu", () => {
  const e = schalteFahrzeug(mit({ fahrzeuge: [] }), "11-83-1");
  expect(e.fahrzeuge).toEqual(["11-83-1"]);
});

it("Person an- und abwählen", () => {
  const gewaehlt = schaltePerson(mit(), "p4");
  expect(gewaehlt.personal).toEqual([{ id: "p4", fahrzeugId: null }]);
  const abgewaehlt = schaltePerson(gewaehlt, "p4");
  expect(abgewaehlt.personal).toEqual([]);
});

it("Zähler: nur Ziffern, höchstens 999", () => {
  expect(setzeZaehler("12a3")).toBe(123);
  expect(setzeZaehler("5000")).toBe(999);
  expect(setzeZaehler("")).toBe(0);
});

it("Fristsatz", () => {
  expect(fristSatz(15)).toBe("Nach dem Absenden 15 Minuten änderbar, danach nicht mehr einsehbar");
  expect(fristSatz(1)).toBe("Nach dem Absenden 1 Minute änderbar, danach nicht mehr einsehbar");
});

it("leerer Entwurf nimmt heute und jetzt in der Suite-Zone, nicht in der Rechnerzone", () => {
  expect(leererEntwurf(new Date("2026-12-31T23:30:00Z"), "Europe/Berlin")).toMatchObject({ beginnDatum: "2027-01-01", beginnZeit: "00:30" });
});

it("Zusammenfassung: Zeilen wie in der Vorlage, inklusive offenem Ende", () => {
  const e = mit({
    stichwort: "RD 2",
    beginnDatum: "2026-09-24",
    beginnZeit: "10:00",
    strasse: "Lindenstraße 8",
    ort: "Uelzen",
    fahrzeuge: ["11-83-1"],
    personal: [{ id: "p4", fahrzeugId: null }],
    vorOrt: 1,
    transport: 2,
  });
  expect(zusammenfassung(e, PAKET)).toEqual([
    { k: "Alarmstichwort", v: "RD 2" },
    { k: "Beginn", v: "24.9.2026, 10:00 Uhr" },
    { k: "Ende", v: "offen" },
    { k: "Einsatzort", v: "Lindenstraße 8, Uelzen" },
    { k: "Fahrzeuge", v: "RTW HH-BP 8301" },
    { k: "Personal", v: "1 Kräfte" },
    { k: "Patienten", v: "1 vor Ort · 2 mit Transport" },
  ]);
});
