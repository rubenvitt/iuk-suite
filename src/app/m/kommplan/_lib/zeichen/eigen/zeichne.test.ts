import { describe, expect, it } from "vitest";
import type { BodySign } from "@einsatzzeichen/schema";
import { SOFORT_GEPRUEFT, befunde } from "./vokabular";
import { SPEC_MAX_ZEICHEN, istSicheresSymbol, liesEingabe, liesGespeichert, pruefeEigenes, speicherform, weissZuSchwach, zeichneEigenes } from "./zeichne";

const zeichen = (s: object) => s as BodySign;
const ILS = zeichen({ kind: "post", organization: "fuehrung-leitung", text: { center: "ILS", bottomRight: "SW" } });

describe("eigene Zeichen zeichnen", () => {
  it("eine Leitstelle: gelber Körper, Kürzel SCHWARZ (der Kern setzte Weiß auf Gelb, 1,07:1)", () => {
    const r = zeichneEigenes(ILS, "kpe-t");
    expect(r.quelle.viewBox).toBe("0 0 90.709 90.709");
    expect(r.quelle.inhalt).toContain('fill="#fafa00"');
    expect(r.quelle.inhalt).toMatch(/fill="#000000">ILS<\/text>/);
    expect(r.quelle.inhalt).toMatch(/fill="#000000">SW<\/text>/);
    expect(r.beschreibung).toContain("Kürzel: ILS");
  });
  it("Leitstelle wie im Einsatzzeichen-Baukasten: großer Mitteltext und Kürzel unter dem Zeichen rechts", () => {
    const lst = zeichen({ kind: "circle-12", organization: "fuehrung-leitung", head: "kreis", text: { center: "LST", belowRight: "Uel", centerSize: "large" } });
    const gross = zeichneEigenes(lst, "kpe-t");
    const normal = zeichneEigenes(zeichen({ ...lst, text: { center: "LST", belowRight: "Uel" } }), "kpe-t");
    expect(gross.quelle.inhalt).toMatch(/>Uel<\/text>/);
    const groesse = (inhalt: string) => Number(/font-size="([\d.]+)"[^>]*>LST</.exec(inhalt)![1]);
    expect(groesse(gross.quelle.inhalt)).toBeGreaterThan(groesse(normal.quelle.inhalt) * 1.4);
  });
  it("alte Füllungen aus core 4.1.0 (Schrifttoken) lesen sich als Schwarz und zeichnen weiter", () => {
    for (const technicalFill of ["funktionslauf-kontrast", "koerperlauf-kontrast"]) {
      const r = liesGespeichert(JSON.stringify({ kind: "formation", technicalFill }));
      expect(r).toEqual({ ok: true, zeichen: { kind: "formation", color: "schwarz" } });
      expect(r.ok && zeichneEigenes(r.zeichen, "kpe-t").treue).not.toBe("simplified");
    }
  });
  it("auf Rot, Blau und Grün bleibt die Beschriftung weiß wie in der Vorschrift; getauscht wird nur unter 3:1", () => {
    for (const organization of ["feuerwehr", "thw", "polizei"]) {
      expect(zeichneEigenes(zeichen({ kind: "formation", organization, text: { center: "X" } }), "kpe-t").quelle.inhalt).toMatch(/fill="#ffffff">X<\/text>/);
    }
    expect(["gelb", "hellgruen", "orange", "hellgrau"].every(weissZuSchwach)).toBe(true);
    expect(["rot", "gruen", "blau", "hellblau", "braun", "schwarz", "grau"].some(weissZuSchwach)).toBe(false);
  });
  it("ohne Hülle, Beschreibung und Schriftfamilie, Kürzel in 500 — wie das Generat; Schwarzweiß ohne Buntton", () => {
    const farbe = zeichneEigenes(ILS, "kpe-t");
    const sw = zeichneEigenes(ILS, "kpe-t", { schwarzweiss: true });
    expect(farbe.quelle.inhalt).not.toMatch(/<svg|<desc|<title|font-family|aria-/);
    expect([...new Set([...farbe.quelle.inhalt.matchAll(/\bfont-weight="([^"]*)"/g)].map((m) => m[1]))]).toEqual(["500"]);
    const bunt = [...sw.quelle.inhalt.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1].toLowerCase())
      .filter((h) => !(h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6)));
    expect(bunt).toEqual([]);
  });
  it("Text wird maskiert, nie als Markup übernommen", () => {
    expect(zeichneEigenes(zeichen({ kind: "formation", organization: "feuerwehr", text: { center: "<b>&" } }), "kpe-t").quelle.inhalt).toContain("&lt;b&gt;&amp;");
  });
  it("zeichnen scheitert nie: was nicht passt, fällt mit Grund weg; streng prüft nur `pruefeEigenes`", () => {
    const lang = zeichen({ kind: "formation", organization: "feuerwehr", text: { center: "Integrierte Leitstelle Schweinfurt" } });
    const r = zeichneEigenes(lang, "kpe-t");
    expect(r.treue).toBe("simplified");
    expect(r.weggelassen).toEqual([{ feld: "text.center", wert: "Integrierte Leitstelle Schweinfurt", grund: expect.any(String) }]);
    expect(r.quelle.inhalt).not.toContain("Integrierte");
    expect(pruefeEigenes(lang)).toMatchObject({ ok: false, hinweise: [{ feld: "text", titel: expect.any(String) }] });
    expect(pruefeEigenes(ILS)).toEqual({ ok: true });
  });
  it("jeder Wert, den der Baukasten an einer nackten Grundform anbietet, zeichnet sicher und vollständig (Farbe und Schwarzweiß)", () => {
    let geprueft = 0;
    for (const kind of ["formation", "person", "post", "vehicle-land", "building"]) {
      for (const feld of [...SOFORT_GEPRUEFT.filter((f) => f !== "kind"), "tasks" as const]) {
        for (const b of befunde(zeichen({ kind }), feld).filter((x) => x.frei)) {
          const z = zeichen({ kind, [feld]: feld === "tasks" ? [b.wert] : b.wert });
          for (const schwarzweiss of [false, true]) {
            const r = zeichneEigenes(z, "kpe-t", { schwarzweiss }); // wirft, wenn `istSicheresSymbol` anschlägt
            expect(r.treue, JSON.stringify(z)).not.toBe("simplified");
          }
          geprueft++;
        }
      }
    }
    expect(geprueft).toBeGreaterThan(100);
  }, 120_000);
  it("die Treue: abgeleitet, wenn Teile an keinem Original vermessen sind; vermessen sonst", () => {
    expect(zeichneEigenes(zeichen({ kind: "vehicle-land", organization: "thw", tasks: ["fire-fighting", "pumping"] }), "kpe-t").treue).toBe("derived");
    expect(zeichneEigenes(zeichen({ kind: "formation", organization: "feuerwehr" }), "kpe-t").treue).toBe("measured");
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

describe("lesen und speichern", () => {
  it("die Eingabe ist eine nackte Beschreibung; fremde Felder, Übergröße und freistehende Zeichen lehnt sie ab", () => {
    expect(liesEingabe({ text: { center: "A" }, kind: "post" })).toEqual({ ok: true, zeichen: { kind: "post", text: { center: "A" } } });
    expect(liesEingabe({ kind: "post", onload: "x" })).toMatchObject({ ok: false, fehler: expect.stringContaining("onload") });
    expect(liesEingabe({ kind: "post", labels: { center: "A" } }).ok).toBe(false); // ein Bauplan ist keine Eingabe mehr
    expect(liesEingabe({ kind: "gibt-es-nicht" }).ok).toBe(false);
    expect(liesEingabe("kein Objekt").ok).toBe(false);
    expect(liesEingabe({ kind: "weather", values: ["weather-cloudy"] })).toMatchObject({ ok: false, fehler: expect.stringContaining("ohne Grundzeichen") });
    expect(liesEingabe({ kind: "post", text: { below: "x".repeat(SPEC_MAX_ZEICHEN) } })).toEqual({ ok: false, fehler: "Die Zusammenstellung ist zu groß." });
  });
  it("gespeichert wird die Hülle v2; gelesen werden sie und der nackte Bauplan aus der Zeit vor IDA-408", () => {
    expect(speicherform(ILS)).toBe('{"v":2,"sign":{"kind":"post","organization":"fuehrung-leitung","text":{"center":"ILS","bottomRight":"SW"}}}');
    expect(liesGespeichert(speicherform(ILS))).toEqual({ ok: true, zeichen: ILS });
    expect(liesGespeichert(JSON.stringify({ kind: "post", organization: "fuehrung-leitung", labels: { center: "ILS", bottomRight: "SW" } }))).toEqual({ ok: true, zeichen: ILS });
    expect(liesGespeichert("{").ok).toBe(false);
  });
});
