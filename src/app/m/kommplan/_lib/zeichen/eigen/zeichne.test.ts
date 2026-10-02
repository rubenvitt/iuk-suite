import { describe, expect, it } from "vitest";
import type { SymbolSpec } from "@einsatzzeichen/schema";
import { ACHSEN, befunde } from "./vokabular";
import { SPEC_MAX_ZEICHEN, istSicheresSymbol, liesSpec, weissZuSchwach, zeichneEigenes } from "./zeichne";

const spec = (s: object) => s as SymbolSpec;
const ILS = spec({ kind: "post", organization: "fuehrung-leitung", labels: { center: "ILS", bottomRight: "SW" } });

describe("eigene Zeichen zeichnen", () => {
  it("eine Leitstelle: gelber Körper, Kürzel SCHWARZ (der Kern setzte Weiß auf Gelb, 1,07:1)", () => {
    const r = zeichneEigenes(ILS, "kpe-t");
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.quelle.viewBox).toBe("0 0 90.709 90.709");
    expect(r.quelle.inhalt).toContain('fill="#fafa00"');
    expect(r.quelle.inhalt).toMatch(/fill="#000000">ILS<\/text>/);
    expect(r.quelle.inhalt).toMatch(/fill="#000000">SW<\/text>/);
    expect(r.beschreibung).toContain("Kürzel: ILS");
  });
  it("auf Rot, Blau und Grün bleibt die Beschriftung weiß wie in der Vorschrift; getauscht wird nur unter 3:1", () => {
    for (const organization of ["feuerwehr", "thw", "polizei"]) {
      const r = zeichneEigenes(spec({ kind: "formation", organization, labels: { center: "X" } }), "kpe-t");
      expect(r.ok && r.quelle.inhalt).toMatch(/fill="#ffffff">X<\/text>/);
    }
    expect(["gelb", "hellgruen", "orange", "hellgrau"].every(weissZuSchwach)).toBe(true);
    expect(["rot", "gruen", "blau", "hellblau", "braun", "schwarz", "grau"].some(weissZuSchwach)).toBe(false);
  });
  it("ohne Hülle, Beschreibung, Schriftfamilie und -gewicht — wie das Generat; Schwarzweiß ohne Buntton", () => {
    const farbe = zeichneEigenes(ILS, "kpe-t");
    const sw = zeichneEigenes(ILS, "kpe-t", { schwarzweiss: true });
    if (!farbe.ok || !sw.ok) throw new Error("zeichnet nicht");
    expect(farbe.quelle.inhalt).not.toMatch(/<svg|<desc|<title|font-family|font-weight|aria-/);
    const bunt = [...sw.quelle.inhalt.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1].toLowerCase())
      .filter((h) => !(h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6)));
    expect(bunt).toEqual([]);
  });
  it("Text wird maskiert, nie als Markup übernommen", () => {
    const r = zeichneEigenes(spec({ kind: "formation", organization: "feuerwehr", labels: { center: "<b>&" } }), "kpe-t");
    expect(r.ok && r.quelle.inhalt).toContain("&lt;b&gt;&amp;");
  });
  it("Regelverstoß und Vermessungslücke kommen als Ergebnis, nicht als Wurf", () => {
    const r = zeichneEigenes(spec({ kind: "person", organization: "feuerwehr", technicalFill: "rot" }), "kpe-t");
    expect(r).toMatchObject({ ok: false, art: "regel", hinweise: [{ titel: expect.stringContaining("schließen sich aus"), feld: "technicalFill" }] });
    const lang = zeichneEigenes(spec({ kind: "formation", labels: { center: "Integrierte Leitstelle Schweinfurt" } }), "kpe-t");
    expect(lang.ok).toBe(false);
  });
  it("jeder Wert, den der Baukasten an einer nackten Grundform anbietet, zeichnet sicher (Farbe und Schwarzweiß)", () => {
    let geprueft = 0;
    for (const kind of ["formation", "person", "post", "vehicle-land", "building"]) {
      for (const achse of ACHSEN.filter((a) => a.key !== "grundzeichen")) {
        for (const feld of achse.felder) {
          for (const b of befunde(spec({ kind }), achse, feld).filter((x) => x.frei)) {
            const s = spec({ kind, [feld]: feld === "capabilities" || feld === "bodyMarks" ? [b.wert] : b.wert });
            for (const schwarzweiss of [false, true]) {
              const r = zeichneEigenes(s, "kpe-t", { schwarzweiss }); // wirft, wenn `istSicheresSymbol` anschlägt
              expect(r.ok, JSON.stringify(s)).toBe(true);
            }
            geprueft++;
          }
        }
      }
    }
    expect(geprueft).toBeGreaterThan(100);
  });
});

describe("die zweite Linie: istSicheresSymbol", () => {
  it.each([
    ['<script>alert(1)</script>'],
    ['<rect onload="x()"/>'],
    ['<rect fill="url(https://x.example/a)"/>'],
    ['<rect fill="url(#fremd)"/>'],
    ['<image href="data:image/png;base64,AA"/>'],
    ['<use href="#kpe-t-a"/>'],
    ['<foreignObject></foreignObject>'],
    ['<rect style="fill:red"/>'],
    ['<rect id="fremd"/>'],
    ['<rect fill="java&#115;cript:"/>'],
    ['<!DOCTYPE x><rect/>'],
  ])("lehnt %s ab", (inhalt) => {
    expect(istSicheresSymbol(inhalt, "kpe-t")).toBe(false);
  });
  it("nimmt Geometrie mit eigener ID und url(#eigene) an", () => {
    expect(istSicheresSymbol('<defs><clipPath id="kpe-t-c"><rect x="1" y="1" width="2" height="2"/></clipPath></defs><g clip-path="url(#kpe-t-c)"><text x="1" y="2" font-size="3">A&amp;B</text></g>', "kpe-t")).toBe(true);
  });
});

describe("liesSpec", () => {
  it("nimmt eine Spec in kanonischer Form, lehnt fremde Felder und Übergröße ab", () => {
    expect(liesSpec({ labels: { center: "A" }, kind: "post" })).toEqual({ ok: true, spec: { kind: "post", labels: { center: "A" } } });
    expect(liesSpec({ kind: "post", onload: "x" })).toMatchObject({ ok: false, fehler: expect.stringContaining("onload") });
    expect(liesSpec({ kind: "gibt-es-nicht" }).ok).toBe(false);
    expect(liesSpec("kein Objekt").ok).toBe(false);
    expect(liesSpec({ kind: "post", designation: "x".repeat(SPEC_MAX_ZEICHEN) })).toEqual({ ok: false, fehler: "Die Zusammenstellung ist zu groß." });
  });
});
