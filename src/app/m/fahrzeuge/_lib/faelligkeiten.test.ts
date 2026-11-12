import { afterEach, describe, expect, it, vi } from "vitest";
import { DRINGLICHKEITEN } from "@/core/faelligkeiten";
import { speichereFahrzeug } from "./daten";
import { speicherePruefung } from "./akte/daten";
import { TEMPO_100, type AkteDTO, type PruefungDTO, type ReifenArt, type ReifensatzDTO } from "./akte/typen";
import { ausAkten, darfFahrzeugeFaelligkeitenSehen, FAHRZEUGE_FAELLIGKEITS_ARTEN, fahrzeugeFaelligkeiten } from "./faelligkeiten";
import { testDb } from "./testDb";

const HEUTE = "2026-11-12";

function pruefung(id: string, teil: Partial<PruefungDTO> = {}): PruefungDTO {
  return { id, art: "HU", name: "HU (TÜV)", monate: 24, kmAbstand: null, zuletzt: null, zuletztKm: null, vonHand: null, bemerkung: "", ...teil };
}
const satz = (art: ReifenArt, dot: string): ReifensatzDTO => ({ id: `s-${art}`, art, dot, lager: "" });

function akte(teil: Partial<Omit<AkteDTO, "technik" | "fahrzeug">> & { besonderheiten?: string[]; fahrzeug?: Partial<AkteDTO["fahrzeug"]> } = {}): AkteDTO {
  const { besonderheiten = [], fahrzeug, ...rest } = teil;
  return {
    fahrzeug: {
      id: "rtw", art: "fahrzeug", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1",
      kennzeichen: "UE-RK 1101", standort: "Uelzen", bemerkung: null, aktiv: true, aktualisiertAm: "2026-11-01T10:00:00.000Z",
      ...fahrzeug,
    },
    technik: {
      modell: null, baujahr: null, laengeCm: null, breiteCm: null, hoeheCm: null, zggKg: null, leerKg: null,
      staerke: null, sitze: null, tragen: null, fuehrerschein: null, besonderheiten,
    },
    km: null, kmAm: null, aufgezogen: null, reifensaetze: [], pruefungen: [],
    ...rest,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("wer die Fahrzeugtermine sieht", () => {
  it("nur die Admin-Gruppe des Moduls, ohne Suite-Admin-Kurzschluss", () => {
    expect(darfFahrzeugeFaelligkeitenSehen(["fahrzeuge-admin"])).toBe(true);
    expect(darfFahrzeugeFaelligkeitenSehen(["helfer", "fahrzeuge-admin"])).toBe(true);
    expect(darfFahrzeugeFaelligkeitenSehen(["fahrzeuge-nutzer"])).toBe(false);
    expect(darfFahrzeugeFaelligkeitenSehen(["admin"])).toBe(false);
    expect(darfFahrzeugeFaelligkeitenSehen([])).toBe(false);
    expect(darfFahrzeugeFaelligkeitenSehen(null)).toBe(false);
    expect(darfFahrzeugeFaelligkeitenSehen(undefined)).toBe(false);
  });

  it("folgt der überschriebenen Admin-Gruppe", () => {
    vi.stubEnv("SUITE_ADMIN_GROUP_FAHRZEUGE", "fuhrpark");
    expect(darfFahrzeugeFaelligkeitenSehen(["fuhrpark"])).toBe(true);
    expect(darfFahrzeugeFaelligkeitenSehen(["fahrzeuge-admin"])).toBe(false);
  });

  it("die Arten für die Auswahl im Portal", () => {
    expect(FAHRZEUGE_FAELLIGKEITS_ARTEN).toEqual(["HU", "UVV", "Service", "Reifen", "Prüfung"]);
  });
});

describe("ausAkten: Prüfungen", () => {
  it("überfällig, heute fällig, bald; in Ordnung und nicht erfasst bleiben draußen", () => {
    const aus = ausAkten([akte({ pruefungen: [
      pruefung("hu", { art: "HU", vonHand: "2026-11-05" }),
      pruefung("uvv", { art: "UVV", name: "UVV-Prüfung", vonHand: "2026-11-12" }),
      pruefung("service", { art: "Service", name: "Inspektion", vonHand: "2026-11-24" }),
      pruefung("ok", { art: "Weitere", name: "Ladebordwand", vonHand: "2027-08-01" }),
      pruefung("offen", { art: "Weitere", name: "Feuerlöscher" }),
    ] })], HEUTE);
    expect(aus).toEqual([
      { id: "pruefung:hu", art: "HU", titel: "RTW 11-83-1", wo: "Uelzen", zustand: "seit 7 Tagen fällig", dringlichkeit: "ueberfaellig", sortierung: "2026-11-05", pfad: "/fahrzeug/rtw" },
      { id: "pruefung:uvv", art: "UVV", titel: "RTW 11-83-1", wo: "Uelzen", zustand: "heute fällig", dringlichkeit: "faellig", sortierung: "2026-11-12", pfad: "/fahrzeug/rtw" },
      { id: "pruefung:service", art: "Service", titel: "RTW 11-83-1", wo: "Uelzen", zustand: "fällig in 12 Tagen (24.11.2026)", dringlichkeit: "bald", sortierung: "2026-11-24", pfad: "/fahrzeug/rtw" },
    ]);
  });

  it("„Weitere“ heißt „Prüfung“, der Name steht vorn im Zustand", () => {
    const aus = ausAkten([akte({ pruefungen: [
      pruefung("a", { art: "Weitere", name: "Feuerlöscher", vonHand: "2026-10-01" }),
      pruefung("b", { art: "Weitere", name: "Stromerzeuger (DGUV V3)", vonHand: "2026-12-12" }),
      pruefung("c", { art: "Weitere", name: "Ladebordwand", vonHand: HEUTE }),
    ] })], HEUTE);
    expect(aus.map((e) => [e.art, e.zustand, e.dringlichkeit])).toEqual([
      ["Prüfung", "Feuerlöscher: seit 42 Tagen fällig", "ueberfaellig"],
      ["Prüfung", "Stromerzeuger (DGUV V3): fällig in 30 Tagen (12.12.2026)", "bald"],
      ["Prüfung", "Ladebordwand: heute fällig", "faellig"],
    ]);
  });

  it("nach Kilometern: bald mit Termin dahinter, an der Grenze überfällig", () => {
    const service = pruefung("s", { art: "Service", name: "Inspektion", monate: 12, kmAbstand: 30_000, zuletzt: "2026-09-01", zuletztKm: 70_000 });
    const [bald] = ausAkten([akte({ km: 99_200, pruefungen: [service] })], HEUTE);
    expect(bald).toMatchObject({ art: "Service", zustand: "noch 800 km, Termin 01.09.2027", dringlichkeit: "bald", sortierung: "2027-09-01" });
    const [drueber] = ausAkten([akte({ km: 101_200, pruefungen: [service] })], HEUTE);
    expect(drueber).toMatchObject({ zustand: "1.200 km drüber", dringlichkeit: "ueberfaellig", sortierung: "2027-09-01" });
    expect(ausAkten([akte({ km: 84_210, pruefungen: [service] })], HEUTE)).toEqual([]);
  });

  it("Termin heute, aber Kilometer schon drüber: überfällig, nicht „fällig“", () => {
    const service = pruefung("s", { art: "Service", monate: 12, kmAbstand: 30_000, zuletzt: "2025-11-12", zuletztKm: 70_000 });
    expect(ausAkten([akte({ km: 100_000, pruefungen: [service] })], HEUTE)[0]).toMatchObject({ dringlichkeit: "ueberfaellig", zustand: "Kilometergrenze erreicht" });
  });
});

describe("ausAkten: Reifen", () => {
  it("zwei Einträge: Saison und Alter", () => {
    const aus = ausAkten([akte({ aufgezogen: "Sommer", reifensaetze: [satz("Winter", "3824"), satz("Sommer", "1420")] })], HEUTE);
    expect(aus).toEqual([
      { id: "reifen:rtw:saison", art: "Reifen", titel: "RTW 11-83-1", wo: "Uelzen", zustand: "Winterreifen fällig seit 01.10.2026", dringlichkeit: "ueberfaellig", sortierung: "2026-10-01", pfad: "/fahrzeug/rtw" },
      { id: "reifen:rtw:alter", art: "Reifen", titel: "RTW 11-83-1", wo: "Uelzen", zustand: "6 Jahre alt, Ersatz einplanen", dringlichkeit: "bald", sortierung: "2028-04-01", pfad: "/fahrzeug/rtw" },
    ]);
  });

  it("im ersten Monat ist der Wechsel „bald“, auch am Stichtag selbst", () => {
    const sommer = akte({ aufgezogen: "Sommer", reifensaetze: [satz("Sommer", "1425")] });
    expect(ausAkten([sommer], "2026-09-30")).toEqual([]);
    expect(ausAkten([sommer], "2026-10-01")).toMatchObject([{ id: "reifen:rtw:saison", zustand: "Winterreifen fällig", dringlichkeit: "bald", sortierung: "2026-10-01" }]);
    expect(ausAkten([sommer], "2026-10-31")).toMatchObject([{ dringlichkeit: "bald" }]);
    expect(ausAkten([sommer], "2026-11-01")).toMatchObject([{ dringlichkeit: "ueberfaellig" }]);
  });

  it("alte Reifen: überfällig, mit Tempo 100 schon ab sechs Jahren", () => {
    const alt = akte({ aufgezogen: "Ganzjahres", reifensaetze: [satz("Ganzjahres", "0818")] });
    expect(ausAkten([alt], HEUTE)).toMatchObject([{ id: "reifen:rtw:alter", zustand: "8 Jahre alt, tauschen", dringlichkeit: "ueberfaellig", sortierung: "2026-02-19" }]);
    const anh = akte({ aufgezogen: "Ganzjahres", reifensaetze: [satz("Ganzjahres", "0820")], besonderheiten: [TEMPO_100] });
    expect(ausAkten([anh], HEUTE)).toMatchObject([{ zustand: "6 Jahre alt, Tempo 100 nur bis 6 Jahre", dringlichkeit: "ueberfaellig", sortierung: "2026-02-19" }]);
    expect(ausAkten([akte({ aufgezogen: "Ganzjahres", reifensaetze: [satz("Ganzjahres", "0820")] })], HEUTE))
      .toMatchObject([{ zustand: "6 Jahre alt, Ersatz einplanen", dringlichkeit: "bald", sortierung: "2028-02-19" }]);
  });

  it("nichts, solange kein aufgezogener Satz erfasst ist oder alles passt", () => {
    expect(ausAkten([akte({ aufgezogen: null, reifensaetze: [satz("Sommer", "0110")] })], HEUTE)).toEqual([]);
    expect(ausAkten([akte({ aufgezogen: "Winter", reifensaetze: [satz("Winter", "3824")] })], HEUTE)).toEqual([]);
  });
});

describe("ausAkten: Kopf und Vertrag", () => {
  const faellig = [pruefung("p", { vonHand: "2026-11-05" })];

  it("Titel ist Typ und Funkkenner, sonst Kennzeichen, sonst nur der Typ", () => {
    const titel = (fahrzeug: Partial<AkteDTO["fahrzeug"]>) => ausAkten([akte({ fahrzeug, pruefungen: faellig })], HEUTE)[0].titel;
    expect(titel({})).toBe("RTW 11-83-1");
    expect(titel({ typ: "Anhänger Betreuung", funkkenner: null, kennzeichen: "UE-RK 1501" })).toBe("Anhänger Betreuung UE-RK 1501");
    expect(titel({ funkkenner: "", kennzeichen: "UE-RK 1101" })).toBe("RTW UE-RK 1101");
    expect(titel({ funkkenner: null, kennzeichen: null })).toBe("RTW");
  });

  it("jedes Fahrzeug führt auf seine Akte; ids sind über Fahrzeuge hinweg eindeutig", () => {
    const zwei = [
      akte({ pruefungen: [pruefung("p1", { vonHand: "2026-11-05" })], aufgezogen: "Sommer", reifensaetze: [satz("Sommer", "1418")] }),
      akte({ fahrzeug: { id: "ktw", typ: "KTW-B", funkkenner: "11-85-1", standort: "Bad Bevensen" }, pruefungen: [pruefung("p2", { vonHand: "2026-11-20" })],
        aufgezogen: "Sommer", reifensaetze: [satz("Sommer", "1418")] }),
    ];
    const aus = ausAkten(zwei, HEUTE);
    expect(aus.map((e) => e.id)).toEqual(["pruefung:p1", "reifen:rtw:saison", "reifen:rtw:alter", "pruefung:p2", "reifen:ktw:saison", "reifen:ktw:alter"]);
    expect(new Set(aus.map((e) => e.id)).size).toBe(aus.length);
    expect(aus.filter((e) => e.pfad === "/fahrzeug/ktw").map((e) => [e.titel, e.wo])).toEqual(Array(3).fill(["KTW-B 11-85-1", "Bad Bevensen"]));
  });

  it("jede Art steht in der Auswahl, jede Dringlichkeit im Vertrag, nichts trägt Person oder sichtbarFuer", () => {
    const aus = ausAkten([akte({
      km: 99_500, aufgezogen: "Sommer", reifensaetze: [satz("Sommer", "1418")],
      pruefungen: [
        pruefung("a", { art: "HU", vonHand: "2026-11-05" }), pruefung("b", { art: "UVV", vonHand: HEUTE }),
        pruefung("c", { art: "Service", kmAbstand: 10_000, zuletzt: "2026-10-01", zuletztKm: 90_000 }),
        pruefung("d", { art: "Weitere", name: "Feuerlöscher", vonHand: "2026-12-01" }),
      ],
    })], HEUTE);
    expect(aus).toHaveLength(6);
    for (const e of aus) {
      expect(FAHRZEUGE_FAELLIGKEITS_ARTEN).toContain(e.art);
      expect(DRINGLICHKEITEN).toContain(e.dringlichkeit);
      expect(e).not.toHaveProperty("person");
      expect(e).not.toHaveProperty("sichtbarFuer");
      expect(e.sortierung).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("keine Akten, keine Einträge", () => {
    expect(ausAkten([], HEUTE)).toEqual([]);
    expect(ausAkten([akte()], HEUTE)).toEqual([]);
  });
});

describe("fahrzeugeFaelligkeiten: aus der Datenbank", () => {
  /** 12.11.2026, 10:00 UTC — in der Suite-Zone derselbe Tag. */
  const JETZT = new Date(Date.UTC(2026, 10, 12, 10));
  const stamm = { art: "fahrzeug" as const, typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1", kennzeichen: "UE-RK 1101", standort: "Uelzen", bemerkung: null, aktiv: true };
  const hu = { art: "HU" as const, name: "HU (TÜV)", monate: 24, kmAbstand: null, zuletzt: "2024-11-05", vonHand: null };

  it("liest nur aktive Fahrzeuge und rechnet mit dem Tag in der Suite-Zone", () => {
    const db = testDb();
    const rtw = speichereFahrzeug(db, null, stamm);
    const alt = speichereFahrzeug(db, null, { ...stamm, funkrufname: "Rotkreuz Uelzen 11-83-2", funkkenner: "11-83-2", kennzeichen: "UE-RK 1102", aktiv: false });
    const p = speicherePruefung(db, rtw.id, null, hu, HEUTE);
    speicherePruefung(db, alt.id, null, hu, HEUTE);
    expect(fahrzeugeFaelligkeiten(JETZT, db)).toEqual([{
      id: `pruefung:${p.id}`, art: "HU", titel: "RTW 11-83-1", wo: "Uelzen", zustand: "seit 7 Tagen fällig",
      dringlichkeit: "ueberfaellig", sortierung: "2026-11-05", pfad: `/fahrzeug/${rtw.id}`,
    }]);
  });

  it("kurz vor Mitternacht UTC ist in der Suite-Zone schon der nächste Tag", () => {
    const db = testDb();
    const rtw = speichereFahrzeug(db, null, stamm);
    speicherePruefung(db, rtw.id, null, { ...hu, zuletzt: "2024-11-12" }, HEUTE);
    expect(fahrzeugeFaelligkeiten(new Date("2026-11-11T22:30:00Z"), db)[0]).toMatchObject({ dringlichkeit: "bald", zustand: "fällig in 1 Tag (12.11.2026)" });
    expect(fahrzeugeFaelligkeiten(new Date("2026-11-11T23:30:00Z"), db)[0]).toMatchObject({ dringlichkeit: "faellig", zustand: "heute fällig" });
  });

  it("eine nicht lesbare Datenbank wirft — das Portal fängt es je Quelle (`sammle`)", () => {
    const kaputt = { select: () => { throw new Error("database is locked"); } } as unknown as Parameters<typeof fahrzeugeFaelligkeiten>[1];
    expect(() => fahrzeugeFaelligkeiten(JETZT, kaputt)).toThrow("database is locked");
  });
});
