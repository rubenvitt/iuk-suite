import { describe, it, expect } from "vitest";
import { normalisiereBarcode } from "./barcode";

describe("normalisiereBarcode — der Vertrag mit der Aussenwelt", () => {
  it("trimmt einen rohen Code", () => {
    // Der Abgleich ist binaer: `geraete.ts:77` und `bz.ts:120` vergleichen auf
    // Gleichheit gegen Spalten OHNE COLLATE (Falle 29).
    expect(normalisiereBarcode("  SN-1  ")).toBe("SN-1");
    expect(normalisiereBarcode("SN-1\n")).toBe("SN-1");
    expect(normalisiereBarcode("\tSN-1")).toBe("SN-1");
  });

  it("zieht das Segment aus einem /g/<code>-Deep-Link — deshalb ueberlebt ein Aufkleber einen Domainwechsel", () => {
    expect(normalisiereBarcode("https://alt.example/g/SN-1")).toBe("SN-1");
    expect(normalisiereBarcode("https://lagerbuch.iuk-ue.de/g/SN-1")).toBe("SN-1");
    expect(normalisiereBarcode("http://192.168.1.5:3000/g/SN-1")).toBe("SN-1");
  });

  it("dekodiert das Segment — ein Schraegstrich in der Seriennummer ueberlebt", () => {
    // Ohne decodeURIComponent suchte der Abgleich nach „SN%2F1" und faende nie.
    expect(normalisiereBarcode("https://alt.example/g/SN%2F1")).toBe("SN/1");
    expect(normalisiereBarcode("https://alt.example/g/SN%20A")).toBe("SN A");
  });

  it("schneidet Query und Fragment ab — sie gehoeren nicht zum Code", () => {
    expect(normalisiereBarcode("https://alt.example/g/SN-1?utm=qr")).toBe("SN-1");
    expect(normalisiereBarcode("https://alt.example/g/SN-1#oben")).toBe("SN-1");
  });

  it("trimmt AUCH das Ergebnis aus dem Deep-Link", () => {
    // Ein %20 am Ende des Segments waere sonst ein unsichtbarer Nichttreffer.
    expect(normalisiereBarcode("https://alt.example/g/SN-1%20")).toBe("SN-1");
  });

  it("laesst einen Wert ohne /g/ unveraendert (nur getrimmt)", () => {
    // Hersteller-EANs und CODE_128-Seriennummern kommen ohne jede URL herein.
    expect(normalisiereBarcode("4006381333931")).toBe("4006381333931");
    expect(normalisiereBarcode(" 4006381333931 ")).toBe("4006381333931");
    expect(normalisiereBarcode("https://alt.example/a/V1StGXR8")).toBe("https://alt.example/a/V1StGXR8");
  });

  it("aendert die GROSS-/KLEINSCHREIBUNG NICHT", () => {
    // Anders als `normalisiereCode` (Teil 2, T17): dort ist der Wertebereich sechs
    // ZIFFERN, hier ist er eine fremde Seriennummer. Ein toUpperCase() machte aus
    // einem gespeicherten „sn-1" einen Nichttreffer — und die Spalte hat kein COLLATE.
    expect(normalisiereBarcode("sn-1")).toBe("sn-1");
    expect(normalisiereBarcode("https://alt.example/g/sn-1")).toBe("sn-1");
  });

  it("ist idempotent — zweimal angewandt aendert nichts", () => {
    // Der Cutover-Import ruft sie (§4.8), der Scanner ruft sie, die Action ruft sie.
    // Drei Anwendungen auf denselben Wert duerfen nicht driften.
    const roh = "https://alt.example/g/SN%2F1 ";
    expect(normalisiereBarcode(normalisiereBarcode(roh))).toBe(normalisiereBarcode(roh));
  });

  it("wirft NIE — auch nicht bei kaputtem Prozentzeichen", () => {
    // `decodeURIComponent("%")` wirft URIError. Ein Wurf hier waere ein Absturz
    // mitten im Scannen, ausgeloest von einem fremd gedruckten Aufkleber.
    expect(() => normalisiereBarcode("https://alt.example/g/SN%")).not.toThrow();
    expect(normalisiereBarcode("https://alt.example/g/SN%")).toBe("SN%");
  });

  it("liefert den leeren String fuer leere Eingabe", () => {
    expect(normalisiereBarcode("")).toBe("");
    expect(normalisiereBarcode("   ")).toBe("");
  });
});
