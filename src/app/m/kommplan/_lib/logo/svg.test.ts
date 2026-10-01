import { describe, expect, it } from "vitest";
import { bereinigeSvg } from "./svg";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const RECT = '<rect width="10" height="10" fill="#e30613"/>';
const svg = (innen: string, attr = 'viewBox="0 0 10 10"') => `<svg ${NS} ${attr}>${innen}</svg>`;
function gut(eingabe: string): string {
  const r = bereinigeSvg(eingabe);
  if (!r.ok) throw new Error(`abgelehnt: ${r.grund}`);
  expect(bereinigeSvg(r.svg)).toEqual(r); // idempotent: die Ausgabe ist ihr eigener Fixpunkt
  return r.svg;
}
function abgelehnt(eingabe: string): string {
  const r = bereinigeSvg(eingabe);
  if (r.ok) throw new Error(`angenommen: ${r.svg}`);
  return r.grund;
}
/** Was nach der Bereinigung nie mehr vorkommen darf, gleich in welcher Schreibweise. */
const SCHAEDLICH = /script|foreignobject|onload|onclick|onerror|@import|evil\.example|<a[\s>]|<animate|<set[\s/>]|<iframe|data:image\/svg/i; // „http:“ nicht: xmlns trägt es zu Recht

describe("bereinigeSvg — was gefährlich ist, fällt", () => {
  it.each([
    ["script-Element", svg(`${RECT}<script>alert(1)</script>`)],
    ["script mit CDATA", svg(`${RECT}<script><![CDATA[alert(1)]]></script>`)],
    ["svg:script mit Präfix", `<svg ${NS} xmlns:svg="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${RECT}<svg:script>alert(1)</svg:script></svg>`],
    ["foreignObject", svg(`${RECT}<foreignObject><iframe src="https://x"/></foreignObject>`)],
    ["FOREIGNOBJECT groß", svg(`${RECT}<FOREIGNOBJECT><b>x</b></FOREIGNOBJECT>`)],
    ["foreignobject klein", svg(`${RECT}<foreignobject/>`)],
    ["onload an der Wurzel", `<svg ${NS} viewBox="0 0 10 10" onload="alert(1)">${RECT}</svg>`],
    ["ONCLICK groß", svg(`<rect width="10" height="10" ONCLICK="alert(1)"/>`)],
    ["a mit javascript:", svg(`${RECT}<a href="javascript:alert(1)"><text>x</text></a>`)],
    ["use auf fremde Datei", svg(`${RECT}<use href="https://evil.example/s.svg#a"/>`)],
    ["xlink:href javascript entitätskodiert", `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">${RECT}<use xlink:href="&#106;avascript:alert(1)"/></svg>`],
    ["javascript mit Tab und Zeilenumbruch", svg(`<rect width="10" height="10" fill="java&#9;scr&#10;ipt:alert(1)"/>`)],
    ["image mit data:image/svg+xml", svg(`${RECT}<image width="5" height="5" href="data:image/svg+xml;base64,PHN2Zy8+"/>`)],
    ["image von außen", svg(`${RECT}<image width="5" height="5" xlink:href="http://evil.example/x.png"/>`, `viewBox="0 0 10 10" xmlns:xlink="http://www.w3.org/1999/xlink"`)],
    ["animate setzt href", svg(`<a href="#x"><rect width="10" height="10"><animate attributeName="href" to="javascript:alert(1)"/></rect></a>${RECT}`)],
    ["set setzt href", svg(`${RECT}<set attributeName="href" to="javascript:alert(1)"/>`)],
    ["style @import", svg(`<style>@import url(http://evil.example/x.css); .a{fill:#e30613}</style><rect class="a" width="10" height="10"/>`)],
    ["url() nach außen im style-Attribut", svg(`<rect width="10" height="10" style="fill:url(http://evil.example/p.svg#x);stroke:#000"/>`)],
    ["url() nach außen im fill", svg(`${RECT}<rect width="1" height="1" fill="url('https://evil.example/#g')"/>`)],
    ["xml-stylesheet", `<?xml version="1.0"?><?xml-stylesheet href="http://evil.example/x.css"?>${svg(RECT)}`],
  ])("%s", (_name, eingabe) => {
    const aus = gut(eingabe);
    expect(aus).not.toMatch(SCHAEDLICH);
    expect(aus).toContain("<rect");
  });

  it("javascript: mit Steuerzeichen dazwischen: das Attribut fällt ganz, nicht nur das Wort", () => {
    const aus = gut(svg(`<rect width="10" height="10" fill="java&#9;scr&#10;ipt:alert(1)"/>`));
    expect(aus).not.toContain("alert");
    expect(aus).not.toContain("fill=");
  });
  it("DOCTYPE und ENTITY lehnen die ganze Datei ab (XXE, Entitäten-Bombe)", () => {
    expect(abgelehnt(`<!DOCTYPE svg [<!ENTITY a "aaaa">]>${svg(RECT)}`)).toMatch(/DOCTYPE/);
    expect(abgelehnt(`<?xml version="1.0"?>\n<!doctype svg>${svg(RECT)}`)).toMatch(/DOCTYPE/);
  });
  it("kaputtes XML lehnt ab: Attribut ohne Anführungszeichen, doppelt, offenes Element, unbekannte Entität, nacktes &", () => {
    expect(abgelehnt(`<svg ${NS} viewBox="0 0 10 10"><rect width=10 height="10"/></svg>`)).toMatch(/Anführungszeichen/);
    expect(abgelehnt(`<svg ${NS} viewBox="0 0 10 10"><rect width="1" width="2" height="1"/></svg>`)).toMatch(/doppelt/);
    expect(abgelehnt(`<svg ${NS} viewBox="0 0 10 10"><g>${RECT}</svg>`)).toMatch(/passt nicht|geschlossen/);
    expect(abgelehnt(svg(`<text>&nbsp;</text>${RECT}`))).toMatch(/Entität/);
    expect(abgelehnt(svg(`<text>A & B</text>${RECT}`))).toMatch(/&/);
  });
  it("ohne svg-Wurzel, ohne Maß oder ohne etwas zu Zeichnen: abgelehnt", () => {
    expect(abgelehnt(`<svg:svg xmlns:svg="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><svg:rect width="1" height="1"/></svg:svg>`)).toMatch(/Wurzel/);
    expect(abgelehnt(`<svg ${NS} width="100%" height="50%">${RECT}</svg>`)).toMatch(/viewBox/);
    expect(abgelehnt(svg("<script>alert(1)</script>"))).toMatch(/nichts zu zeichnen/);
    expect(abgelehnt(`<html>${svg(RECT)}</html>`)).toMatch(/Wurzel/);
  });
  it("zu tief verschachtelt (über 256 Ebenen): abgelehnt statt Stapelüberlauf", () => {
    expect(abgelehnt(svg(`${"<g>".repeat(300)}${RECT}${"</g>".repeat(300)}`))).toMatch(/verschachtelt/);
  });
});

describe("bereinigeSvg — lineare Laufzeit (Upload-Thread; Review Focus 9)", () => {
  // Die Größen sind so gewählt, dass die alten Regexe (`([^{}]+)\{…\}`, `/\*[\s\S]*?\*\/`, `url\s*\(…\)`) quadratisch
  // viele Sekunden bräuchten (gemessen: 40 000 Zeichen ohne Klammer ≈ 0,8 s, 10 000 × `url(` ≈ 0,7 s — 250 000 × ein
  // Vielfaches); die Grenze von 1 s hält auch unter hoher Last.
  const schnell = (f: () => void) => { const t = performance.now(); f(); expect(performance.now() - t).toBeLessThan(1000); };
  it("kaputtes <style> ohne Klammern, mit offenem Kommentar und offenen @-Regeln", () => {
    for (const css of ["a".repeat(60_000), "/*".repeat(30_000), "@".repeat(60_000), "a{".repeat(30_000)]) {
      schnell(() => { const r = bereinigeSvg(svg(`<style>${css}</style>${RECT}`)); expect(r.ok).toBe(true); });
    }
  });
  it("<style> über 64 KB: abgelehnt mit Grund", () => {
    expect(abgelehnt(svg(`<style>.a{fill:#000}${" ".repeat(64 * 1024)}</style>${RECT}`))).toMatch(/style.*64 KB/);
  });
  it("Attribut aus 250 000 × „url(“ und ein riesiges d bleiben linear", () => {
    schnell(() => { expect(gut(svg(`<rect width="1" height="1" fill="${"url(".repeat(250_000)}"/>${RECT}`))).not.toContain("url("); });
    schnell(() => { expect(gut(svg(`<path d="M0 0${" l1 1".repeat(150_000)}"/>`))).toContain("<path"); });
  });
});

describe("bereinigeSvg — ein echtes Logo bleibt, wie es aussieht (Review Focus 1)", () => {
  it("Illustrator: style-Element mit Klassen und CDATA, Metadaten, Kommentar, BOM", () => {
    const ai = `﻿<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Adobe Illustrator -->
<svg version="1.1" id="Ebene_1" ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 200 60" xml:space="preserve">
<style type="text/css"><![CDATA[ .st0{fill:#E30613;} .st1{fill:#1D1D1B;font-family:Arial;} ]]></style>
<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata>
<path class="st0" d="M0 0h60v60H0z"/><text class="st1" x="70" y="40">Muster &amp; Co</text>
</svg>`;
    const aus = gut(ai);
    expect(aus).toContain(".st0{fill:#E30613}");
    expect(aus).toContain('class="st0"');
    expect(aus).toContain("Muster &amp; Co");
    expect(aus).not.toMatch(/metadata|rdf:|Generator|type="text\/css"/);
    expect(aus.startsWith(`<svg `)).toBe(true);
  });
  it("Inkscape: sodipodi/inkscape fallen samt Attributen, Verlauf über url(#id) und use über #id bleiben", () => {
    const ink = `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="120" height="40" inkscape:version="1.3">
<sodipodi:namedview id="nv"/><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient><rect id="r" width="5" height="5"/></defs>
<g inkscape:label="Ebene 1" inkscape:groupmode="layer"><rect width="120" height="40" fill="url(#g)"/><use xlink:href="#r" x="3"/></g></svg>`;
    const aus = gut(ink);
    expect(aus).toContain('viewBox="0 0 120 40"'); // aus Breite und Höhe ergänzt
    expect(aus).toContain('fill="url(#g)"');
    expect(aus).toContain('xlink:href="#r"');
    expect(aus).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(aus).not.toMatch(/sodipodi|inkscape/);
  });
  it("eingebettetes PNG als data:-URI bleibt", () => {
    const aus = gut(svg('<image width="10" height="10" href="data:image/png;base64,iVBORw0KGgo="/>'));
    expect(aus).toContain('href="data:image/png;base64,iVBORw0KGgo="');
  });
  it("Text wird für XML maskiert ausgegeben", () => {
    expect(gut(svg(`<text>&lt;b&gt; &quot;x&quot;</text>${RECT}`))).toContain("<text>&lt;b&gt; \"x\"</text>");
  });
});
