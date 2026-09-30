import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BEISPIELE } from "../../_lib/beispiele";
import { teileAuf } from "../../_lib/layout/papier";
import { leererPlan } from "../../_lib/plan/operationen";
import { Blattansicht, type Rahmen } from "./Blatt";

const rahmen: Rahmen = {
  titel: "Kommunikationsplan Label", untertitel: "Label", stand: "Stand: 30.09.2026, 11:56",
  bearbeiter: "Bearbeitung: Kreisbereitschaftsleiter", vermerkVsNfD: true, organisation: "Deutsches Rotes Kreuz",
};

describe("Blattansicht", () => {
  it("A4 quer mit Kopf, Legende, Fuß und Blattzähler", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    const html = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={rahmen} symbole={{}} />);
    expect(html).toMatch(/<svg[^>]*class="kp-blatt"[^>]*>/);
    expect(html).toContain('width="297mm"');
    expect(html).toContain('height="210mm"');
    expect(html).toContain('data-blatt="1"');
    for (const t of ["Kommunikationsplan Label", "VS – nur für den Dienstgebrauch", "Stand: 30.09.2026, 11:56", "Blatt 1 von 1", "Digitalfunk TMO", "Deutsches Rotes Kreuz"]) {
      expect(html).toContain(t);
    }
    expect(html).toMatch(/transform="translate\([\d.]+ [\d.]+\) scale\([\d.]+\)"/);
  });
  it("ohne VS-NfD-Vermerk steht er nicht da", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    expect(renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={{ ...rahmen, vermerkVsNfD: false }} symbole={{}} />))
      .not.toContain("nur für den Dienstgebrauch");
  });
  it("leerer Plan: ein Blatt mit Hinweis statt einer leeren Fläche", () => {
    const [blatt] = teileAuf(leererPlan(), "a4-quer");
    expect(renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={rahmen} symbole={{}} />)).toContain("Dieser Plan hat noch keine Stellen.");
  });
  it("mitDefs={false} lässt die Symbole weg (die Druckseite liefert sie einmal für alle Blätter)", () => {
    const [blatt] = teileAuf(BEISPIELE[0].inhalt, "a4-quer");
    expect(renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={rahmen} symbole={{}} mitDefs={false} />)).not.toContain("<symbol");
  });
});
