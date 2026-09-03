import { describe, it, expect } from "vitest";
import { SVG_MAX_ZEICHEN, konfliktFrage, specFormFehler, svgFormFehler } from "./pruefung";

/*
 * DIESE PRUEFUNGEN SIND HYGIENE, NICHT DER RIEGEL (Spec §4.3). Der Riegel ist das
 * `<img src="data:image/svg+xml;base64,…">` auf /meine: dort fuehrt ein SVG kein
 * Script aus und laedt nichts nach. Die Form zu pruefen kostet nichts und faengt
 * den Unfall, nicht den Angriff.
 *
 * ⛔ EINE FACHLICHE PRUEFUNG GIBT ES HIER NICHT UND KANN ES NICHT GEBEN: sie
 * braeuchte `composeFromCatalog` und zoege den Katalog in den Server-Graph — M1,
 * und `pnpm build` braeche mit ERR_INVALID_ARG_TYPE.
 */
describe("Formpruefung der Spec", () => {
  it("nimmt eine gewoehnliche Spec an", () => {
    expect(specFormFehler(JSON.stringify({ kind: "formation", organization: "thw" }))).toBeNull();
  });

  it("nimmt Listen, Beschriftungen und deren Metriken an", () => {
    const spec = {
      kind: "formation",
      capabilities: ["transport"],
      labels: { center: "SEG", centerBoxMarginMm: 1.5, bottomRightMetrics: { boxWidthMm: 4 } },
    };
    expect(specFormFehler(JSON.stringify(spec))).toBeNull();
  });

  it("lehnt Unlesbares, Listen und fehlendes kind ab", () => {
    expect(specFormFehler("kein json")).toMatch(/lesen/i);
    expect(specFormFehler("[1,2]")).not.toBeNull();
    expect(specFormFehler(JSON.stringify({ organization: "thw" }))).toMatch(/Grundzeichenart/);
  });

  /*
   * ⛔ ALLE FELDNAMEN MUESSEN AUS `ORDNUNG` KOMMEN. Ein unbekanntes Feld waere
   * nicht nur unbenutzt: `kanonischerSchluessel` serialisiert nur die Felder aus
   * ORDNUNG, zwei verschiedene Zusammenstellungen fielen also auf denselben
   * Schluessel — und „schon gespeichert?" antwortete falsch.
   */
  it("lehnt ein Feld ab, das ORDNUNG nicht kennt", () => {
    expect(specFormFehler(JSON.stringify({ kind: "formation", quatsch: "x" }))).toMatch(/quatsch/);
  });

  it("lehnt eine Funktion oder einen verschachtelten Baum als Wert ab", () => {
    expect(specFormFehler(JSON.stringify({ kind: "formation", designation: [[1]] }))).not.toBeNull();
    expect(
      specFormFehler(JSON.stringify({ kind: "formation", labels: { center: { tief: {} } } })),
    ).not.toBeNull();
  });
});

describe("Formpruefung des SVG", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';

  it("nimmt ein gewoehnliches SVG an", () => {
    expect(svgFormFehler(svg)).toBeNull();
  });

  it("lehnt ab, was nicht mit <svg beginnt und mit </svg> endet", () => {
    expect(svgFormFehler(`<div>${svg}</div>`)).not.toBeNull();
    expect(svgFormFehler("")).not.toBeNull();
  });

  it("lehnt script-Tags und on-Attribute ab", () => {
    expect(svgFormFehler(`<svg><script>alert(1)</script></svg>`)).toMatch(/Script/i);
    expect(svgFormFehler(`<svg onload="x()"></svg>`)).toMatch(/Attribut/i);
    expect(svgFormFehler(`<svg ONLOAD = "x()"></svg>`)).toMatch(/Attribut/i);
  });

  /*
   * Die Obergrenze ist grosszuegig und trotzdem noetig: das Generat traegt 246
   * fertige SVGs in 381.541 B, im Schnitt also rund 1,5 KB je Zeichen bei
   * Groesse 64. 200.000 Zeichen lassen jede sinnvolle Exportgroesse durch und
   * verhindern, dass jemand die Datenbank als Ablage benutzt.
   */
  it("lehnt ein masslos grosses SVG ab", () => {
    expect(svgFormFehler(`<svg>${"x".repeat(SVG_MAX_ZEICHEN)}</svg>`)).toMatch(/groß/);
  });
});

describe("Konfliktfrage", () => {
  /*
   * BEIDE FAELLE FRAGEN ZURUECK, STATT ZU ENTSCHEIDEN (Spec §6.6). Ein
   * onConflictDoUpdate auf dem Namen ueberschriebe still fremde Arbeit; ein
   * uniqueIndex auf spec_kanon benennte ein vorhandenes Zeichen still UM.
   */
  it("fragt beim gleichen Namen nach", () => {
    expect(konfliktFrage(true, null, "")).toBe("name");
  });

  it("fragt bei gleicher Zusammenstellung nach", () => {
    expect(konfliktFrage(false, "Zugtrupp Nord", "")).toBe("zusammenstellung");
  });

  it("schweigt, wenn die passende Bestaetigung vorliegt", () => {
    expect(konfliktFrage(true, null, "ueberschreiben")).toBeNull();
    expect(konfliktFrage(false, "Zugtrupp Nord", "zusaetzlich")).toBeNull();
  });

  /*
   * DIE BESTAETIGUNG GILT NUR FUER IHREN FALL. Wer „trotzdem zusaetzlich sichern"
   * bestaetigt hat und dabei versehentlich einen vergebenen Namen tippt, bekommt
   * die Namensfrage — sonst ueberschriebe eine Bestaetigung fuer den einen Fall
   * still den anderen.
   */
  it("laesst eine Bestaetigung nicht auf den anderen Fall durchschlagen", () => {
    expect(konfliktFrage(true, null, "zusaetzlich")).toBe("name");
    expect(konfliktFrage(false, "Zugtrupp Nord", "ueberschreiben")).toBe("zusammenstellung");
  });

  /*
   * ⛔ ZWEI KONFLIKTE ZUGLEICH DUERFEN NICHT PENDELN (Review Aufgabe 7, Befund W1).
   * Lage: „X" traegt Kanon K1, „Y" traegt K2 — jetzt wird K2 unter dem Namen „X"
   * gespeichert. Beide Bedingungen sind erfuellt, und ein EINZELNES
   * `bestaetigung`-Feld kann nur eine der beiden Fragen beantworten: „Ueberschreiben"
   * loeste bisher die Zusammenstellungsfrage aus, „Trotzdem sichern" wieder die
   * Namensfrage, und so fort — zwei Kaesten wechselten sich ab, gespeichert wurde nie.
   *
   * AUFGELOEST WIRD ES DURCH DIE NAMENSFRAGE, und die Begruendung stand schon vorher
   * ueber dieser Funktion: WER UEBERSCHREIBT, LEGT NICHTS ZWEITES AN. Die Frage
   * „trotzdem zusaetzlich sichern?" hat damit keinen Gegenstand mehr.
   */
  it("pendelt nicht, wenn beide Konflikte zugleich anliegen", () => {
    expect(konfliktFrage(true, "Zugtrupp Nord", "")).toBe("name");
    expect(konfliktFrage(true, "Zugtrupp Nord", "ueberschreiben")).toBeNull();
    // „zusaetzlich" beantwortet die Namensfrage NICHT — sie bleibt stehen, und der
    // einzige Knopf daran fuehrt zu „ueberschreiben". Kein Kreis.
    expect(konfliktFrage(true, "Zugtrupp Nord", "zusaetzlich")).toBe("name");
  });
});
