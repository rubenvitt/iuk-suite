import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BEISPIELE } from "../../_lib/beispiele";
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
  it("hervorgehobene und Anker-Karten tragen ihre Farben", () => {
    const label = BEISPIELE.find((b) => b.id === "vorlage-kommunikationsplan-label")!;
    const h = renderToStaticMarkup(<Zeichnung daten={zeichne(label.inhalt, "bildschirm")} symbole={{}} titel="x" />);
    expect(h).toContain(FARBE.hervor);
  });
  it("gekürzte Titel und Einheiten tragen den vollen Text als title", () => {
    expect(html).toContain("<title>KTW RK UE 41-92-12</title>");
    expect(html).toContain("<title>EA 2 Notunterkunft 2. Sternschule</title>");
  });
});
