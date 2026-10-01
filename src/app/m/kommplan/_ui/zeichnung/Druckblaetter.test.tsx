import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BEISPIELE } from "../../_lib/beispiele";
import { teileAuf } from "../../_lib/layout/papier";
import type { Rahmen } from "./Blatt";
import { Druckblaetter } from "./Druckblaetter";

const RAHMEN: Rahmen = { titel: "T", untertitel: null, stand: "Stand", bearbeiter: "B", vermerkVsNfD: true, organisation: "Musterorganisation", logo: { href: "data:image/png;base64,QUJD" } };
const zaehle = (s: string, t: string) => s.split(t).length - 1;

describe("Druckblaetter", () => {
  it("das Logo steht EINMAL im Dokument, jedes Blatt verweist darauf (Entscheidung 6)", () => {
    const gross = BEISPIELE.find((b) => b.id === "beispiel-grosse-stabslage")!;
    const blaetter = teileAuf(gross.inhalt, "a4-quer");
    expect(blaetter.length).toBeGreaterThan(1);
    const html = renderToStaticMarkup(<Druckblaetter blaetter={blaetter} rahmen={RAHMEN} symbole={{}} schrift="Arimo" />);
    expect(zaehle(html, "data:image/png;base64,QUJD")).toBe(1);
    expect(zaehle(html, 'href="#kp-logo"')).toBe(blaetter.length);
    expect(zaehle(html, 'class="kp-blatt"')).toBe(blaetter.length);
  });
  it("ohne Logo kein <image> und kein Verweis", () => {
    const blaetter = teileAuf(BEISPIELE[0].inhalt, "a4-quer");
    const html = renderToStaticMarkup(<Druckblaetter blaetter={blaetter} rahmen={{ ...RAHMEN, logo: null }} symbole={{}} schrift="Arimo" />);
    expect(html).not.toMatch(/<image|kp-logo/);
  });
});
