import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { kaertchenFuehrtInsHandlager, ortZielPfad } from "./ortZiel";
import { tokenZielPfad } from "./tokenZiel";

/**
 * DRK-312 — wohin ein gescanntes Ortsetikett fuehrt.
 */
const EINHEIT = { id: "rtw-1", typ: "fahrzeug" as const };
const TASCHE = { id: "tasche-san", typ: "fahrzeug" as const };
const LAGER = { id: "handlager", typ: "lager" as const };

describe("ortZielPfad — ohne gebundenes Kaertchen", () => {
  it("schickt eine Einheit auf ihren Check, mit ihr vorgewaehlt", () => {
    expect(ortZielPfad(EINHEIT, null)).toBe("/helfer/check?fz=rtw-1");
  });

  /** Taschen sind `typ: "fahrzeug"` (DRK-309) und landen deshalb genauso. */
  it("behandelt eine Tasche wie ein Fahrzeug — sie IST ein typ:fahrzeug", () => {
    expect(ortZielPfad(TASCHE, null)).toBe("/helfer/check?fz=tasche-san");
  });

  it("schickt den Handlager auf die Artikelliste", () => {
    expect(ortZielPfad(LAGER, null)).toBe("/helfer");
  });

  /**
   * ⚠️ DIE ID EINES LAGERS DARF NICHT IN DEN PFAD DURCHRUTSCHEN. Ein
   * `/helfer/check?fz=handlager` waere typkorrekt und saehe richtig aus — die
   * Fahrzeugwahl dort kennt den Handlager aber nicht, und die Seite faellt
   * still auf „nichts gewaehlt" zurueck. Der Fehler ist am Ergebnis nicht
   * abzulesen, nur am Pfad.
   */
  it("haengt die Id eines Lagers NIRGENDS an", () => {
    expect(ortZielPfad(LAGER, null)).not.toContain("handlager");
  });

  /**
   * `null` heisst „zu dieser Adresse gehoert heute kein Etikett" — unbekannte
   * Id, stillgelegte Einheit, Schrank. Die Artikelliste ist der Ort, an dem
   * jemand mit einem veralteten Kaertchen in der Hand weiterkommt; eine 404
   * waere eine Sackgasse.
   */
  it("faellt fuer einen Ort ohne Etikett auf die Artikelliste zurueck", () => {
    expect(ortZielPfad(null, null)).toBe("/helfer");
  });
});

/**
 * DER BEFUND, UM DESSENTWILLEN DIE FUNKTION DIE BINDUNG UEBERHAUPT KENNT
 * (Codex P1 zu PR #177, an `helfer/check/page.tsx` nachgeprueft).
 *
 * Die Check-Seite waehlt `gebunden ?? (fz ? … )` — die Bindung des Kaertchens
 * schlaegt den Suchparameter, und zwar mit Absicht (DRK-302: `?fz=` ist
 * Nutzereingabe und als Beleg wertlos). Ein `/o/<B>`, das blind auf `?fz=B`
 * zeigte, erzeugte damit den teuersten stillen Ausgang dieses Tickets: Adresse
 * sagt B, Bildschirm zeigt A, gezaehlt wird der Inhalt von B in das Buch von A.
 */
describe("ortZielPfad — mit gebundenem Kaertchen", () => {
  it("laesst die Bindung gewinnen, wenn eine FREMDE Einheit gescannt wird", () => {
    expect(ortZielPfad({ id: "ktw-1", typ: "fahrzeug" }, "rtw-1"))
      .toBe("/helfer/check?fz=rtw-1");
  });

  /**
   * ⚠️ DIE SCHARFE FORM DERSELBEN AUSSAGE: die gescannte Id darf im Pfad GAR
   * NICHT MEHR VORKOMMEN. Ein `?fz=ktw-1` waere genau die Adresse, die etwas
   * anderes behauptet als der Bildschirm — und ein Test auf „enthaelt rtw-1"
   * allein bliebe fuer `?fz=ktw-1&fz=rtw-1` gruen.
   */
  it("laesst die gescannte Id dabei nirgends im Pfad stehen", () => {
    expect(ortZielPfad({ id: "ktw-1", typ: "fahrzeug" }, "rtw-1")).not.toContain("ktw-1");
  });

  it("aendert nichts, wenn die gescannte Einheit die gebundene IST", () => {
    expect(ortZielPfad(EINHEIT, "rtw-1")).toBe("/helfer/check?fz=rtw-1");
  });

  /**
   * ⚠️ FUER EIN LAGER GILT DIE BINDUNG NICHT. `/helfer` ist die Artikelliste des
   * Handlagers und an keine Einheit gebunden — es gaebe hier nichts zu
   * verfaelschen. Zoege man die Bindung durch, landete jemand, der am REGAL
   * steht und das Regal-Etikett scannt, im Fahrzeug-Check: dieselbe
   * Verwechslung, nur andersherum.
   */
  it("schickt einen Lager-Scan trotz Bindung auf die Artikelliste", () => {
    expect(ortZielPfad(LAGER, "rtw-1")).toBe("/helfer");
  });

  /** Ohne Etikett bleibt es bei der Artikelliste, auch mit Bindung. */
  it("faellt ohne Etikett weiterhin auf die Artikelliste zurueck", () => {
    expect(ortZielPfad(null, "rtw-1")).toBe("/helfer");
  });
});

describe("ortZielPfad — Form und Herkunft des Pfades", () => {
  /**
   * DIE EIGENTLICHE ZUSAGE DIESER DATEI: Etikett und Kaertchen beantworten
   * dieselbe Frage mit derselben Funktion. Liefe das auseinander, zeigte ein
   * gescanntes Etikett woanders hin als ein Kaertchen, das auf dieselbe Einheit
   * gebunden ist — und niemand faende den Unterschied, ohne beide nebeneinander
   * auszuprobieren.
   */
  it("gibt fuer eine Einheit ZEICHENGLEICH dasselbe wie das gebundene Kaertchen", () => {
    for (const id of ["rtw-1", "ktw-1", "tasche-san"]) {
      expect(ortZielPfad({ id, typ: "fahrzeug" }, null)).toBe(tokenZielPfad("fahrzeug", id));
    }
  });

  /**
   * ⚠️ DER RUECKGABEWERT LANDET IN EINEM `redirect()` UND DAMIT BEIM BROWSER.
   * Ein innerer Pfad (`/m/lagerbuch/...`) wuerde von `decideRoute` ein zweites
   * Mal praefixiert (Falle 49), ein absoluter oeffnete einen Open Redirect.
   */
  it("liefert ausschliesslich lokale, aeussere Pfade", () => {
    for (const [ort, bindung] of [
      [EINHEIT, null], [LAGER, null], [null, "rtw-1"], [EINHEIT, "ktw-1"],
    ] as const) {
      const pfad = ortZielPfad(ort, bindung);
      expect(pfad).toMatch(/^\/helfer/);
      expect(pfad).not.toMatch(/^\/m\/lagerbuch/);
      expect(pfad).not.toMatch(/^https?:/);
    }
  });

  /**
   * ⚠️ DER SCAN IST DER TEIL, DEN DIE WERTETESTS OBEN NICHT HALTEN: sie blieben
   * alle gruen, wenn jemand `/helfer/check?fz=` hier direkt hinschriebe. Genau
   * das waere die zweite Wahrheit, gegen die die Datei gebaut ist — sie faellt
   * erst auf, wenn die Check-Strecke umzieht und nur eine der beiden Stellen
   * mitwandert.
   */
  it("baut den Pfad NICHT selbst, sondern ueber tokenZielPfad", () => {
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/ortZiel.ts", "utf8");
    const code = quelle.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/\btokenZielPfad\s*\(/);
    expect(code).not.toContain("/helfer/check");
  });
});

/**
 * DRK-395 — welches Kaertchen auf die Handlager-Karte darf.
 */
describe("kaertchenFuehrtInsHandlager", () => {
  it("nimmt ein Kaertchen ohne Ziel", () => {
    expect(kaertchenFuehrtInsHandlager(null, null)).toBe(true);
    expect(kaertchenFuehrtInsHandlager(undefined, undefined)).toBe(true);
  });

  it("weist ein Kaertchen mit Fahrzeug- oder Artikelziel ab", () => {
    expect(kaertchenFuehrtInsHandlager("fahrzeug", "rtw-1")).toBe(false);
    expect(kaertchenFuehrtInsHandlager("artikel", "art-1")).toBe(false);
  });

  /**
   * ⚠️ DIE HALBFORM LANDET TATSAECHLICH AUF DER ARTIKELLISTE — `tokenZielPfad`
   * faellt ohne `zielId` in seinen Rueckfall. Sie DARF also auf die Karte, und
   * dieser Test haelt fest, dass hier nichts zusaetzlich gefiltert wird: die
   * Frage lautet „wo landet der Scan?", nicht „wie ist die Zeile gefuellt?".
   */
  it("richtet sich nach der LANDUNG, nicht nach der Form der Zeile", () => {
    expect(tokenZielPfad("artikel", null)).toBe("/helfer");
    expect(kaertchenFuehrtInsHandlager("artikel", null)).toBe(true);
  });

  /**
   * ⚠️ KEIN LITERAL `/helfer` IN DER FUNKTION. Ein hingeschriebener Pfad waere
   * eine zweite Wahrheit ueber die Landung — und sie faellt still aus: der
   * Filter liefe leer, der Ortskarten-Bogen boete kein Kaertchen mehr an, und
   * kein Tor meldete etwas.
   */
  it("vergleicht gegen tokenZielPfad, statt den Pfad hinzuschreiben", () => {
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/ortZiel.ts", "utf8");
    const code = quelle.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toContain('"/helfer"');
  });
});
