import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { checklistenPdf, pdfDateiname, winAnsi } from "./checklistePdf";
import type { ChecklisteBlatt } from "./lesepfade/checkliste";

/**
 * DIE FAHRZEUG-CHECKLISTE ALS PDF.
 *
 * ⚠️ WAS DIESE DATEI HALTEN KANN UND WAS NICHT. Sie liest den TEXTLAYER des
 * erzeugten Dokuments — was drinsteht, was NICHT drinsteht, und wie es auf
 * Seiten verteilt ist. Was sie NICHT sieht, ist das Aussehen: ob eine Spalte zu
 * schmal ist, ob zwei Kaestchen aneinanderstossen, ob eine Ueberschrift am
 * Seitenfuss allein steht. Dafuer gibt es nur den Blick auf das fertige Blatt.
 * Die Grenze ist dieselbe wie bei `(druck)/checklisten/druck.test.ts` fuer das
 * Stylesheet: „die Regel steht da", nie „sie wirkt".
 *
 * ⚠️ DER TEXT WIRD AUS DEM PDF ZURUECKGELESEN UND NICHT AUS EINEM
 * ZWISCHENERGEBNIS GEPRUEFT. Das ist der ganze Punkt der Blindzaehlungs-
 * Zusicherung weiter unten: eine Sollmenge, die im Textlayer steht, ist auch
 * dann noch da, wenn sie niemand SIEHT — sie faellt beim Suchen im Betrachter
 * und beim Kopieren wieder heraus. Ein Test gegen ein Zwischenmodell koennte
 * das nie belegen.
 */

/* ── PDF zurueckgelesen ───────────────────────────────────────────────────── */

/** Die WinAnsi-Bytes 0x80–0x9F. Latin-1 hat dort Steuerzeichen; das PDF traegt
 *  an diesen Stellen Gedankenstrich und Anfuehrungszeichen. */
const WINANSI_HOCH: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
  0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž",
  0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
  0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

/**
 * Alle Textstuecke des Dokuments, in Zeichenreihenfolge — je Eintrag ein
 * `Tj`-Aufruf, also eine gesetzte Zeile.
 *
 * `pdf-lib` schreibt Text als HEX-Zeichenkette (`<52545720…> Tj`) in
 * Flate-gepackte Inhaltsstroeme; beides muss hier rueckwaerts gegangen werden.
 * Der Seitenwechsel ist an der Reihenfolge der Stroeme ablesbar — deshalb gibt
 * die Funktion die Stuecke JE SEITE zurueck und nicht als einen Text.
 */
function seitenTexte(bytes: Uint8Array): string[][] {
  const roh = Buffer.from(bytes);
  const seiten: string[][] = [];
  let i = 0;
  while ((i = roh.indexOf("stream", i)) !== -1) {
    let anfang = i + "stream".length;
    if (roh[anfang] === 0x0d) anfang++;
    if (roh[anfang] === 0x0a) anfang++;
    const ende = roh.indexOf("endstream", anfang);
    if (ende === -1) break;
    i = ende + "endstream".length;

    let inhalt: string;
    try {
      inhalt = inflateSync(roh.subarray(anfang, ende)).toString("latin1");
    } catch {
      continue;   // kein Flate-Strom (Objektstroeme, Schriftbeschreibungen)
    }
    const stuecke = [...inhalt.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map(([, hex]) =>
      (hex!.match(/../g) ?? [])
        .map((paar) => {
          const byte = parseInt(paar, 16);
          return WINANSI_HOCH[byte] ?? String.fromCharCode(byte);
        })
        .join(""));
    // Ein Inhaltsstrom ohne einen einzigen `Tj` ist keine Seite dieses Bogens.
    if (stuecke.length > 0) seiten.push(stuecke);
  }
  return seiten;
}

const alleTexte = (bytes: Uint8Array) => seitenTexte(bytes).flat();

/** Alle Stuecke untereinander — fuer Zusicherungen ueber eine GESETZTE ZEILE. */
const flach = (bytes: Uint8Array) => alleTexte(bytes).join("\n");

/**
 * Alle Stuecke zu einem Fliesstext — fuer Zusicherungen ueber einen SATZ.
 * Ein umbrochener Satz steht als mehrere `Tj`-Stuecke im Dokument; `flach`
 * traegt zwischen ihnen einen Zeilenumbruch, und ein `toContain("… nichts
 * abzuhaken")` waere dort immer rot, ohne dass etwas fehlte.
 */
const fliesstext = (bytes: Uint8Array) => alleTexte(bytes).join(" ");

/* ── Beispieldaten ────────────────────────────────────────────────────────── */

const position = (i: number) => ({
  artikelId: `a${i}`,
  artikelName: `Artikel ${i}`,
  einheit: "Stk.",
  handlagerFach: `B-${String(i).padStart(2, "0")}`,
  soll: 4,
  verfallText: null,
  verfallAuffaellig: false,
});

const RTW: ChecklisteBlatt = {
  id: "fz-a",
  name: "RTW 1",
  kennung: "MS-1",
  vorlage: "RTW-Vorlage",
  positionen: 2,
  faecher: [{
    label: "Fach 1",
    positionen: [
      {
        artikelId: "a1", artikelName: "Verband", einheit: "Stk.",
        handlagerFach: "B-04", soll: 4,
        verfallText: "läuft 07/26 ab", verfallAuffaellig: true,
      },
      {
        artikelId: "a2", artikelName: "NaCl", einheit: "Fl.",
        handlagerFach: "C-01", soll: 3,
        verfallText: null, verfallAuffaellig: false,
      },
    ],
  }],
  geraete: [{
    id: "g1", name: "Defibrillator", typ: "medizin",
    fristText: "MTK in 16 T", fristAuffaellig: true,
  }],
  flaschen: [
    { id: "o1", name: "Flasche A", nennfuelldruckBar: 200, letzterDruck: 180 },
    { id: "o2", name: "Flasche B", nennfuelldruckBar: 300, letzterDruck: null },
  ],
};

const NEF: ChecklisteBlatt = {
  id: "fz-b", name: "NEF 1", kennung: null, vorlage: null,
  positionen: 0, faecher: [], geraete: [], flaschen: [],
};

const OPTIONEN = { stand: "15.06.2026", erstellt: new Date("2026-06-15T08:00:00Z") };

/* ── Zusicherungen ────────────────────────────────────────────────────────── */

describe("das Dokument", () => {
  it("ist ein PDF", async () => {
    const bytes = await checklistenPdf([RTW], OPTIONEN);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  /**
   * ⚠️ EIN FAHRZEUG BEGINNT AUF EINER NEUEN SEITE — UND HINTER DEM LETZTEN
   * STEHT KEINE LEERE. Das ist derselbe Fund wie im Stylesheet
   * (`break-before` am zweiten Blatt statt `break-after` an allen): bei zehn
   * Fahrzeugen faellt eine leere Schlussseite niemandem auf, beim Druck EINER
   * Checkliste ist die Haelfte des Ausdrucks leer.
   */
  it("gibt je Fahrzeug mindestens eine und fuer zwei leere genau zwei Seiten", async () => {
    const eins = seitenTexte(await checklistenPdf([NEF], OPTIONEN));
    const zwei = seitenTexte(await checklistenPdf([NEF, { ...NEF, id: "fz-c", name: "MTW" }], OPTIONEN));
    expect(eins).toHaveLength(1);
    expect(zwei).toHaveLength(2);
    expect(zwei[0]!.join(" ")).toContain("NEF 1");
    expect(zwei[1]!.join(" ")).toContain("MTW");
  });

  it("traegt Fahrzeug, Kennung, Vorlage und Stand im Kopf", async () => {
    const text = flach(await checklistenPdf([RTW], OPTIONEN));
    expect(text).toContain("RTW 1");
    expect(text).toContain("MS-1");
    expect(text).toContain("Vorlage: RTW-Vorlage");
    expect(text).toContain("2 Positionen · Stand 15.06.2026");
  });

  it("nennt eine fehlende Vorlage ausdruecklich, statt die Zeile wegzulassen", async () => {
    expect(flach(await checklistenPdf([NEF], OPTIONEN))).toContain("ohne Vorlage");
  });

  it("benennt den leeren Fall, statt ein leeres Blatt auszugeben", async () => {
    expect(fliesstext(await checklistenPdf([NEF], OPTIONEN)))
      .toContain("Es gibt nichts abzuhaken.");
  });

  it("traegt drei Unterschriftsfelder", async () => {
    const text = flach(await checklistenPdf([RTW], OPTIONEN));
    for (const feld of ["Geprüft von", "Datum", "Unterschrift"]) expect(text).toContain(feld);
  });

  /** Ein loses Blatt auf einem Stapel muss sein Fahrzeug und seinen Stand
   *  nennen koennen — und sagen, ob es vollstaendig ist. */
  it("nennt in der Fusszeile Fahrzeug, Stand und die Seitenzahl", async () => {
    const text = flach(await checklistenPdf([RTW], OPTIONEN));
    expect(text).toContain("RTW 1 · MS-1 · Stand 15.06.2026");
    expect(text).toContain("Seite 1 von 1");
  });

  /**
   * ⚠️ DIE SEITENZAEHLUNG LAEUFT JE FAHRZEUG, NICHT UEBER DAS GANZE DOKUMENT.
   * „Seite 2 von 7" auf einem Blatt, das man aus dem Stapel gezogen hat, sagt
   * nichts darueber, ob dieses Fahrzeug vollstaendig ist — und genau das ist
   * die Frage, die vor dem Fahrzeug gestellt wird.
   */
  it("zaehlt die Seiten je Fahrzeug", async () => {
    const seiten = seitenTexte(await checklistenPdf([RTW, NEF], OPTIONEN));
    expect(seiten).toHaveLength(2);
    expect(seiten[0]!.join(" ")).toContain("Seite 1 von 1");
    expect(seiten[1]!.join(" ")).toContain("Seite 1 von 1");
  });
});

describe("die Bestueckung", () => {
  it("zeigt Artikel, Handlager-Fach, Soll und Einheit", async () => {
    const text = flach(await checklistenPdf([RTW], OPTIONEN));
    expect(text).toContain("Verband");
    expect(text).toContain("B-04");
    expect(text).toContain("4 Stk.");
  });

  /** Papier ist einfarbig: die Auszeichnung ist ein vorangestelltes Rufzeichen
   *  (und Fettschrift), nie Rot. */
  it("zeichnet einen auffaelligen Verfall mit Rufzeichen aus", async () => {
    expect(flach(await checklistenPdf([RTW], OPTIONEN))).toContain("! läuft 07/26 ab");
  });
});

describe("Blindzaehlung", () => {
  /**
   * ⚠️ DIE ZAHL WIRD NICHT VERDECKT, SIE ENTSTEHT NICHT — und in einem PDF ist
   * das nicht dasselbe wie im HTML, sondern noch schaerfer: eine ueberdeckte
   * Zahl bleibt im TEXTLAYER und kommt beim Suchen, Markieren und Kopieren
   * ungefragt wieder zum Vorschein. Genau deshalb liest dieser Fall den Text
   * aus dem fertigen Dokument zurueck.
   */
  it("nimmt die Sollmenge aus dem Textlayer — nicht nur aus dem Blick", async () => {
    const offen = flach(await checklistenPdf([RTW], OPTIONEN));
    const blind = flach(await checklistenPdf([RTW], { ...OPTIONEN, blind: true }));
    expect(offen).toContain("4 Stk.");
    expect(blind).not.toContain("4 Stk.");
    expect(blind).not.toContain("3 Fl.");
  });

  it("behaelt die Einheit — gezaehlt wird in Stueck, nicht in Zahlen", async () => {
    expect(flach(await checklistenPdf([RTW], { ...OPTIONEN, blind: true }))).toContain("Stk.");
  });

  it("beschriftet die Spalte um, statt eine leere Soll-Spalte zu zeigen", async () => {
    expect(flach(await checklistenPdf([RTW], OPTIONEN))).toContain("SOLL");
    const blind = flach(await checklistenPdf([RTW], { ...OPTIONEN, blind: true }));
    expect(blind).toContain("EINHEIT");
    expect(blind).not.toContain("SOLL");
  });
});

describe("Geraete und Sauerstoff", () => {
  it("bietet je Geraet die drei Zustaende zum Ankreuzen", async () => {
    const text = flach(await checklistenPdf([RTW], OPTIONEN));
    for (const zustand of ["In Ordnung", "Gebrauchsspuren", "Defekt"]) {
      expect(text).toContain(zustand);
    }
  });

  /**
   * ⚠️ `null` IST „NIE GEMESSEN", NICHT 0 bar (§5.12). Ein gedrucktes „0 bar"
   * behauptete auf einem Nachweis eine leere Flasche, die niemand gemessen
   * hat — genau der Fehlalarm, wegen dem der Wert ueberhaupt nullbar ist.
   */
  it("schreibt `nie gemessen`, wo keine Messung vorliegt — nie `0 bar`", async () => {
    const stuecke = alleTexte(await checklistenPdf([RTW], OPTIONEN));
    expect(stuecke).toContain("nie gemessen");
    expect(stuecke).toContain("180 bar");
    // Stueckweise geprueft und NICHT ueber den Volltext: „0 bar" ist
    // Teilzeichenkette von „200 bar" und „300 bar", und ein `not.toContain`
    // auf dem ganzen Text waere immer rot und beweisfrei.
    expect(stuecke).not.toContain("0 bar");
  });
});

describe("mehrseitige Blaetter", () => {
  const GROSS: ChecklisteBlatt = {
    ...RTW,
    positionen: 60,
    faecher: [{ label: "Fach 1", positionen: Array.from({ length: 60 }, (_, i) => position(i)) }],
    geraete: [],
    flaschen: [],
  };

  it("bricht um und zaehlt die Seiten mit", async () => {
    const seiten = seitenTexte(await checklistenPdf([GROSS], OPTIONEN));
    expect(seiten.length).toBeGreaterThan(1);
    expect(seiten[0]!.join(" ")).toContain(`Seite 1 von ${seiten.length}`);
    expect(seiten.at(-1)!.join(" ")).toContain(`Seite ${seiten.length} von ${seiten.length}`);
  });

  /**
   * ⚠️ DIE KOPFZEILE WIEDERHOLT SICH — dasselbe, was
   * `display: table-header-group` im Stylesheet zusichert. Ohne sie steht ab
   * Seite zwei eine Spalte „4" ohne Ueberschrift da, und niemand weiss mehr, ob
   * das Soll oder Ist ist.
   */
  it("wiederholt Spaltenkoepfe und nennt das Fahrzeug auf der Folgeseite", async () => {
    const seiten = seitenTexte(await checklistenPdf([GROSS], OPTIONEN));
    const zweite = seiten[1]!.join(" ");
    expect(zweite).toContain("ARTIKEL");
    expect(zweite).toContain("SOLL");
    expect(zweite).toContain("RTW 1 · MS-1 — Fortsetzung");
  });

  /**
   * Kompakt ist eine Dichtestufe, kein zweites Layout: dieselben Zeilen,
   * weniger Platz.
   *
   * ⚠️ GEMESSEN WIRD AN DEN ZEILEN JE SEITE, NICHT AN DER SEITENZAHL. Die
   * Seitenzahl ist eine Treppenfunktion: bei 60 Positionen liegen beide
   * Dichten auf derselben Stufe, und `kompakt < weit` waere rot, obwohl die
   * Verdichtung wirkt. Die Zeilen je Seite steigen dagegen immer.
   */
  it("verdichtet ueber `kompakt`, ohne eine Zeile zu verlieren", async () => {
    const zeilenAufSeiteEins = (seiten: string[][]) =>
      seiten[0]!.filter((stueck) => /^Artikel \d+$/.test(stueck)).length;

    const weit = seitenTexte(await checklistenPdf([GROSS], OPTIONEN));
    const kompakt = seitenTexte(await checklistenPdf([GROSS], { ...OPTIONEN, kompakt: true }));

    expect(zeilenAufSeiteEins(kompakt)).toBeGreaterThan(zeilenAufSeiteEins(weit));
    expect(kompakt.length).toBeLessThanOrEqual(weit.length);
    // Verdichten heisst nicht weglassen: beide tragen alle 60 Positionen.
    for (const seiten of [weit, kompakt]) {
      const artikel = seiten.flat().filter((stueck) => /^Artikel \d+$/.test(stueck));
      expect(artikel).toHaveLength(60);
    }
  });
});

describe("der Zeichenvorrat der Standardschriften", () => {
  it("laesst Umlaute, Gedankenstrich und Anfuehrungszeichen unangetastet", () => {
    expect(winAnsi("Kompressen à 25 Stück – „steril“")).toBe("Kompressen à 25 Stück – „steril“");
  });

  it("ersetzt, was sich ersetzen laesst", () => {
    expect(winAnsi("O₂-Flasche ✓")).toBe("O2-Flasche x");
    expect(winAnsi("Soll ≥ 4")).toBe("Soll >= 4");
  });

  /** Eine sichtbare Luecke laedt zum Nachsehen ein, ein spurlos verschwundenes
   *  Zeichen nicht. */
  it("macht aus einem unbekannten Zeichen ein Fragezeichen, kein Nichts", () => {
    expect(winAnsi("Trage 🚑")).toBe("Trage ?");
  });

  /**
   * ⚠️ DIE ZUSICHERUNG, WEGEN DER `winAnsi()` UEBERHAUPT EXISTIERT.
   *
   * `pdf-lib` WIRFT beim Zeichnen jedes Zeichens, das WinAnsi nicht kennt
   * (`WinAnsi cannot encode "✓" (0x2713)`). Der Wurf entstuende erst zur
   * Laufzeit und nur fuer den Bestand, der so ein Zeichen traegt: `typecheck`,
   * `lint` und `build` sind dagegen blind, und ein Test mit sauberen
   * Beispieldaten ebenso. Artikelnamen kommen aber aus Eingabefeldern — ein
   * aus einer Tabellenkalkulation kopiertes Aufzaehlungszeichen ist dort keine
   * Absonderlichkeit, und der ganze Export waere weg, nicht bloss ein Wort.
   */
  it("erzeugt den Bogen auch aus Namen voller exotischer Zeichen", async () => {
    const wild: ChecklisteBlatt = {
      ...RTW,
      name: "RTW ➊ 🚑",
      kennung: "MS‑1 ✓",
      vorlage: "Vorlage ①",
      faecher: [{
        label: "Fach ★",
        positionen: [{
          ...position(1),
          artikelName: "Kompressen 10×10 ✓ ≥25 Stück — „steril​😀",
          einheit: "Pck.",
          verfallText: "läuft 07/26 ab ⚠",
          verfallAuffaellig: true,
        }],
      }],
      geraete: [{ id: "g", name: "Gerät ✂", typ: "objekt", fristText: "⌛ 04/27", fristAuffaellig: false }],
      flaschen: [{ id: "o", name: "O₂ 2 l", nennfuelldruckBar: 200, letzterDruck: null }],
    };
    const bytes = await checklistenPdf([wild], OPTIONEN);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(flach(bytes)).toContain("Kompressen");
  });
});

describe("der Dateiname", () => {
  it("nennt bei einem Fahrzeug dessen Namen und den Stand", () => {
    expect(pdfDateiname([RTW], "15.06.2026")).toBe("checkliste-rtw-1-2026-06-15.pdf");
  });

  it("nennt bei mehreren nur den Stand", () => {
    expect(pdfDateiname([RTW, NEF], "15.06.2026")).toBe("checklisten-2026-06-15.pdf");
  });

  /**
   * ⚠️ ASCII, UND ZWAR VOLLSTAENDIG. Der Name steht ungequotet zwischen
   * Anfuehrungszeichen in `Content-Disposition`; ein Umlaut oder ein
   * Anfuehrungszeichen darin ergibt je nach Browser einen zerhackten oder
   * abgeschnittenen Dateinamen. Der ungekuerzte Fahrzeugname steht im Dokument.
   */
  it("bleibt auch bei Umlauten und Sonderzeichen ASCII", () => {
    const name = pdfDateiname([{ ...RTW, name: 'Löschfahrzeug "Süd" 3/4 ✓' }], "15.06.2026");
    expect(name).toBe("checkliste-loeschfahrzeug-sued-3-4-2026-06-15.pdf");
    expect(name).toMatch(/^[a-z0-9.-]+$/);
  });

  it("faellt auf einen Ersatznamen zurueck, wenn nichts uebrig bleibt", () => {
    expect(pdfDateiname([{ ...RTW, name: "✓✓✓" }], "15.06.2026"))
      .toBe("checkliste-fahrzeug-2026-06-15.pdf");
  });
});
