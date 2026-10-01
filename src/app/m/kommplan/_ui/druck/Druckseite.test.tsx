import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BEISPIELE } from "../../_lib/beispiele";
import { teileAuf } from "../../_lib/layout/papier";
import type { Rahmen } from "../zeichnung/Blatt";
import { Druckseite } from "./Druckseite";

const RAHMEN: Rahmen = { titel: "T", untertitel: null, stand: "Stand", bearbeiter: "B", vermerkVsNfD: false, organisation: null, logo: null };
const SCHRIFT = { familie: "Arimo", klasse: "arimo" };

describe("Druckseite (Entscheidung 13)", () => {
  it("trägt das Format am gemeinsamen Vorfahren (benanntes @page) und alle Blätter", () => {
    const gross = BEISPIELE.find((b) => b.id === "beispiel-grosse-stabslage")!;
    const blaetter = teileAuf(gross.inhalt, "a3-quer");
    const html = renderToStaticMarkup(<Druckseite schrift={SCHRIFT} daten={{ format: "a3-quer", blaetter, rahmen: RAHMEN, symbole: {} }} />);
    expect(html).toMatch(/<main class="kp-druck arimo" data-format="a3-quer">/);
    expect(html.split('class="kp-blatt"').length - 1).toBe(blaetter.length);
    expect(html).toContain('width="420mm"');
  });
  it("nicht lesbar: ein Satz, kein Druckanstoß, dasselbe Format", () => {
    const html = renderToStaticMarkup(<Druckseite schrift={SCHRIFT} daten={{ format: "a4-quer", blaetter: null, rahmen: RAHMEN, symbole: {} }} />);
    expect(html).toContain('data-format="a4-quer"');
    expect(html).toContain("Dieser Plan lässt sich nicht lesen.");
    expect(html).not.toContain("kp-druck-knopf");
  });
});
