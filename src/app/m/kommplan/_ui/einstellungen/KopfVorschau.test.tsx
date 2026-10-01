import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KopfVorschau } from "./KopfVorschau";

describe("KopfVorschau", () => {
  it("zeigt den Kopf, wie er gedruckt wird — mit Logo einmal als <image>, mit Namen", () => {
    const html = renderToStaticMarkup(<KopfVorschau kopf={{ organisation: "Musterorganisation", logo: { href: "data:image/png;base64,QUJD" } }} />);
    expect(html).toContain('aria-label="Vorschau des Kopfs: Musterorganisation, mit Logo"');
    expect(html.split("data:image/png;base64,QUJD").length - 1).toBe(1);
    expect(html).toContain('href="#kp-logo"');
    expect(html).toContain("Musterorganisation");
  });
  it("ohne Briefkopf: leerer Platz, ausdrücklich so benannt", () => {
    const html = renderToStaticMarkup(<KopfVorschau kopf={{ organisation: null, logo: null }} />);
    expect(html).toContain('aria-label="Vorschau des Kopfs: ohne Organisation, ohne Logo"');
    expect(html).not.toMatch(/<image|data-organisation/);
  });
});
