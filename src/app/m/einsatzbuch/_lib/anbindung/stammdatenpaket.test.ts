import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setzeAktiveZeitzone, STANDARD_ZEITZONE, zeitzone } from "@/core/zeit";
import { fahrzeug, person, stichwort } from "../../_db/schema";
import { schreibeEinstellungen } from "../einstellungen";
import { istEchterZeitpunkt } from "../reader/pruefung";
import { stammdatenVersion, speichereFahrzeug, speicherePerson, speichereStichwort } from "../stammdaten/daten";
import { testDb } from "../testDb";
import { baueStammdatenpaket, etagVon, pruefeLesergrenzen, zeitpunktInZone } from "./stammdatenpaket";
import { stammdatenpaketSchema } from "./vertrag";

beforeEach(() => setzeAktiveZeitzone(STANDARD_ZEITZONE));
afterEach(() => setzeAktiveZeitzone(STANDARD_ZEITZONE));

function befuellt() {
  const db = testDb();
  speichereFahrzeug(db, null, { typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen", aktiv: true });
  speichereFahrzeug(db, null, { typ: "KTW", kennung: "11-85-9", ruf: "Rotkreuz Uelzen 11-85-9", standort: "Uelzen", aktiv: false });
  speicherePerson(db, null, { name: "Albers, Jana", quali: "SanH", ov: "Uelzen", aktiv: true });
  speicherePerson(db, null, { name: "Brandt, Ole", quali: "RS", ov: "Bad Bevensen", aktiv: false });
  // Gruppe „Rettungsdienst“ hat die kleinste Reihenfolge (1), „Brand“ erst 5: Rettungsdienst zuerst.
  speichereStichwort(db, null, { gruppe: "Brand", name: "B 2", reihenfolge: 6, aktiv: true });
  speichereStichwort(db, null, { gruppe: "Brand", name: "B 1", reihenfolge: 5, aktiv: true });
  speichereStichwort(db, null, { gruppe: "Rettungsdienst", name: "RD 2", reihenfolge: 2, aktiv: true });
  speichereStichwort(db, null, { gruppe: "Rettungsdienst", name: "RD 1", reihenfolge: 1, aktiv: true });
  speichereStichwort(db, null, { gruppe: "Rettungsdienst", name: "RD 0", reihenfolge: 2, aktiv: true });
  speichereStichwort(db, null, { gruppe: "Rettungsdienst", name: "RD alt", reihenfolge: 0, aktiv: false });
  speichereStichwort(db, null, { gruppe: "Veraltet", name: "V 1", reihenfolge: 0, aktiv: false });
  // Gleiche kleinste Reihenfolge: dann nach Gruppenname.
  speichereStichwort(db, null, { gruppe: "Hilfeleistung", name: "H 1", reihenfolge: 5, aktiv: true });
  return db;
}

describe("baueStammdatenpaket", () => {
  it("enthält nur aktive Einträge, genau die Drahtfelder, sortierte Stichwortgruppen und die Suite-Zone", () => {
    const db = befuellt();
    schreibeEinstellungen(db, { fristMinuten: 20, besatzung: false, bereitschaft: "DRK-Bereitschaft Bad Bevensen" });
    setzeAktiveZeitzone("Europe/Lisbon");
    const p = baueStammdatenpaket(db);
    expect(p).toEqual({
      version: stammdatenVersion(db),
      stammdaten: {
        fahrzeuge: [{ id: expect.any(String), typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen" }],
        personal: [{ id: expect.any(String), name: "Albers, Jana", quali: "SanH", ov: "Uelzen" }],
        stichworte: [
          { name: "Rettungsdienst", items: ["RD 1", "RD 0", "RD 2"] },
          { name: "Brand", items: ["B 1", "B 2"] },
          { name: "Hilfeleistung", items: ["H 1"] },
        ],
      },
      fristMinuten: 20, besatzung: false, zeitzone: "Europe/Lisbon", bereitschaft: "DRK-Bereitschaft Bad Bevensen",
    });
    expect(p.zeitzone).toBe(zeitzone());
    expect(Object.keys(p.stammdaten.fahrzeuge[0])).toEqual(["id", "typ", "kennung", "ruf", "standort"]);
    expect(Object.keys(p.stammdaten.personal[0])).toEqual(["id", "name", "quali", "ov"]);
  });

  it("passt zu stammdatenpaketSchema und hat dieselbe Form wie die Fixture", () => {
    const p = baueStammdatenpaket(befuellt());
    expect(stammdatenpaketSchema.safeParse(p).success).toBe(true);
    const fixture = JSON.parse(readFileSync(join(__dirname, "vertrag", "stammdaten.json"), "utf8"));
    const form = (x: unknown): unknown =>
      Array.isArray(x) ? [form(x[0])] : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, form(v)])) : typeof x;
    expect(form(p)).toEqual(form(fixture));
  });

  it("leere Stammdaten ergeben leere Listen und die Vorgaben der Einstellungen", () => {
    const p = baueStammdatenpaket(testDb());
    expect(p.stammdaten).toEqual({ fahrzeuge: [], personal: [], stichworte: [] });
    expect(p).toMatchObject({ fristMinuten: 15, besatzung: true, bereitschaft: "DRK-Bereitschaft Uelzen", zeitzone: STANDARD_ZEITZONE });
  });
});

describe("etagVon", () => {
  it("ist \"<version>/<zeitzone>\" und ändert sich mit der Version und mit der Zone", () => {
    const db = befuellt();
    const a = baueStammdatenpaket(db);
    expect(etagVon(a)).toBe(`"${a.version}/Europe/Berlin"`);
    speichereFahrzeug(db, null, { typ: "MTW", kennung: "11-19-1", ruf: "Rotkreuz Uelzen 11-19-1", standort: "Uelzen", aktiv: true });
    const b = baueStammdatenpaket(db);
    expect(etagVon(b)).not.toBe(etagVon(a));
    setzeAktiveZeitzone("UTC");
    const c = baueStammdatenpaket(db);
    expect(c.version).toBe(b.version);
    expect(etagVon(c)).toBe(`"${b.version}/UTC"`);
  });
});

describe("pruefeLesergrenzen", () => {
  it("lässt Stammdaten innerhalb der Reader-Grenzen durch", () => {
    expect(pruefeLesergrenzen(baueStammdatenpaket(befuellt()))).toEqual({ ok: true });
  });

  it("meldet einen 41 Zeichen langen Fahrzeugtyp (Reader: 40) mit Feld und Eintrag", () => {
    const db = testDb();
    db.insert(fahrzeug).values({ id: "fz-lang", typ: "T".repeat(41), kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen" }).run();
    expect(pruefeLesergrenzen(baueStammdatenpaket(db))).toEqual({ ok: false, feld: "Fahrzeugtyp", eintrag: "fz-lang", laenge: 41, hoechstens: 40 });
  });

  it("40 Zeichen gehen; gezählt wird in UTF-16-Codeeinheiten wie im Reader", () => {
    const db = testDb();
    db.insert(fahrzeug).values({ id: "fz-40", typ: "Ä".repeat(40), kennung: "11-83-1", ruf: "R", standort: "Uelzen" }).run();
    expect(pruefeLesergrenzen(baueStammdatenpaket(db))).toEqual({ ok: true });
    db.insert(fahrzeug).values({ id: "fz-emoji", typ: "🚑".repeat(20) + "x", kennung: "11-83-2", ruf: "R", standort: "Uelzen" }).run();
    expect(pruefeLesergrenzen(baueStammdatenpaket(db))).toMatchObject({ ok: false, feld: "Fahrzeugtyp", eintrag: "fz-emoji", laenge: 41 });
  });

  it("meldet Personal- und Stichwortfelder; das Stichwort mit seiner Gruppe als Eintrag", () => {
    const db = testDb();
    db.insert(person).values({ id: "p-1", name: "Albers, Jana", quali: "Q".repeat(41), ov: "Uelzen" }).run();
    expect(pruefeLesergrenzen(baueStammdatenpaket(db))).toEqual({ ok: false, feld: "Qualifikation", eintrag: "p-1", laenge: 41, hoechstens: 40 });
    const db2 = testDb();
    db2.insert(stichwort).values({ id: "s-1", gruppe: "Rettungsdienst", name: "S".repeat(81), reihenfolge: 1 }).run();
    expect(pruefeLesergrenzen(baueStammdatenpaket(db2))).toEqual({ ok: false, feld: "Alarmstichwort", eintrag: "Rettungsdienst", laenge: 81, hoechstens: 80 });
  });

  it("inaktive Einträge zählen nicht", () => {
    const db = testDb();
    db.insert(fahrzeug).values({ id: "fz-alt", typ: "T".repeat(41), kennung: "11-83-1", ruf: "R", standort: "Uelzen", aktiv: false }).run();
    expect(pruefeLesergrenzen(baueStammdatenpaket(db))).toEqual({ ok: true });
  });

  it("kürzt eine überlange ID im Eintrag auf ihre Grenze", () => {
    const db = testDb();
    db.insert(fahrzeug).values({ id: "i".repeat(90), typ: "RTW", kennung: "11-83-1", ruf: "R", standort: "Uelzen" }).run();
    expect(pruefeLesergrenzen(baueStammdatenpaket(db))).toEqual({ ok: false, feld: "Fahrzeug-ID", eintrag: "i".repeat(80), laenge: 90, hoechstens: 80 });
  });
});

describe("zeitpunktInZone", () => {
  it("Sommerzeit in Europe/Berlin: +02:00", () => {
    expect(zeitpunktInZone(new Date("2026-07-01T08:00:00Z"))).toBe("2026-07-01T10:00:00+02:00");
  });
  it("Winterzeit in Europe/Berlin: +01:00, auch über Mitternacht", () => {
    expect(zeitpunktInZone(new Date("2026-01-15T08:00:05Z"))).toBe("2026-01-15T09:00:05+01:00");
    expect(zeitpunktInZone(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01T00:30:00+01:00");
  });
  it("folgt der eingestellten Suite-Zone, UTC als +00:00", () => {
    setzeAktiveZeitzone("UTC");
    expect(zeitpunktInZone(new Date("2026-07-01T00:00:00Z"))).toBe("2026-07-01T00:00:00+00:00");
    setzeAktiveZeitzone("America/St_Johns");
    expect(zeitpunktInZone(new Date("2026-01-15T12:00:00Z"))).toBe("2026-01-15T08:30:00-03:30");
  });
  it("liefert immer einen Zeitpunkt, den der Reader annimmt und der denselben Augenblick meint", () => {
    for (const zone of ["Europe/Berlin", "UTC", "Asia/Kolkata", "Pacific/Chatham"]) {
      setzeAktiveZeitzone(zone);
      for (const iso of ["2026-03-29T00:59:59Z", "2026-03-29T01:00:00Z", "2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z", "2026-06-30T22:00:00Z"]) {
        const z = zeitpunktInZone(new Date(iso));
        expect(istEchterZeitpunkt(z), `${zone} ${iso}`).toBe(true);
        expect(new Date(z).getTime(), `${zone} ${iso} → ${z}`).toBe(new Date(iso).getTime());
      }
    }
  });
});
