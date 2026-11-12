import { describe, expect, it } from "vitest";
import {
  auswerten, datum, dotDatum, GELB_KM, GELB_TAGE, kmText, naechstes, plusMonate, pruefStand, REIFEN_GELB_JAHRE,
  REIFEN_ROT_JAHRE, REIFEN_ROT_JAHRE_TEMPO_100, reifenStand, saisonPflicht, saisonWechsel, schlimmste, tageBis,
} from "./regeln";
import { STUFEN, TEMPO_100, type AkteDTO, type PruefungDTO, type ReifenArt, type ReifensatzDTO, type Stufe } from "./typen";

const HEUTE = "2026-11-12";

let lfd = 0;
function pruefung(teil: Partial<PruefungDTO> = {}): PruefungDTO {
  return {
    id: `p${++lfd}`, art: "HU", name: "HU (TÜV)", monate: 24, kmAbstand: null, zuletzt: null, zuletztKm: null,
    vonHand: null, bemerkung: "", ...teil,
  };
}
const satz = (art: ReifenArt, dot: string): ReifensatzDTO => ({ id: `s-${art}`, art, dot, lager: "" });

function akte(teil: Partial<Omit<AkteDTO, "technik">> & { besonderheiten?: string[] } = {}): AkteDTO {
  const { besonderheiten = [], ...rest } = teil;
  return {
    fahrzeug: {
      id: "fz1", art: "fahrzeug", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1",
      kennzeichen: "UE-RK 1101", standort: "Uelzen", bemerkung: null, aktiv: true, aktualisiertAm: "2026-11-01T10:00:00.000Z",
    } as AkteDTO["fahrzeug"],
    technik: {
      modell: null, baujahr: null, laengeCm: null, breiteCm: null, hoeheCm: null, zggKg: null, leerKg: null,
      staerke: null, sitze: null, tragen: null, fuehrerschein: null, besonderheiten,
    },
    km: null, kmAm: null, aufgezogen: null, reifensaetze: [], pruefungen: [],
    ...rest,
  };
}

describe("Konstanten und Bausteine", () => {
  it("die Grenzen stehen, wie sie entschieden sind", () => {
    expect([GELB_TAGE, GELB_KM, REIFEN_GELB_JAHRE, REIFEN_ROT_JAHRE, REIFEN_ROT_JAHRE_TEMPO_100]).toEqual([30, 1000, 6, 8, 6]);
  });

  it("schlimmste folgt STUFEN: offen ist schlimmer als ok, harmloser als bald", () => {
    expect(schlimmste("ok", "offen")).toBe("offen");
    expect(schlimmste("offen", "bald")).toBe("bald");
    expect(schlimmste("bald", "ueberfaellig")).toBe("ueberfaellig");
    expect(schlimmste("ueberfaellig", "ok")).toBe("ueberfaellig");
    for (const a of STUFEN) {
      expect(schlimmste(a, a)).toBe(a);
      for (const b of STUFEN) expect(schlimmste(a, b)).toBe(schlimmste(b, a));
    }
  });

  it("datum und kmText", () => {
    expect(datum("2027-03-05")).toBe("05.03.2027");
    expect(kmText(null)).toBe("—");
    expect(kmText(0)).toBe("0 km");
    expect(kmText(800)).toBe("800 km");
    expect(kmText(1200)).toBe("1.200 km");
    expect(kmText(84210)).toBe("84.210 km");
    expect(kmText(1234567)).toBe("1.234.567 km");
  });

  it("plusMonate klemmt am Monatsende und geht über den Jahreswechsel", () => {
    expect(plusMonate("2026-01-31", 1)).toBe("2026-02-28");
    expect(plusMonate("2027-12-31", 2)).toBe("2028-02-29");
    expect(plusMonate("2026-08-31", 1)).toBe("2026-09-30");
    expect(plusMonate("2026-11-30", 3)).toBe("2027-02-28");
    expect(plusMonate("2026-12-15", 1)).toBe("2027-01-15");
    expect(plusMonate("2024-02-29", 12)).toBe("2025-02-28");
    expect(plusMonate("2024-02-29", 48)).toBe("2028-02-29");
  });

  it("tageBis zählt Kalendertage, auch über Zeitumstellung und Jahreswechsel", () => {
    expect(tageBis("2026-11-12", "2026-11-12")).toBe(0);
    expect(tageBis("2027-01-01", "2026-12-31")).toBe(1);
    expect(tageBis("2026-03-30", "2026-03-28")).toBe(2);
    expect(tageBis("2026-10-24", "2026-10-26")).toBe(-2);
  });
});

describe("nächster Termin", () => {
  it("zuletzt plus Abstand, am Monatsende geklemmt", () => {
    expect(naechstes(pruefung({ zuletzt: "2024-11-12", monate: 24 }))).toBe("2026-11-12");
    expect(naechstes(pruefung({ zuletzt: "2025-08-31", monate: 6 }))).toBe("2026-02-28");
    expect(naechstes(pruefung({ zuletzt: "2025-12-31", monate: 12 }))).toBe("2026-12-31");
  });

  it("der Handtermin schlägt die Rechnung, auch ohne letzte Prüfung", () => {
    expect(naechstes(pruefung({ zuletzt: "2024-01-10", monate: 24, vonHand: "2027-06-01" }))).toBe("2027-06-01");
    expect(naechstes(pruefung({ vonHand: "2027-06-01" }))).toBe("2027-06-01");
  });

  it("ohne beides: nicht erfasst", () => {
    expect(naechstes(pruefung())).toBeNull();
    const s = pruefStand(pruefung(), 50_000, HEUTE);
    expect(s).toMatchObject({ stufe: "offen", text: "nicht erfasst", faelligAm: null, kmGrenze: null, kmRest: null });
  });

  it("nicht erfasst bleibt es auch mit Kilometerabstand, solange die letzte Prüfung fehlt", () => {
    const s = pruefStand(pruefung({ art: "Service", kmAbstand: 30_000 }), 50_000, HEUTE);
    expect(s).toMatchObject({ stufe: "offen", kmGrenze: null, kmRest: null });
  });
});

describe("Stand einer Prüfung nach Termin", () => {
  const am = (faellig: string) => pruefStand(pruefung({ vonHand: faellig }), null, HEUTE);

  it.each<[string, Stufe, string]>([
    ["2026-11-05", "ueberfaellig", "seit 7 Tagen fällig"],
    ["2026-11-11", "ueberfaellig", "seit 1 Tag fällig"],
    ["2025-11-12", "ueberfaellig", "seit 365 Tagen fällig"],
    ["2026-11-12", "bald", "heute fällig"],
    ["2026-11-13", "bald", "in 1 Tag"],
    ["2026-11-24", "bald", "in 12 Tagen"],
    ["2026-12-12", "bald", "in 30 Tagen"],
    ["2026-12-13", "ok", "in 31 Tagen"],
    ["2027-02-10", "ok", "in 90 Tagen"],
    ["2027-02-11", "ok", "bis 02/2027"],
    ["2027-03-20", "ok", "bis 03/2027"],
  ])("fällig am %s → %s, „%s“", (faellig, stufe, text) => {
    expect(am(faellig)).toMatchObject({ stufe, text, faelligAm: faellig, kmGrenze: null, kmRest: null });
  });

  it("über den Jahreswechsel: am 31.12. fällig, am 1.1. einen Tag drüber", () => {
    const p = pruefung({ zuletzt: "2025-12-31", monate: 12 });
    expect(pruefStand(p, null, "2026-12-31")).toMatchObject({ stufe: "bald", text: "heute fällig" });
    expect(pruefStand(p, null, "2027-01-01")).toMatchObject({ stufe: "ueberfaellig", text: "seit 1 Tag fällig" });
    expect(pruefStand(p, null, "2026-12-01")).toMatchObject({ stufe: "bald", text: "in 30 Tagen" });
    expect(pruefStand(p, null, "2026-11-30")).toMatchObject({ stufe: "ok", text: "in 31 Tagen" });
  });

  it("der Handtermin schlägt eine längst überfällige Rechnung", () => {
    const s = pruefStand(pruefung({ zuletzt: "2020-01-01", monate: 12, vonHand: "2027-06-15" }), null, HEUTE);
    expect(s).toMatchObject({ stufe: "ok", text: "bis 06/2027", faelligAm: "2027-06-15" });
  });
});

describe("Stand einer Prüfung nach Kilometern", () => {
  /** Inspektion, Termin weit weg (01.09.2027), Grenze bei 100.000 km. */
  const service = pruefung({ art: "Service", name: "Inspektion", monate: 12, kmAbstand: 30_000, zuletzt: "2026-09-01", zuletztKm: 70_000 });
  const bei = (km: number | null) => pruefStand(service, km, HEUTE);

  it("weit vor der Grenze zählt nur der Termin", () => {
    expect(bei(84_210)).toMatchObject({ stufe: "ok", text: "bis 09/2027", kmGrenze: 100_000, kmRest: 15_790 });
  });

  it("1.001 km Rest ist noch in Ordnung, genau 1.000 km ist bald", () => {
    expect(bei(98_999)).toMatchObject({ stufe: "ok", kmRest: 1001 });
    expect(bei(99_000)).toMatchObject({ stufe: "bald", text: "noch 1.000 km", kmRest: 1000 });
    expect(bei(99_200)).toMatchObject({ stufe: "bald", text: "noch 800 km", kmRest: 800 });
    expect(bei(99_999)).toMatchObject({ stufe: "bald", text: "noch 1 km", kmRest: 1 });
  });

  it("0 km Rest ist überfällig, darüber steht, wie weit", () => {
    expect(bei(100_000)).toMatchObject({ stufe: "ueberfaellig", text: "Kilometergrenze erreicht", kmRest: 0, faelligAm: "2027-09-01" });
    expect(bei(101_200)).toMatchObject({ stufe: "ueberfaellig", text: "1.200 km drüber", kmRest: -1200 });
  });

  it("ohne Kilometerstand (nie abgelesen) zählt nur der Termin, die Grenze steht trotzdem da", () => {
    expect(bei(null)).toMatchObject({ stufe: "ok", text: "bis 09/2027", kmGrenze: 100_000, kmRest: null });
  });

  it("ohne Stand bei der letzten Prüfung gibt es keine Grenze", () => {
    const s = pruefStand({ ...service, zuletztKm: null }, 200_000, HEUTE);
    expect(s).toMatchObject({ stufe: "ok", kmGrenze: null, kmRest: null });
  });

  it("was zuerst kommt, zählt: ist der Termin vorbei, steht der Termin im Text", () => {
    const alt = { ...service, zuletzt: "2025-11-05" };
    expect(pruefStand(alt, 101_200, HEUTE)).toMatchObject({ stufe: "ueberfaellig", text: "seit 7 Tagen fällig", kmRest: -1200 });
    expect(pruefStand(alt, 80_000, HEUTE)).toMatchObject({ stufe: "ueberfaellig", text: "seit 7 Tagen fällig" });
  });

  it("Termin bald und Kilometer bald: der Termin steht im Text", () => {
    const baldBeides = { ...service, zuletzt: "2025-11-24" };
    expect(pruefStand(baldBeides, 99_200, HEUTE)).toMatchObject({ stufe: "bald", text: "in 12 Tagen" });
    expect(pruefStand(baldBeides, 100_000, HEUTE)).toMatchObject({ stufe: "ueberfaellig", text: "Kilometergrenze erreicht" });
  });

  it("ein Handtermin ändert die Kilometergrenze nicht", () => {
    const s = pruefStand({ ...service, vonHand: "2026-11-20" }, 99_500, HEUTE);
    expect(s).toMatchObject({ stufe: "bald", text: "in 8 Tagen", faelligAm: "2026-11-20", kmGrenze: 100_000, kmRest: 500 });
  });
});

describe("Reifenwechsel", () => {
  it("Winterzeit ist Oktober bis März", () => {
    expect(saisonPflicht("2026-09-30")).toBe("Sommer");
    expect(saisonPflicht("2026-10-01")).toBe("Winter");
    expect(saisonPflicht("2026-12-31")).toBe("Winter");
    expect(saisonPflicht("2027-01-01")).toBe("Winter");
    expect(saisonPflicht("2027-03-31")).toBe("Winter");
    expect(saisonPflicht("2027-04-01")).toBe("Sommer");
  });

  it("der Stichtag der Winterzeit liegt nach dem Jahreswechsel im Vorjahr", () => {
    expect(saisonWechsel("2026-10-01")).toEqual({ pflicht: "Winter", start: "2026-10-01", rotAb: "2026-11-01" });
    expect(saisonWechsel("2027-02-14")).toEqual({ pflicht: "Winter", start: "2026-10-01", rotAb: "2026-11-01" });
    expect(saisonWechsel("2027-04-01")).toEqual({ pflicht: "Sommer", start: "2027-04-01", rotAb: "2027-05-01" });
    expect(saisonWechsel("2027-09-30")).toEqual({ pflicht: "Sommer", start: "2027-04-01", rotAb: "2027-05-01" });
  });

  const mit = (aufgezogen: ReifenArt, heute: string) =>
    reifenStand(akte({ aufgezogen, reifensaetze: [satz("Winter", "3824"), satz("Sommer", "1425"), satz("Ganzjahres", "2225")] }), heute)!.saison;

  it.each<[ReifenArt, string, Stufe, string, string]>([
    ["Sommer", "2026-09-30", "ok", "Sommerreifen drauf", "Sommer drauf"],
    ["Sommer", "2026-10-01", "bald", "Winterreifen fällig", "Winterreifen fällig"],
    ["Sommer", "2026-10-31", "bald", "Winterreifen fällig", "Winterreifen fällig"],
    ["Sommer", "2026-11-01", "ueberfaellig", "Winterreifen fällig seit 01.10.2026", "Winterreifen fällig"],
    ["Sommer", "2027-01-15", "ueberfaellig", "Winterreifen fällig seit 01.10.2026", "Winterreifen fällig"],
    ["Sommer", "2027-03-31", "ueberfaellig", "Winterreifen fällig seit 01.10.2026", "Winterreifen fällig"],
    ["Sommer", "2027-04-01", "ok", "Sommerreifen drauf", "Sommer drauf"],
    ["Winter", "2027-03-31", "ok", "Winterreifen drauf", "Winter drauf"],
    ["Winter", "2027-04-01", "bald", "Sommerreifen fällig", "Sommerreifen fällig"],
    ["Winter", "2027-04-30", "bald", "Sommerreifen fällig", "Sommerreifen fällig"],
    ["Winter", "2027-05-01", "ueberfaellig", "Sommerreifen fällig seit 01.04.2027", "Sommerreifen fällig"],
    ["Winter", "2027-09-30", "ueberfaellig", "Sommerreifen fällig seit 01.04.2027", "Sommerreifen fällig"],
    ["Winter", "2027-10-01", "ok", "Winterreifen drauf", "Winter drauf"],
    ["Ganzjahres", "2026-11-01", "ok", "Ganzjahresreifen drauf", "Ganzjahres drauf"],
    ["Ganzjahres", "2027-05-01", "ok", "Ganzjahresreifen drauf", "Ganzjahres drauf"],
  ])("%s am %s → %s", (art, heute, stufe, text, kurz) => {
    expect(mit(art, heute)).toEqual({ stufe, text, kurz });
  });
});

describe("Reifenalter", () => {
  it("die DOT-Woche zählt ab dem 1. Januar in Siebenerschritten", () => {
    expect(dotDatum("0120")).toBe("2020-01-01");
    expect(dotDatum("0220")).toBe("2020-01-08");
    expect(dotDatum("3822")).toBe("2022-09-17");
    expect(dotDatum("5321")).toBe("2021-12-31");
    expect(dotDatum("5320")).toBe("2020-12-30"); // Schaltjahr
  });

  it("was keine Woche ist, ist kein Tag", () => {
    for (const dot of ["0020", "5420", "382", "38222", "ab22", ""]) expect(dotDatum(dot)).toBeNull();
  });

  const alter = (dot: string, heute: string, besonderheiten: string[] = []) =>
    reifenStand(akte({ aufgezogen: "Ganzjahres", reifensaetze: [satz("Ganzjahres", dot)], besonderheiten }), heute)!;

  it("Woche 01: exakt 6 Jahre ist bald, exakt 8 Jahre überfällig", () => {
    expect(alter("0120", "2025-12-31")).toMatchObject({ alterJahre: 5, alter: { stufe: "ok", text: "DOT 0120, 5 Jahre", kurz: "Ganzjahres drauf" } });
    expect(alter("0120", "2026-01-01")).toMatchObject({ alterJahre: 6, alter: { stufe: "bald", text: "6 Jahre alt, Ersatz einplanen", kurz: "6 Jahre alt" } });
    expect(alter("0120", "2027-12-31")).toMatchObject({ alterJahre: 7, alter: { stufe: "bald", text: "7 Jahre alt, Ersatz einplanen", kurz: "7 Jahre alt" } });
    expect(alter("0120", "2028-01-01")).toMatchObject({ alterJahre: 8, alter: { stufe: "ueberfaellig", text: "8 Jahre alt, tauschen", kurz: "8 Jahre alt" } });
    expect(alter("0120", "2031-06-01")).toMatchObject({ alterJahre: 11, alter: { stufe: "ueberfaellig", text: "11 Jahre alt, tauschen" } });
  });

  it("Woche 53: die Grenze liegt am Jahresende, einen Tag vorher ist es noch nicht so weit", () => {
    expect(alter("5321", "2027-12-30")).toMatchObject({ alterJahre: 5, alter: { stufe: "ok" } });
    expect(alter("5321", "2027-12-31")).toMatchObject({ alterJahre: 6, alter: { stufe: "bald" } });
    expect(alter("5321", "2029-12-30")).toMatchObject({ alterJahre: 7, alter: { stufe: "bald" } });
    expect(alter("5321", "2029-12-31")).toMatchObject({ alterJahre: 8, alter: { stufe: "ueberfaellig" } });
  });

  it("mit Tempo 100: bald ab 5, überfällig ab 6 Jahren", () => {
    expect(alter("0120", "2024-12-31", [TEMPO_100])).toMatchObject({ alterJahre: 4, alter: { stufe: "ok" } });
    expect(alter("0120", "2025-01-01", [TEMPO_100])).toMatchObject({ alterJahre: 5, alter: { stufe: "bald", text: "5 Jahre alt, Ersatz einplanen" } });
    expect(alter("0120", "2025-12-31", [TEMPO_100])).toMatchObject({ alterJahre: 5, alter: { stufe: "bald" } });
    expect(alter("0120", "2026-01-01", [TEMPO_100, "Auflaufbremse"])).toMatchObject({
      alterJahre: 6, alter: { stufe: "ueberfaellig", text: "6 Jahre alt, Tempo 100 nur bis 6 Jahre", kurz: "6 Jahre alt" },
    });
  });

  it("junge Reifen: Einzahl und nie negativ", () => {
    expect(alter("4025", HEUTE).alter.text).toBe("DOT 4025, 1 Jahr");
    expect(alter("4026", HEUTE)).toMatchObject({ alterJahre: 0, alter: { stufe: "ok", text: "DOT 4026, 0 Jahre" } });
    expect(alter("5026", HEUTE)).toMatchObject({ alterJahre: 0, alter: { stufe: "ok" } }); // Woche liegt noch vor uns
  });

  it("eine unlesbare DOT wirft nicht, sie ist nicht erfasst", () => {
    expect(alter("9999", HEUTE)).toMatchObject({ alterJahre: 0, stufe: "offen", alter: { stufe: "offen", text: "Herstellwoche nicht erfasst" } });
  });
});

describe("reifenStand", () => {
  it("null, solange nichts aufgezogen ist oder der Satz dieser Art fehlt", () => {
    expect(reifenStand(akte({ aufgezogen: null, reifensaetze: [satz("Winter", "3822")] }), HEUTE)).toBeNull();
    expect(reifenStand(akte({ aufgezogen: "Sommer", reifensaetze: [satz("Winter", "3822")] }), HEUTE)).toBeNull();
    expect(reifenStand(akte({ aufgezogen: "Sommer", reifensaetze: [] }), HEUTE)).toBeNull();
  });

  it("gerechnet wird am aufgezogenen Satz; die Stufe ist die schlimmere aus Alter und Saison", () => {
    // 12.11.2026: Sommerreifen drauf (überfällig seit 1.11.), 6 Jahre alt (bald).
    const r = reifenStand(akte({ aufgezogen: "Sommer", reifensaetze: [satz("Winter", "3824"), satz("Sommer", "1420")] }), HEUTE)!;
    expect(r.satz.art).toBe("Sommer");
    expect(r).toMatchObject({ alterJahre: 6, stufe: "ueberfaellig", alter: { stufe: "bald" }, saison: { stufe: "ueberfaellig" } });
    const w = reifenStand(akte({ aufgezogen: "Winter", reifensaetze: [satz("Winter", "3824"), satz("Sommer", "1420")] }), HEUTE)!;
    expect(w).toMatchObject({ alterJahre: 2, stufe: "ok", alter: { text: "DOT 3824, 2 Jahre", kurz: "Winter drauf" }, saison: { text: "Winterreifen drauf" } });
  });
});

describe("auswerten", () => {
  it("leere Akte: nicht erfasst statt in Ordnung, nichts als Nächstes", () => {
    expect(auswerten(akte(), HEUTE)).toEqual({ pruefungen: [], reifen: null, stufe: "offen", naechster: null });
  });

  it("Gesamtstufe ist die schlimmste; der Nächste ist der früheste Termin, auch wenn er vorbei ist", () => {
    const hu = pruefung({ art: "HU", vonHand: "2027-08-01" });
    const uvv = pruefung({ art: "UVV", name: "UVV-Prüfung", vonHand: "2026-11-05" });
    const service = pruefung({ art: "Service", name: "Inspektion", vonHand: "2026-11-24" });
    const offen = pruefung({ art: "Weitere", name: "Feuerlöscher" });
    const a = auswerten(akte({ pruefungen: [hu, uvv, service, offen] }), HEUTE);
    expect(a.pruefungen.map((s) => s.stufe)).toEqual(["ok", "ueberfaellig", "bald", "offen"]);
    expect(a.pruefungen.map((s) => s.pruefung.id)).toEqual([hu.id, uvv.id, service.id, offen.id]);
    expect(a.stufe).toBe("ueberfaellig");
    expect(a.naechster?.pruefung.id).toBe(uvv.id);
  });

  it("offen schlägt ok, bald schlägt offen", () => {
    const ok = pruefung({ vonHand: "2027-08-01" });
    const offen = pruefung({ art: "UVV" });
    const bald = pruefung({ art: "Service", vonHand: "2026-12-01" });
    expect(auswerten(akte({ pruefungen: [ok] }), HEUTE).stufe).toBe("ok");
    expect(auswerten(akte({ pruefungen: [ok, offen] }), HEUTE)).toMatchObject({ stufe: "offen", naechster: { pruefung: { id: ok.id } } });
    expect(auswerten(akte({ pruefungen: [ok, offen, bald] }), HEUTE)).toMatchObject({ stufe: "bald", naechster: { pruefung: { id: bald.id } } });
    expect(auswerten(akte({ pruefungen: [offen] }), HEUTE)).toMatchObject({ stufe: "offen", naechster: null });
  });

  it("bei gleichem Tag gewinnt die erste in der Reihenfolge der Akte", () => {
    const a = pruefung({ vonHand: "2027-01-10" });
    const b = pruefung({ art: "UVV", vonHand: "2027-01-10" });
    expect(auswerten(akte({ pruefungen: [a, b] }), HEUTE).naechster?.pruefung.id).toBe(a.id);
  });

  it("die Reifen zählen in die Gesamtstufe, aber nie als Nächster", () => {
    const ok = pruefung({ vonHand: "2027-08-01" });
    const a = auswerten(akte({ pruefungen: [ok], aufgezogen: "Sommer", reifensaetze: [satz("Sommer", "1425")] }), HEUTE);
    expect(a).toMatchObject({ stufe: "ueberfaellig", reifen: { stufe: "ueberfaellig" }, naechster: { pruefung: { id: ok.id } } });
  });

  it("der Kilometerstand der Akte geht in jede Prüfung", () => {
    const service = pruefung({ art: "Service", monate: 12, kmAbstand: 30_000, zuletzt: "2026-09-01", zuletztKm: 70_000 });
    expect(auswerten(akte({ km: 100_500, pruefungen: [service] }), HEUTE)).toMatchObject({ stufe: "ueberfaellig", pruefungen: [{ text: "500 km drüber" }] });
  });

  it("Anhänger ohne Kilometer: Termin zählt, Kilometer nie; Tempo 100 verschärft die Reifen", () => {
    const hu = pruefung({ zuletzt: "2025-01-10", monate: 24 });
    const bremse = pruefung({ art: "Weitere", name: "Wartung Auflaufbremse", monate: 24, kmAbstand: 10_000, zuletzt: "2026-01-10", zuletztKm: 0 });
    const anh = akte({
      km: null, kmAm: null, pruefungen: [hu, bremse], aufgezogen: "Ganzjahres", reifensaetze: [satz("Ganzjahres", "0821")],
      besonderheiten: [TEMPO_100, "Auflaufbremse"],
    });
    const a = auswerten(anh, HEUTE);
    expect(a.pruefungen[0]).toMatchObject({ stufe: "ok", text: "in 59 Tagen", faelligAm: "2027-01-10", kmGrenze: null, kmRest: null });
    expect(a.pruefungen[1]).toMatchObject({ stufe: "ok", text: "bis 01/2028", kmGrenze: 10_000, kmRest: null });
    expect(a.reifen).toMatchObject({ alterJahre: 5, stufe: "bald", alter: { stufe: "bald" }, saison: { stufe: "ok" } });
    expect(a.stufe).toBe("bald");
    expect(a.naechster?.pruefung.id).toBe(hu.id);
  });
});
