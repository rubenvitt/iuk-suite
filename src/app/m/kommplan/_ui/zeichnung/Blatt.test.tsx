import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BEISPIELE } from "../../_lib/beispiele";
import { teileAuf } from "../../_lib/layout/papier";
import { leererPlan } from "../../_lib/plan/operationen";
import { textBreite } from "../../_lib/layout/text";
import { Blattansicht, kopfTitel, type Rahmen } from "./Blatt";

const rahmen: Rahmen = {
  titel: "Kommunikationsplan Label", untertitel: "Label", stand: "Stand: 30.09.2026, 11:56",
  bearbeiter: "Bearbeitung: Kreisbereitschaftsleiter", vermerkVsNfD: true, organisation: null, logo: null,
};

describe("Blattansicht", () => {
  it("A3 quer: 420 × 297 mm, Fuß und Legende am unteren Rand des A3-Blatts", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a3-quer");
    const html = renderToStaticMarkup(<Blattansicht format="a3-quer" blatt={blatt} rahmen={rahmen} symbole={{}} />);
    expect(html).toContain('width="420mm"');
    expect(html).toContain('height="297mm"');
    expect(html).toContain('viewBox="0 0 420 297"');
    const fussY = Number(/<text x="410"[^>]*y="([\d.]+)"[^>]*>Blatt 1 von 1/.exec(html)?.[1]);
    expect(fussY).toBeCloseTo(297 - 8 - 2, 6); // BLATT.randUnten + 2 über der Unterkante, rechts bei 420 − randX
  });
  it("A4 quer mit Kopf, Legende, Fuß und Blattzähler", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    const html = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={rahmen} symbole={{}} />);
    expect(html).toMatch(/<svg[^>]*class="kp-blatt"[^>]*>/);
    expect(html).toContain('width="297mm"');
    expect(html).toContain('height="210mm"');
    expect(html).toContain('data-blatt="1"');
    for (const t of ["Kommunikationsplan Label", "VS – nur für den Dienstgebrauch", "Stand: 30.09.2026, 11:56", "Blatt 1 von 1", "Digitalfunk TMO"]) {
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
  it("ohne Briefkopf steht im Kopf nichts: kein Name, kein Logo, kein Rot (Spec §4.4)", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    const html = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={rahmen} symbole={{}} />);
    expect(html).not.toMatch(/data-organisation|data-logo|<image|kp-logo/);
    expect(html.toLowerCase()).not.toContain("#c8000f");
  });
  it("ein 200-Zeichen-Titel läuft nie in Organisation oder Logo-Box: erst kleiner, dann gekürzt (Kritik)", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    const lang = "Kommunikationsplan Großeinsatz ".repeat(7).slice(0, 200);
    const logo = { href: "data:image/png;base64,iVBORw0KGgo=" };
    const html = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={{ ...rahmen, titel: lang, organisation: "Musterorganisation", logo }} symbole={{}} />);
    const platz = 244 - textBreite("Musterorganisation", 9, true) - 3 - 10; // Organisation links von der Box, Luft, Rand
    const k = kopfTitel(lang, platz);
    expect(k.groesse).toBe(10);
    expect(k.text.endsWith("…")).toBe(true);
    expect(textBreite(k.text, k.groesse, true)).toBeLessThanOrEqual(platz);
    expect(html).toContain(`>${k.text}</text>`);
    expect(kopfTitel("Kurz", 100)).toEqual({ text: "Kurz", groesse: 14 });
    expect(kopfTitel("Ein mittellanger Plantitel", textBreite("Ein mittellanger Plantitel", 12, true)).groesse).toBe(12);
  });
  it("nur Organisation: rechtsbündig am Rand; mit Logo: links neben der Logo-Box, Logo per <use>", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    const nurName = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={{ ...rahmen, organisation: "Musterorganisation" }} symbole={{}} />);
    expect(nurName).toMatch(/<text x="287"[^>]*text-anchor="end"[^>]*data-organisation="">Musterorganisation<\/text>/);
    const logo = { href: "data:image/png;base64,iVBORw0KGgo=" };
    const mit = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={{ ...rahmen, organisation: "Musterorganisation", logo }} symbole={{}} />);
    expect(mit).toMatch(/<text x="244"[^>]*data-organisation="">Musterorganisation/);
    // renderToStaticMarkup schließt SVG-Elemente mit eigenem End-Tag (`<use …></use>`), nicht mit `/>` — deshalb `[^>]*>`.
    expect(mit).toMatch(/<use href="#kp-logo" x="247" y="8" data-logo=""[^>]*>/);
    expect(mit).toMatch(/<image id="kp-logo" width="40" height="11" preserveAspectRatio="xMaxYMid meet" href="data:image\/png;base64,iVBORw0KGgo="[^>]*>/);
  });
});
