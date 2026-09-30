import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BEISPIELE } from "../../_lib/beispiele";
import { baue } from "../../_lib/beispiele/bau";
import { teileAuf } from "../../_lib/layout/papier";
import { zeichne } from "../../_lib/layout/zeichne";
import { PIKTOGRAMME } from "../../_lib/zeichen/grundlagen";
import zeichen from "../../_lib/zeichen/zeichen.generiert.json";
import { FARBE } from "./farben";
import { symbolId } from "./Symbole";
import { Zeichnung } from "./Zeichnung";

const alle = zeichen.zeichen as Record<string, { viewBox: string; inhalt: string }>;
const einsatz = BEISPIELE[0];
const symbole = Object.fromEntries(
  [...new Set(einsatz.inhalt.stellen.map((s) => s.zeichen).filter((z): z is string => z !== null))].map((k) => [k, alle[k]]),
);
const zaehle = (html: string, teil: string) => html.split(teil).length - 1;

describe("Zeichnung", () => {
  const daten = zeichne(einsatz.inhalt, "bildschirm");
  const html = renderToStaticMarkup(<Zeichnung daten={daten} symbole={symbole} titel={einsatz.titel} schrift="Arimo" />);

  it("jede Karte, Einheit, Linie und jedes Sechseck erscheint", () => {
    expect(zaehle(html, "data-karte=")).toBe(daten.karten.length);
    expect(zaehle(html, "data-einheit=")).toBe(daten.einheiten.length);
    expect(zaehle(html, "<line")).toBeGreaterThanOrEqual(daten.linien.length);
    expect(zaehle(html, "data-sechseck=")).toBe(daten.sechsecke.length);
  });
  it("jedes Symbol steht genau einmal in defs und wird per use referenziert (M11)", () => {
    expect(zaehle(html, `id="${symbolId("zusatz:eal")}"`)).toBe(1);
    expect(zaehle(html, `href="#${symbolId("zusatz:eal")}"`)).toBe(4);
    for (const k of Object.keys(PIKTOGRAMME)) expect(zaehle(html, `id="${symbolId(k)}"`)).toBe(1);
  });
  it("die Schrift kommt vom Wurzel-svg, die Größe in mm", () => {
    expect(html).toMatch(/<svg[^>]*style="font-family:Arimo/);
    expect(html).toMatch(/width="[\d.]+mm"/);
  });
  it("eine hervorgehobene Karte trägt die Hervorhebungsfarbe", () => {
    const label = BEISPIELE.find((b) => b.id === "vorlage-kommunikationsplan-label")!;
    const h = renderToStaticMarkup(<Zeichnung daten={zeichne(label.inhalt, "bildschirm")} symbole={{}} titel="x" />);
    expect(h).toContain(FARBE.hervor);
  });
  it("die Anker-Karte eines Folgeblatts ist grau, ihr Zeichen blass; die übrigen Karten schwarz", () => {
    const stab = BEISPIELE.find((b) => b.id === "beispiel-grosse-stabslage")!;
    const blatt = teileAuf(stab.inhalt, "a4-quer").find((b) => b.ankerId !== null)!;
    const h = renderToStaticMarkup(<Zeichnung daten={blatt.zeichnung} symbole={{}} titel="x" />);
    const karte = (id: string) => { const a = h.indexOf(`data-karte="${id}"`); return h.slice(a, h.indexOf("</g>", h.indexOf("</title>", a))); };
    const anker = h.slice(h.indexOf(`data-karte="${blatt.ankerId}"`), h.indexOf(`data-karte="${blatt.wurzelId}"`));
    expect(anker).toContain('data-art="anker"');
    expect(anker).toContain(`stroke="${FARBE.anker}"`);
    expect(anker).not.toContain(`stroke="${FARBE.tinte}"`);
    if (stab.inhalt.stellen.find((s) => s.id === blatt.ankerId)?.zeichen) expect(anker).toContain('opacity="0.45"');
    expect(karte(blatt.wurzelId!)).toContain(`stroke="${FARBE.tinte}"`);
    expect(karte(blatt.wurzelId!)).not.toContain(FARBE.anker);
  });
  it("ein gekürzter Titel zeigt „…\" und trägt den vollen Text als title; eine lange Einheit steht in zwei Zeilen ganz da", () => {
    const lang = "Bereitstellungsraumkoordinationsstelle Behandlungsplatz Sanitätsdienst Logistik Technik Nord";
    const inhalt = baue({ stellen: [{ id: "a", titel: lang, einheiten: [["GW Betreuung", "RK LG 45-74-10"]] }] });
    const d = zeichne(inhalt, "bildschirm");
    expect(d.karten[0].gekuerzt).toBe(true);
    const h = renderToStaticMarkup(<Zeichnung daten={d} symbole={{}} titel="x" />);
    expect(h).toContain(`<title>${lang}</title>`);
    const karte = h.slice(h.indexOf('data-karte="a"'), h.indexOf("data-einheit="));
    expect(karte).toContain("…");
    expect(karte).not.toContain(">Nord<");
    const einheit = h.slice(h.indexOf("data-einheit="));
    expect(einheit).toMatch(/>GW Betreuung<\/text>/);
    expect(einheit).toMatch(/>RK LG 45-74-10<\/text>/);
    expect(einheit).not.toContain("…");
  });
});
