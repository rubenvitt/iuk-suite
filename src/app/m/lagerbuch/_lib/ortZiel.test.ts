import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ortZielPfad } from "./ortZiel";
import { tokenZielPfad } from "./tokenZiel";

/**
 * DRK-312 — wohin ein gescanntes Ortsetikett fuehrt.
 */
describe("ortZielPfad", () => {
  it("schickt eine Einheit auf ihren Check, mit ihr vorgewaehlt", () => {
    expect(ortZielPfad({ id: "rtw-1", typ: "fahrzeug" })).toBe("/helfer/check?fz=rtw-1");
  });

  /** Taschen sind `typ: "fahrzeug"` (DRK-309) und landen deshalb genauso. */
  it("behandelt eine Tasche wie ein Fahrzeug — sie IST ein typ:fahrzeug", () => {
    expect(ortZielPfad({ id: "tasche-san", typ: "fahrzeug" })).toBe("/helfer/check?fz=tasche-san");
  });

  it("schickt den Handlager auf die Artikelliste", () => {
    expect(ortZielPfad({ id: "handlager", typ: "lager" })).toBe("/helfer");
  });

  /**
   * ⚠️ DIE ID EINES LAGERS DARF NICHT IN DEN PFAD DURCHRUTSCHEN. Ein
   * `/helfer/check?fz=handlager` waere typkorrekt und saehe richtig aus — die
   * Fahrzeugwahl dort kennt den Handlager aber nicht, und die Seite faellt
   * still auf „nichts gewaehlt" zurueck. Der Fehler ist am Ergebnis nicht
   * abzulesen, nur am Pfad.
   */
  it("haengt die Id eines Lagers NIRGENDS an", () => {
    expect(ortZielPfad({ id: "handlager", typ: "lager" })).not.toContain("handlager");
  });

  /**
   * DIE EIGENTLICHE ZUSAGE DIESER DATEI: Etikett und Kaertchen beantworten
   * dieselbe Frage mit derselben Funktion. Liefe das auseinander, zeigte ein
   * gescanntes Etikett woanders hin als ein Kaertchen, das auf dieselbe Einheit
   * gebunden ist — und niemand faende den Unterschied, ohne beide nebeneinander
   * auszuprobieren.
   */
  it("gibt fuer eine Einheit ZEICHENGLEICH dasselbe wie das gebundene Kaertchen", () => {
    for (const id of ["rtw-1", "ktw-1", "tasche-san"]) {
      expect(ortZielPfad({ id, typ: "fahrzeug" })).toBe(tokenZielPfad("fahrzeug", id));
    }
  });

  /**
   * ⚠️ DER RUECKGABEWERT LANDET IN EINEM `redirect()` UND DAMIT BEIM BROWSER.
   * Ein innerer Pfad (`/m/lagerbuch/...`) wuerde von `decideRoute` ein zweites
   * Mal praefixiert (Falle 49), ein absoluter oeffnete einen Open Redirect.
   */
  it("liefert ausschliesslich lokale, aeussere Pfade", () => {
    for (const ort of [
      { id: "rtw-1", typ: "fahrzeug" as const },
      { id: "handlager", typ: "lager" as const },
    ]) {
      const pfad = ortZielPfad(ort);
      expect(pfad).toMatch(/^\/helfer/);
      expect(pfad).not.toMatch(/^\/m\/lagerbuch/);
      expect(pfad).not.toMatch(/^https?:/);
    }
  });

  /**
   * ⚠️ DER SCAN IST DER TEIL, DEN DIE VIER WERTETESTS OBEN NICHT HALTEN: sie
   * blieben alle gruen, wenn jemand `/helfer/check?fz=` hier direkt
   * hinschriebe. Genau das waere die zweite Wahrheit, gegen die die Datei
   * gebaut ist — sie faellt erst auf, wenn die Check-Strecke umzieht und nur
   * eine der beiden Stellen mitwandert.
   */
  it("baut den Pfad NICHT selbst, sondern ueber tokenZielPfad", () => {
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/ortZiel.ts", "utf8");
    const code = quelle.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/\btokenZielPfad\s*\(/);
    expect(code).not.toContain("/helfer/check");
  });
});
