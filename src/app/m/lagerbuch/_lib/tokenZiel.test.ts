import { describe, it, expect } from "vitest";
import { tokenZielPfad } from "./tokenZiel";
import { sanitizeReturnTo } from "./returnTo";

describe("tokenZielPfad — wohin ein eingeloester Code fuehrt", () => {
  it("fuehrt einen Artikel-Code aufs Artikel-Detail", () => {
    expect(tokenZielPfad("artikel", "art-1")).toBe("/a/art-1");
  });

  it("fuehrt einen Fahrzeug-Code in den Check, mit Vorauswahl", () => {
    expect(tokenZielPfad("fahrzeug", "rtw-1")).toBe("/helfer/check?fz=rtw-1");
  });

  it("faellt ohne Ziel auf die allgemeine Artikel-Liste", () => {
    expect(tokenZielPfad(null, null)).toBe("/helfer");
    expect(tokenZielPfad(undefined, undefined)).toBe("/helfer");
  });

  it("faellt bei UNVOLLSTAENDIGEM Ziel zurueck, statt einen kaputten Pfad zu bauen", () => {
    // Beide Halbformen kommen aus derselben Tabelle: `zielTyp` und `zielId` sind
    // je fuer sich nullbar, und `createToken` erzwingt die Vollstaendigkeit nur
    // im Formular. Ein `/a/undefined` waere ein 404 statt einer Landung.
    expect(tokenZielPfad("artikel", null)).toBe("/helfer");
    expect(tokenZielPfad(null, "art-1")).toBe("/helfer");
    expect(tokenZielPfad("fahrzeug", "")).toBe("/helfer");
  });

  it("weist einen unbekannten Zieltyp auf die Liste", () => {
    expect(tokenZielPfad("lagerort", "x")).toBe("/helfer");
  });

  it("liefert IMMER etwas, das sanitizeReturnTo durchlaesst", () => {
    // Die Zusage, die die beiden Dateien aneinander bindet: der Rueckgabewert
    // ist ein lokaler Pfad und damit kompatibel mit dem Open-Redirect-Schutz.
    // Ohne sie koennte der Handler ein Ziel bauen, das seine eigene Pruefung
    // spaeter verwirft — und die Helferin landete am Gate statt am Kaertchenziel.
    for (const [typ, id] of [["artikel", "a"], ["fahrzeug", "f"], [null, null]] as const) {
      expect(sanitizeReturnTo(tokenZielPfad(typ, id))).toBe(tokenZielPfad(typ, id));
    }
  });
});
