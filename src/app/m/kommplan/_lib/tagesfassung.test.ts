import { describe, expect, it } from "vitest";
import { ersetzeDatumImTitel, heuteIso, kopieHinweis, titelFuerKopie } from "./tagesfassung";

describe("heuteIso — der Tag in der Suite-Zone (Europe/Berlin), nicht in UTC", () => {
  it("über die Berliner Mitternacht, Sommer- und Winterzeit", () => {
    expect(heuteIso(Date.UTC(2026, 8, 30, 21, 59))).toBe("2026-09-30"); // 23:59 MESZ
    expect(heuteIso(Date.UTC(2026, 8, 30, 22, 0))).toBe("2026-10-01");  // 00:00 MESZ, UTC noch am Vortag
    expect(heuteIso(Date.UTC(2026, 11, 31, 23, 0))).toBe("2027-01-01"); // 00:00 MEZ
  });
});

describe("ersetzeDatumImTitel (Spec §6.7; Entscheidung 9)", () => {
  const H = "2026-10-01";
  it.each([
    ["OpenR 01.07.2022", "OpenR 01.10.2026"],
    ["Einsatz 1.7.2022", "Einsatz 1.10.2026"],
    ["Lage 01.07.22", "Lage 01.10.26"],
    ["Plan 2022-07-01", "Plan 2026-10-01"],
    ["Kommunikationsplan Einsatz 22.02.2026", "Kommunikationsplan Einsatz 01.10.2026"],
    ["01.07.2022 bis 03.07.2022", "01.10.2026 bis 03.07.2022"],
    ["Probe 99.99.2022, Einsatz 02.07.2022", "Probe 99.99.2022, Einsatz 01.10.2026"],
    // Review Phase 4: ISO-Datum direkt nach Bindestrich oder Unterstrich, gemischte führende Null
    ["OpenR-2022-07-01", "OpenR-2026-10-01"],
    ["Einsatz_2022-07-01", "Einsatz_2026-10-01"],
    ["Lage 1.07.2022", "Lage 01.10.2026"],
    ["Lage 01.7.2022", "Lage 01.10.2026"],
  ])("%s → %s", (titel, erwartet) => {
    expect(ersetzeDatumImTitel(titel, H)).toBe(erwartet);
  });
  it.each([
    "112 Leitstelle", "1.2 Abschnitt", "EA 2.1.", "Stab", "Version 2026",
    // Review Phase 4: eine Versions- oder Abschnittsnummer ist kein `T.M.JJ` (zweistelliges Jahr nur als `TT.MM.JJ`) …
    "v1.2.10 Plan", "Abschnitt 1.2.10",
    // … und eine ISO-Form nach „Ziffer-“ steht mitten in einer längeren Zahlenfolge.
    "Nr 1-2022-07-01", "12022-07-01",
  ])("ohne Datum: %s", (titel) => {
    expect(ersetzeDatumImTitel(titel, H)).toBeNull();
  });
});

describe("titelFuerKopie — mit Auskunft, was mit dem Titel geschah (der Kopie-Hinweis im Editor sagt es weiter)", () => {
  const H = "2026-10-01";
  it("Datum ersetzt", () => {
    expect(titelFuerKopie("OpenR 01.07.2022", H)).toEqual({ titel: "OpenR 01.10.2026", art: "datum" });
  });
  it("ohne Datum hängt „ (Kopie)“ an", () => {
    expect(titelFuerKopie("Stab", H)).toEqual({ titel: "Stab (Kopie)", art: "zusatz" });
  });
  it("trägt der Titel schon das heutige Datum, hängt „ (Kopie)“ an — sonst hießen Plan und Kopie gleich", () => {
    expect(titelFuerKopie("Einsatz 01.10.2026", H)).toEqual({ titel: "Einsatz 01.10.2026 (Kopie)", art: "zusatz" });
    expect(titelFuerKopie("Plan 2026-10-01", H)).toEqual({ titel: "Plan 2026-10-01 (Kopie)", art: "zusatz" });
  });
  it("nie über 200 Zeichen: dann bleibt der Titel, wie er war", () => {
    const lang = "x".repeat(195);
    expect(titelFuerKopie(lang, H)).toEqual({ titel: lang, art: "unveraendert" }); // + „ (Kopie)“ wären 203
    const knapp = `${"y".repeat(191)} 1.7.2022`; // 200 Zeichen; nach dem Ersetzen (1.10.2026) wären es 201
    expect(knapp.length).toBe(200);
    expect(titelFuerKopie(knapp, H)).toEqual({ titel: knapp, art: "unveraendert" });
  });
});

describe("kopieHinweis — bestätigt nur ein wirklich ersetztes Datum (Review Phase 4)", () => {
  it("datum: Bestätigung", () => {
    expect(kopieHinweis("datum", "01.10.2026")).toEqual({ text: "Kopie angelegt — Titel und Datum stehen auf 01.10.2026.", bestaetigt: true });
  });
  it.each(["zusatz", "unveraendert", "1", "irgendwas"])("%s: Warnung, die nicht behauptet, der Titel stehe auf heute", (art) => {
    const h = kopieHinweis(art, "01.10.2026")!;
    expect(h.bestaetigt).toBe(false);
    expect(h.text).toContain("das Datum steht auf 01.10.2026");
    expect(h.text).not.toContain("Titel und Datum");
  });
  it("ohne Parameter kein Hinweis", () => {
    expect(kopieHinweis(undefined, "01.10.2026")).toBeUndefined();
  });
});
