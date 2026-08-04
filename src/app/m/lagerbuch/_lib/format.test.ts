import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fmtVerfall, chargeText, ampelTon, geraetFaelligChip, typLabel, zeitraumAus } from "./format";
import type { DatumFaelligkeit } from "./domain/geraet";
import { ZEITZONE } from "./zeit";

describe("fmtVerfall", () => {
  it("macht aus 2026-03 das 03/26", () => {
    expect(fmtVerfall("2026-03")).toBe("03/26");
    expect(fmtVerfall("2099-12")).toBe("12/99");
  });
});

describe("chargeText — der Vertrag in allen VIER Zustaenden", () => {
  it("abgelaufen schlaegt jede Ampel", () => {
    expect(chargeText({ ampel: "rot", abgelaufen: true }, "2020-01")).toBe("abgelaufen");
    // Auch wenn die Ampel (theoretisch) etwas anderes saegte: `abgelaufen` zuerst.
    expect(chargeText({ ampel: "gruen", abgelaufen: true }, "2020-01")).toBe("abgelaufen");
  });
  it("rot -> 'laeuft MM/JJ ab'", () => {
    expect(chargeText({ ampel: "rot", abgelaufen: false }, "2026-03")).toBe("läuft 03/26 ab");
  });
  it("gelb -> 'faellig MM/JJ'", () => {
    expect(chargeText({ ampel: "gelb", abgelaufen: false }, "2026-05")).toBe("fällig 05/26");
  });
  it("gruen -> 'bis MM/JJ'", () => {
    expect(chargeText({ ampel: "gruen", abgelaufen: false }, "2027-01")).toBe("bis 01/27");
  });
});

describe("ampelTon — die Namensfalle, und der vierte Wert", () => {
  it("bildet gruen auf 'ok' ab, NICHT auf 'gruen'", () => {
    /**
     * Die Alt-Klassen heissen chip-rot/chip-gelb/chip-ok. Ein direkt
     * interpoliertes `chip-${ampel}` ergaebe ein undefiniertes `chip-gruen`: mit
     * Padding und Radius, aber OHNE Farbe. Die Namensfalle geht mit, der Name
     * (`chipTone`) nicht (§5.17).
     */
    expect(ampelTon("gruen")).toBe("ok");
    expect(ampelTon("rot")).toBe("rot");
    expect(ampelTon("gelb")).toBe("gelb");
  });

  it("bildet null auf 'grau' ab — den vierten Zustand", () => {
    // „kein Datum gepflegt" (§5.10) und „keine Messung" (§5.12). ⚠️ `grau` ist
    // KEIN Ampelwert und darf nie als gruen dargestellt werden.
    expect(ampelTon(null)).toBe("grau");
  });

  it("liefert NIE einen Hexwert", () => {
    /**
     * §12.1, Punkt 4: ob Rot auf einer Datenflaeche bleiben darf, entscheidet
     * Entscheidung 30 (§6.6.2 — und sie entscheidet AMPEL-Rot #8c0d16, nicht
     * Suite-Rot #c8000f). Ein Test, der einen Hexwert festnagelt, entscheidet sie
     * versehentlich mit. Die Palette liegt in `_lib/ampel.ts` (Teil 5).
     */
    for (const a of ["rot", "gelb", "gruen", null] as const) {
      expect(ampelTon(a)).not.toMatch(/#/);
    }
  });
});

describe("geraetFaelligChip — bei objekt OHNE Datum gibt es KEINEN Chip", () => {
  const f = (p: Partial<DatumFaelligkeit>): DatumFaelligkeit => ({
    faelligAm: new Date(), tageBisFaellig: 10, ampel: "gelb",
    ueberfaellig: false, keinDatum: false, ...p,
  });

  it("medizin ohne Datum -> grauer Chip 'kein MTK-Datum'", () => {
    expect(geraetFaelligChip("medizin", f({ keinDatum: true, tageBisFaellig: null, ampel: "gruen" })))
      .toEqual({ ton: "grau", text: "kein MTK-Datum" });
  });

  it("objekt ohne Datum -> null (KEIN Chip)", () => {
    // Das Ablaufdatum ist bei Objekten optional (`format.ts:61`). Ein grauer Chip
    // an jedem Spineboard waere Grundrauschen.
    expect(geraetFaelligChip("objekt", f({ keinDatum: true, tageBisFaellig: null, ampel: "gruen" })))
      .toBeNull();
  });

  it("ueberfaellig nennt den BETRAG der Tage, nicht die negative Zahl", () => {
    expect(geraetFaelligChip("medizin", f({ tageBisFaellig: -7, ueberfaellig: true, ampel: "rot" })))
      .toEqual({ ton: "rot", text: "MTK überfällig (7 T)" });
    expect(geraetFaelligChip("objekt", f({ tageBisFaellig: -3, ueberfaellig: true, ampel: "rot" })))
      .toEqual({ ton: "rot", text: "abgelaufen (3 T)" });
  });

  it("'heute faellig' ist ein EIGENER Text — 'in 0 T' liest sich falsch", () => {
    expect(geraetFaelligChip("medizin", f({ tageBisFaellig: 0, ampel: "gelb" })))
      .toEqual({ ton: "gelb", text: "MTK heute fällig" });
    expect(geraetFaelligChip("objekt", f({ tageBisFaellig: 0, ampel: "gelb" })))
      .toEqual({ ton: "gelb", text: "läuft heute ab" });
  });

  it("sonst der Tages-Chip mit dem Ton der Ampel", () => {
    expect(geraetFaelligChip("medizin", f({ tageBisFaellig: 12, ampel: "gelb" })))
      .toEqual({ ton: "gelb", text: "MTK in 12 T" });
    expect(geraetFaelligChip("objekt", f({ tageBisFaellig: 90, ampel: "gruen" })))
      .toEqual({ ton: "ok", text: "läuft in 90 T ab" });
  });
});

describe("typLabel", () => {
  it("uebersetzt die vier Buchungstypen", () => {
    expect(typLabel("zugang")).toBe("Wareneingang");
    expect(typLabel("entnahme")).toBe("Entnahme");
    expect(typLabel("korrektur")).toBe("Korrektur");
    expect(typLabel("umlagerung")).toBe("Umlagerung");
  });
  it("faellt bei einem unbekannten Typ auf den Rohwert zurueck", () => {
    expect(typLabel("was-neues")).toBe("was-neues");
  });
});

describe("zeitraumAus — die vier Faelle aus §5.14.2", () => {
  it("ohne Angaben: keine Grenzen, KEIN Hinweis", () => {
    expect(zeitraumAus(undefined, undefined)).toEqual({ hinweise: [] });
    expect(zeitraumAus("", "")).toEqual({ hinweise: [] });
  });

  it("gueltig: Tagesanfang und Tagesende, INKLUSIV, in ZEITZONE", () => {
    const z = zeitraumAus("2026-06-01", "2026-06-30");
    expect(z.hinweise).toEqual([]);
    const f = new Intl.DateTimeFormat("de-DE", {
      timeZone: ZEITZONE, day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    expect(f.format(z.von!)).toBe("01.06.2026, 00:00:00");
    expect(f.format(z.bis!)).toBe("30.06.2026, 23:59:59");
  });

  it("unparsbar: die Grenze FAELLT WEG und ein Hinweis erscheint", () => {
    /**
     * DAS FEHLVERHALTEN IST DAS GEFAEHRLICHE, NICHT DAS LAUTE (§5.14.2). Heute
     * liefert ein gespeicherter Link mit defektem `von` die Seite OHNE
     * Fehlermeldung und UNGEFILTERT: Adresszeile zeigt einen Zeitraum, Datumsfeld
     * steht leer, Liste zeigt die neuesten 100 aus der GANZEN Historie.
     */
    const z = zeitraumAus("gestern", "2026-06-30");
    expect(z.von).toBeUndefined();
    expect(z.bis).toBeDefined();
    expect(z.hinweise).toHaveLength(1);
    expect(z.hinweise[0]).toContain("ungültig");
  });

  it("ueberrollender Kalendertag ist ebenfalls unparsbar", () => {
    expect(zeitraumAus("2026-02-31", undefined).hinweise).toHaveLength(1);
    expect(zeitraumAus("2026-02-31", undefined).von).toBeUndefined();
  });

  it("von > bis: BEIDE bleiben, und der Hinweis sagt warum", () => {
    // Die Grenzen bleiben stehen, damit die Adresszeile und das Eingabefeld
    // dasselbe sagen — der Nutzer soll sehen, WAS er gesetzt hat.
    const z = zeitraumAus("2026-06-30", "2026-06-01");
    expect(z.von).toBeDefined();
    expect(z.bis).toBeDefined();
    expect(z.hinweise).toHaveLength(1);
    expect(z.hinweise[0]).toContain("leer");
  });

  it("meldet ZWEI defekte Grenzen einzeln", () => {
    expect(zeitraumAus("quatsch", "unfug").hinweise).toHaveLength(2);
  });
});

/**
 * Bereitet Quelltext fuer den Zonenrechnung-Scan auf: Kommentare (`//`,
 * `/* ... *\/`) werden entfernt, EINFACHE Zeichenketten (`'...'`, `"..."`)
 * werden ausgeblendet — sie koennen nie ausfuehrbaren Code enthalten, anders
 * als Template-Literale mit `${...}`. Ohne das faengt sich der Scan SELBST:
 * dieser Testtitel weiter unten nennt `new Date(` woertlich, und
 * `domain/verfall.test.ts` (fremde Datei, T28) tut es ebenso in seinem
 * Testtitel („… nicht ueber new Date(y, m, 0, …)"). Beides ist Text, keine
 * Ausfuehrung.
 *
 * Template-Literale (Backtick) bleiben ABSICHTLICH unangetastet: sie komplett
 * auszublenden koennte einen echten Verstoss in `${...}` verstecken — die
 * gefaehrliche Richtung (dieselbe Abwaegung wie
 * `ohneKommentareUndZeichenketten` in `_lib/bauform.test.ts`, dort fuer den
 * umgekehrten Fall dokumentiert). Eine harmlose Erwaehnung in einem
 * Backtick-Literal waere hoechstens ein false positive — die sichere Richtung,
 * und im heutigen Modul kommt „new Date(" in keinem Template-Literal vor.
 */
function ohneKommentareUndEinfacheStrings(quelle: string): string {
  let out = "";
  let i = 0;
  while (i < quelle.length) {
    const c = quelle[i];
    if (c === "/" && quelle[i + 1] === "/") {
      // LAENGENTREU blanken, nicht verwerfen: `findeZonenVerstoesse` schneidet
      // das zitierte Codestueck mit `bereinigt`-Indizes aus dem ROHEN Text
      // (Zeile 259: `quelltext.slice(m.index, i)`). Ein Zeichen weniger hier
      // verschiebt jede spaetere Position um genau das — die Meldung zitiert
      // dann falschen Text, nicht den Verstoss.
      while (i < quelle.length && quelle[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && quelle[i + 1] === "*") {
      const ende = quelle.indexOf("*/", i + 2);
      const bis = ende === -1 ? quelle.length : ende + 2;
      for (let j = i; j < bis; j++) out += quelle[j] === "\n" ? "\n" : " ";
      i = bis;
      continue;
    }
    if (c === "'" || c === '"') {
      // Gedeckelt an der Zeilengrenze: ein `'`/`"`-Literal kann keinen rohen
      // Zeilenumbruch enthalten. OHNE diesen Deckel verschluckt ein einzelnes,
      // unbalanciertes Apostroph (am plausibelsten in einem absichtlich nicht
      // geparsten Backtick-Literal) den Rest der Datei UND jeden echten
      // Verstoss darin — lautlos, im einzigen Netz, das laut sein soll.
      out += " ";
      i++;
      while (i < quelle.length && quelle[i] !== c && quelle[i] !== "\n") {
        if (quelle[i] === "\\" && quelle[i + 1] !== "\n") { out += " "; i++; }
        out += " ";
        i++;
      }
      if (i < quelle.length && quelle[i] === c) { out += " "; i++; }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Findet `new Date(` mit MEHR ALS EINEM Argument auf oberster Klammerebene —
 * tiefenbewusst (nicht per Zeilen-Regex), damit zwei Faelle korrekt behandelt
 * werden:
 * - `new Date(Date.UTC(j, m - 1, t))` ist EIN Argument, das Komma steckt eine
 *   Klammerebene tiefer und zaehlt nicht.
 * - Zeilenumbrueche ZWISCHEN den Argumenten umgehen den Scan nicht, weil auf
 *   dem GESAMTEN (bereinigten) Dateiinhalt gesucht wird, nicht Zeile fuer Zeile.
 * Leerraum direkt nach `new Date(` ist irrelevant, da nur Klammern und Kommas
 * gezaehlt werden.
 */
function findeZonenVerstoesse(quelltext: string): string[] {
  const bereinigt = ohneKommentareUndEinfacheStrings(quelltext);
  const treffer: string[] = [];
  const re = /new Date\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bereinigt))) {
    let i = re.lastIndex;
    let tiefe = 1;
    let mehrArgumente = false;
    while (i < bereinigt.length && tiefe > 0) {
      const zc = bereinigt[i];
      if (zc === "(") tiefe++;
      else if (zc === ")") tiefe--;
      else if (zc === "," && tiefe === 1) mehrArgumente = true;
      i++;
    }
    if (mehrArgumente) {
      const zeile = bereinigt.slice(0, m.index).split("\n").length;
      treffer.push(`Zeile ${zeile}: ${quelltext.slice(m.index, i).replace(/\s+/g, " ").trim()}`);
    }
  }
  return treffer;
}

describe("findeZonenVerstoesse — die Mechanik des Scans, isoliert getestet", () => {
  it("erkennt mehrere Argumente auf einer Zeile", () => {
    expect(findeZonenVerstoesse("const x = new Date(2026, 5, 1);")).toHaveLength(1);
  });

  it("erkennt mehrere Argumente UEBER Zeilenumbrueche hinweg", () => {
    expect(findeZonenVerstoesse("const x = new Date(\n  2026,\n  5,\n  1,\n);")).toHaveLength(1);
  });

  it("erkennt es trotz Leerraum direkt nach der Klammer", () => {
    expect(findeZonenVerstoesse("new Date(   2026, 5, 1)")).toHaveLength(1);
  });

  it("laesst EIN Argument durch — new Date(ms) und new Date(iso)", () => {
    expect(findeZonenVerstoesse("new Date(ms)")).toEqual([]);
    expect(findeZonenVerstoesse('new Date("2026-06-01")')).toEqual([]);
  });

  it("laesst new Date(Date.UTC(...)) durch — das Komma steckt eine Klammer tiefer", () => {
    expect(findeZonenVerstoesse("const d = new Date(Date.UTC(j, m - 1, t));")).toEqual([]);
  });

  it("ignoriert eine Erwaehnung in einem Kommentar", () => {
    expect(findeZonenVerstoesse("// new Date(y, m, d) waere falsch")).toEqual([]);
    expect(findeZonenVerstoesse("/** new Date(y, m, d) waere falsch */")).toEqual([]);
  });

  it("ignoriert eine Erwaehnung in einer Zeichenkette — der Testtitel-Fall", () => {
    expect(findeZonenVerstoesse('it("nicht ueber new Date(y, m, 0, …)", () => {})')).toEqual([]);
  });

  it("ein einzelnes, unbalanciertes Apostroph verschluckt nicht den Rest der Datei", () => {
    /**
     * Ein `'`/`"`-Skip OHNE Zeilendeckel liefe bei einem einzelnen Apostroph
     * (am plausibelsten in einem absichtlich nicht geparsten Backtick-Literal)
     * bis zum naechsten gleichen Anfuehrungszeichen — im Zweifel bis zum
     * Dateiende — und blendete dabei jeden ECHTEN Verstoss danach lautlos aus.
     * Ein JS-String kann ohnehin keinen rohen Zeilenumbruch enthalten, der
     * Deckel aendert also nichts an echten Strings.
     */
    expect(findeZonenVerstoesse(
      "const s = `Nutzer's Wert`;\nconst x = new Date(2026, 5, 1);",
    )).toHaveLength(1);
  });

  it("zitiert den RICHTIGEN Codeausschnitt, auch nach einem vorangehenden Zeilenkommentar", () => {
    /**
     * `findeZonenVerstoesse` schneidet den zitierten Text mit Indizes aus dem
     * BEREINIGTEN String aus dem ROHEN `quelltext` (Zeile 257). Wird ein
     * `//`-Kommentar beim Bereinigen ERSATZLOS verworfen statt laengentreu
     * geblankt, verschiebt sich jede Position danach um genau die verworfene
     * Laenge — die Meldung zitiert dann ein falsches Codestueck, nicht den
     * Verstoss. Zwei Kommentarzeilen VOR dem Verstoss machen den Fehler
     * unuebersehbar (Review-Fix, Fix-Runde 1).
     */
    const quelle = [
      "// erste Kommentarzeile, wird beim Bereinigen entfernt",
      "// zweite Kommentarzeile, ebenfalls",
      "export const x = new Date(2026, 7, 4);",
    ].join("\n");
    const treffer = findeZonenVerstoesse(quelle);
    expect(treffer).toHaveLength(1);
    expect(treffer[0]).toBe("Zeile 3: new Date(2026, 7, 4)");
  });
});

describe("Quelltext-Zusicherung: keine Zonenrechnung ausserhalb _lib/zeit.ts", () => {
  it("kein `new Date(` mit mehr als EINEM Argument auf oberster Ebene unter src/app/m/lagerbuch", () => {
    /**
     * §5.16, Global Constraints dieses Plans. `new Date(y, m, d, …)` liest die
     * PROZESS-TZ; das Modul haengt bewusst nicht daran (Entscheidung 26 b).
     * Der Fehler ist still: die Ampelgrenzen wandern in die harmlose Richtung,
     * kaputt geht `fmtTs` — eine Buchung um 01:30 Ortszeit erscheint als Vortag
     * 23:30, und JEDE Buchung zwischen 00:00 und 02:00 landet auf dem falschen Tag.
     *
     * Ausgenommen ist genau EINE Datei: `_lib/zeit.ts`. Sie IST die Zonenrechnung.
     */
    const WURZEL = join(process.cwd(), "src/app/m/lagerbuch");
    const AUSNAHMEN = ["_lib/zeit.ts"];
    const treffer: string[] = [];
    const gehe = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { gehe(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        const rel = relative(WURZEL, p);
        if (AUSNAHMEN.includes(rel)) continue;
        const inhalt = readFileSync(p, "utf8");
        for (const t of findeZonenVerstoesse(inhalt)) treffer.push(`${rel} ${t}`);
      }
    };
    if (statSync(WURZEL).isDirectory()) gehe(WURZEL);
    expect(treffer, `Zonenrechnung ausserhalb _lib/zeit.ts:\n${treffer.join("\n")}`).toEqual([]);
  });
});
