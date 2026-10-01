import { describe, expect, it } from "vitest";
import { ersetzeDatumImTitel, heuteIso, titelFuerKopie } from "./tagesfassung";

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
  ])("%s → %s", (titel, erwartet) => {
    expect(ersetzeDatumImTitel(titel, H)).toBe(erwartet);
  });
  it.each(["112 Leitstelle", "1.2 Abschnitt", "EA 2.1.", "Stab", "Version 2026"])("ohne Datum: %s", (titel) => {
    expect(ersetzeDatumImTitel(titel, H)).toBeNull();
  });
});

describe("titelFuerKopie", () => {
  it("ohne Datum hängt „ (Kopie)“ an; nie über 200 Zeichen", () => {
    expect(titelFuerKopie("Stab", "2026-10-01")).toBe("Stab (Kopie)");
    const lang = "x".repeat(195);
    expect(titelFuerKopie(lang, "2026-10-01")).toBe(lang); // + „ (Kopie)“ wären 203
    const knapp = `${"y".repeat(191)} 1.7.2022`; // 200 Zeichen; nach dem Ersetzen (1.10.2026) wären es 201
    expect(knapp.length).toBe(200);
    expect(titelFuerKopie(knapp, "2026-10-01")).toBe(knapp);
  });
});
