import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { rechne, type Eingabe } from "../_lib/rechner";
import { Druckblatt } from "./Druckblatt";

const blatt = (e: Eingabe) => renderToString(<Druckblatt eingabe={e} er={rechne(e)} erstellt="02.11.2026, 20:15" />);

describe("Druckblatt", () => {
  it("trägt Kopffelder, Grundlage, Kennzahlen und Bedarf mit Ist-Spalte", () => {
    const html = blatt({ weg: "personen", trennung: true, personen: { maenner: 50, frauen: 50 } });
    for (const t of ["Notunterkunft · Bedarf", "Erstellt 02.11.2026, 20:15", "Einsatz", "Objekt / Ort", "Erstellt von",
      "Grundlage: Personen, Männer und Frauen getrennt", "Feldbetten", "Urinale", "Isolierstation", "Biergarnituren"]) {
      expect(html).toContain(t);
    }
    expect(html.match(/>Ist</g)).toHaveLength(6);
    expect(html).toContain("Annahme");
  });

  it("listet bei Räumen jeden Raum mit seinen Plätzen", () => {
    const html = blatt({ weg: "raeume", trennung: false, raeume: [{ bezeichnung: "Halle", laenge_m: 15, breite_m: 13.5, abzuege: [{ laenge_m: 4, breite_m: 2.5 }] }] });
    expect(html).toContain("Halle");
    expect(html).toContain("15 × 13,5 m");
    expect(html).toContain("4 × 2,5");
    expect(html).toContain("192,5 m²");
  });
});
