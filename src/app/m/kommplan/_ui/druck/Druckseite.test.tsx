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
    const html = renderToStaticMarkup(<Druckseite schrift={SCHRIFT} daten={{ format: "a3-quer", blaetter, rahmen: RAHMEN, symbole: {}, qrSatz: null, svgExport: null }} />);
    expect(html).toMatch(/<main class="kp-druck arimo" data-format="a3-quer">/);
    expect(html.split('class="kp-blatt"').length - 1).toBe(blaetter.length);
    expect(html).toContain('width="420mm"');
  });
  it("nicht lesbar: ein Satz, kein Druckanstoß, dasselbe Format", () => {
    const html = renderToStaticMarkup(<Druckseite schrift={SCHRIFT} daten={{ format: "a4-quer", blaetter: null, rahmen: RAHMEN, symbole: {}, qrSatz: null, svgExport: null }} />);
    expect(html).toContain('data-format="a4-quer"');
    expect(html).toContain("Dieser Plan lässt sich nicht lesen.");
    expect(html).not.toContain("kp-druck-knopf");
  });
  it("QR-Satz in der noprint-Leiste (Entscheidung 10)", () => {
    const html = renderToStaticMarkup(<Druckseite schrift={SCHRIFT} daten={{ format: "a4-quer", blaetter: [], rahmen: RAHMEN, symbole: {}, qrSatz: "Der QR-Code führt auf „Aushang“ – unbegrenzt gültig.", svgExport: null }} />);
    expect(html).toMatch(/class="noprint[^"]*"[^>]*data-qr-satz=""[^>]*>Der QR-Code führt auf/);
  });
  it("mit SVG-Export: über jedem Blatt ein Knopf mit ASCII-Dateinamen; ohne (Token-Druck) keiner", () => {
    const gross = BEISPIELE.find((b) => b.id === "beispiel-grosse-stabslage")!;
    const blaetter = teileAuf(gross.inhalt, "a4-quer");
    const daten = { format: "a4-quer" as const, blaetter, rahmen: RAHMEN, symbole: {}, qrSatz: null };
    const mit = renderToStaticMarkup(<Druckseite schrift={SCHRIFT} daten={{ ...daten, svgExport: { titel: "Große Stab-Lage", tag: "2026-10-01" } }} />);
    expect(mit.split("SVG herunterladen (Blatt").length - 1).toBe(blaetter.length);
    expect(mit).toContain(`SVG herunterladen (Blatt 1 von ${blaetter.length})`);
    const ohne = renderToStaticMarkup(<Druckseite schrift={SCHRIFT} daten={{ ...daten, svgExport: null }} />);
    expect(ohne).not.toContain("SVG herunterladen");
  });
});
