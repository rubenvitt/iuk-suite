// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import type { AufgabeRow } from "../_db/schema";
import { Frist } from "./Frist";
import { alleQuellDateien, ohneKommentare } from "./testQuellscan";

afterEach(async () => {
  await unmount();
});

const AUFGABE: AufgabeRow = {
  id: "x", titel: "T", beschreibung: "B", prioritaet: "mittel",
  erstellerId: "malte", zugewiesenAn: "alina", status: "verteilt",
  faelligAm: "2026-08-20", faelligUhrzeit: null, dauerMinuten: 60,
  nachweisPflicht: false, nachweisArt: "text", prueferId: "malte",
  istSelbst: false, planDatum: null, planUhrzeit: null, planRang: 0,
  vorschlagDatum: null, vorschlagUhrzeit: null,
  erstelltAm: new Date(0), aktualisiertAm: new Date(0),
};

const HEUTE = "2026-08-17";

describe("Frist — die drei Auspraegungen (§6.2)", () => {
  it("ueberfaellig: Wort MIT Zahl, Warnzeichen, eigene Klasse", async () => {
    await mount(<Frist aufgabe={{ ...AUFGABE, faelligAm: "2026-08-14" }} heute={HEUTE} />);
    const span = query("span");
    expect(span.textContent).toContain("Überfällig seit 3 Tagen");
    expect(span.className).toContain("fristUeberfaellig");
    expect(query("[data-zeichen='warnung']")).toBeTruthy();
  });

  it("heute faellig: „Frist heute“, kein Datum und kein Warnzeichen", async () => {
    await mount(<Frist aufgabe={{ ...AUFGABE, faelligAm: HEUTE }} heute={HEUTE} />);
    const span = query("span");
    expect(span.textContent).toBe("Frist heute");
    expect(span.className).toContain("fristHeute");
  });

  it("sonst: das Datum in der Kurzform, nie in ISO", async () => {
    await mount(<Frist aufgabe={AUFGABE} heute={HEUTE} />);
    const span = query("span");
    expect(span.textContent).toBe("Frist: Do, 20.08.");
    expect(span.className).toContain("frist");
  });

  /*
   * JEDE AUSPRAEGUNG TRAEGT IHR WORT — die Gegenmassnahme zu dem, was der Quelltext-Scan unten
   * STRUKTURELL nicht kann: er faengt keine Fassung, die nur die Kante ohne Wort setzt (§6.6).
   */
  it.each([
    ["2026-08-14", "Überfällig"],
    [HEUTE, "Frist"],
    ["2026-08-20", "Frist"],
  ])("die Auspraegung zu %s traegt ein Wort, nicht nur Form", async (faelligAm, wort) => {
    await mount(<Frist aufgabe={{ ...AUFGABE, faelligAm }} heute={HEUTE} />);
    expect(query("span").textContent).toContain(wort);
  });

  it("beugt an der Singulargrenze: ein Tag ist „seit 1 Tag“", async () => {
    await mount(<Frist aufgabe={{ ...AUFGABE, faelligAm: "2026-08-16" }} heute={HEUTE} />);
    expect(query("span").textContent).toContain("Überfällig seit 1 Tag");
    expect(query("span").textContent).not.toContain("Tagen");
  });

  it("bei zwei Tagen steht der Plural", async () => {
    await mount(<Frist aufgabe={{ ...AUFGABE, faelligAm: "2026-08-15" }} heute={HEUTE} />);
    expect(query("span").textContent).toContain("Überfällig seit 2 Tagen");
  });

  /*
   * `/archiv` BENUTZT DIESELBE KOMPONENTE UND SCHWEIGT DORT — der Beleg, dass die Bedingung nur an
   * EINER Stelle steht (`istUeberfaellig` schliesst `abgeschlossen` aus) und nicht ein zweites Mal
   * im Markup nachgebaut ist.
   */
  it("eine abgeschlossene Aufgabe mit verstrichener Frist ist nie ueberfaellig", async () => {
    await mount(
      <Frist aufgabe={{ ...AUFGABE, status: "abgeschlossen", faelligAm: "2026-08-14" }} heute={HEUTE} />,
    );
    expect(query("span").textContent).toBe("Frist: Fr, 14.08.");
  });

  it("eine abgeschlossene Aufgabe mit heutiger Frist bekommt keine Aufforderung", async () => {
    await mount(
      <Frist aufgabe={{ ...AUFGABE, status: "abgeschlossen", faelligAm: HEUTE }} heute={HEUTE} />,
    );
    expect(query("span").textContent).toBe("Frist: Mo, 17.08.");
  });
});

/*
 * DER MODULWEITE QUELLTEXT-SCAN GEGEN DIE VIERTE FASSUNG (§6.6) — Muster `SeitenKopf.test.tsx`.
 *
 * ZWEI ERLAUBTE ORTE, BEIDE EINMALIG: `_ui/Frist.tsx` rendert die FORM, `_lib/anzeige.ts` haelt die
 * TEXTE. Ein dritter Ort waere per Definition eine zweite Darstellung — genau der Befund, gegen den
 * diese Runde geschrieben ist.
 *
 * UEBER `.ts` UND `.tsx`, UND DAS IST DER UNTERSCHIED ZUM SIEGERENTWURF (§9/S8): dort griff der
 * Scan nur ueber `.tsx`, waehrend die neue Ueberfaellig-Prosa in `lage.ts` lag und ihm damit
 * entkam — ein Riegel, der genau das durchlaesst, wogegen er geschrieben ist. `alleQuellDateien`
 * nimmt beide Endungen; deshalb steht in `_lib/lage.ts` auch keine Prosa, sondern nur `art` und
 * Zahlen (§4.1, fuenfte Bauregel).
 *
 * DER SCAN LIEST DURCH `ohneKommentare(quelle)`, UND OHNE DAS WAERE ER AM ERSTEN TAG ROT — auf
 * einer Datei, die §11.3 ausdruecklich als unberuehrt zusagt: `_lib/seedLokal.ts:63` („und lauter
 * überfällige Aufgaben") und `:343` („// Überfällig: faelligAm in der Vergangenheit") tragen das
 * Wort in KOMMENTAREN, und `alleQuellDateien` nimmt jede `.ts`/`.tsx` unter der Wurzel. Die Meldung
 * zeigte dann auf den Seed statt auf die Darstellung.
 *
 * `seedLokal.ts` WIRD DESHALB AUSDRUECKLICH KEINE DRITTE AUSNAHME: Kommentare sind kein
 * Anzeigetext, und eine Ausnahmeliste, die DATEIEN statt ROLLEN nennt, waechst mit jedem Kommentar.
 * Derselbe Kommentar in dieser Datei faellt aus demselben Grund heraus.
 *
 * WAS DER SCAN NICHT KANN: eine Fassung fangen, die nur die Kante OHNE Wort setzt. Genannt, nicht
 * verschwiegen — die Faelle „jede Auspraegung traegt ihr Wort" oben sind die Gegenmassnahme.
 */
const WURZEL = "src/app/m/aufgaben";
/*
 * DRITTER ORT SEIT DER BEDIENUNGSANLEITUNG: `_lib/hilfe.ts` — UND ES IST EINE ROLLE, KEINE
 * DATEI-AUSNAHME (die Warnung im Kopfkommentar oben gilt weiter).
 *
 * §6.6 nennt zwei Rollen: „`Frist.tsx` rendert die Form, `anzeige.ts` haelt die Texte." Die
 * Anleitung ist eine dritte: sie ERKLAERT den Begriff, den die Flaeche zeigt. Und sie kann ihn
 * strukturell nicht falsch verwenden — sie liest keine `AufgabeRow`, kennt keinen Zustand und
 * kein Datum, sondern beschreibt in Prosa, was „überfällig" heisst. Genau davor steht der Riegel
 * ja auch nicht: er verhindert, dass eine ZWEITE Fassung der Dringlichkeitsansage neben
 * `FRIST_TEXT` entsteht und mit ihr auseinanderlaeuft.
 *
 * DER PREIS, AUSGESCHRIEBEN: der Scan sieht in `hilfe.ts` nicht mehr hin. Wer dort je eine
 * Aufgabenzeile darstellen wollte, muesste sie ohnehin erst importieren — und das faellt in der
 * Prosa-Datei sofort auf.
 *
 * DAS WORT WEGZULASSEN WAERE DIE SCHLECHTERE ANTWORT GEWESEN: die Anleitung muss dasselbe Wort
 * benutzen wie die Flaeche, sonst erklaert sie eine Marke, die niemand wiedererkennt.
 */
const ERLAUBT = [
  "src/app/m/aufgaben/_ui/Frist.tsx",
  "src/app/m/aufgaben/_lib/anzeige.ts",
  "src/app/m/aufgaben/_lib/hilfe.ts",
];
const WORT = /überfällig/i;

function scanneDatei(datei: string, quelle: string): string[] {
  if (ERLAUBT.includes(datei.split("\\").join("/"))) return [];
  return WORT.test(ohneKommentare(quelle)) ? [datei] : [];
}

describe("„überfällig“ steht im Modul an genau zwei Orten (§6.6)", () => {
  const dateien = alleQuellDateien(WURZEL);

  it("findet ueberhaupt Dateien (sonst prueft der Scan nichts)", () => {
    expect(dateien.length).toBeGreaterThan(5);
  });

  it("die beiden erlaubten Orte gibt es wirklich — sonst prueft die Ausnahme nichts", () => {
    const gefunden = dateien.map((d) => d.split("\\").join("/"));
    for (const ort of ERLAUBT) {
      expect(gefunden, `${ort} steht nicht in der Scanliste`).toContain(ort);
    }
  });

  /**
   * DIE TEXTE STEHEN WIRKLICH IN `anzeige.ts` — eine Ausnahmeliste fuer eine Datei, die das Wort
   * gar nicht (mehr) enthaelt, waere eine Attrappe: der Scan bliebe gruen, waehrend die
   * Darstellung woanders entstuende.
   *
   * FUER `_ui/Frist.tsx` GILT DIESE PRUEFUNG BEWUSST NICHT. §6.6 nennt ZWEI erlaubte Orte nach
   * ROLLE: „`Frist.tsx` rendert die Form, `anzeige.ts` haelt die Texte." Heute liest `Frist.tsx`
   * jedes Wort aus `FRIST_TEXT` und traegt ausserhalb seines Kopfkommentars keine einzige
   * Zeichenkette — die Erlaubnis bleibt trotzdem stehen, weil sie zur Rolle gehoert und nicht zum
   * heutigen Zustand. Wer sie streicht, zwingt die naechste Auspraegung in eine dritte Datei.
   */
  it("`_lib/anzeige.ts` traegt die Texte tatsaechlich", () => {
    expect(WORT.test(ohneKommentare(readFileSync("src/app/m/aufgaben/_lib/anzeige.ts", "utf8")))).toBe(
      true,
    );
  });

  it("keine andere Datei unter `src/app/m/aufgaben/**` traegt das Wort", () => {
    const befunde = dateien.flatMap((datei) => scanneDatei(datei, readFileSync(datei, "utf8")));
    expect(befunde).toEqual([]);
  });

  /*
   * GEGENPROBEN, wie bei `SeitenKopf.test.tsx`: ein Scan, der bei null Treffern ebenso gruen bliebe
   * wie bei zehn, beweist nichts.
   */
  const faelle: { name: string; datei: string; quelle: string; trifft: boolean }[] = [
    { name: "gross geschrieben in JSX", datei: "a.tsx", quelle: "<span>Überfällig</span>;", trifft: true },
    { name: "klein als Suffix", datei: "a.tsx", quelle: 'const x = " · überfällig";', trifft: true },
    { name: "gebeugt (Ueberschrift)", datei: "a.tsx", quelle: '<h2>Überfällige Aufgaben</h2>;', trifft: true },
    { name: "in einer .ts-Datei — der Fall aus §9/S8", datei: "a.ts", quelle: 'const s = "überfällig";', trifft: true },
    // DIE ZWEI SEED-ZEILEN, WOERTLICH: sie sind Kommentare und deshalb KEIN Befund.
    { name: "seedLokal.ts:63 (Blockkommentar)", datei: "a.ts", quelle: "/*\n * und lauter überfällige Aufgaben; ein Lauf heute\n */\n", trifft: false },
    { name: "seedLokal.ts:343 (Zeilenkommentar)", datei: "a.ts", quelle: "  // Überfällig: faelligAm in der Vergangenheit.\n", trifft: false },
    // DER BEZEICHNER IST KEIN ANZEIGETEXT: `istUeberfaellig` traegt keine Umlaute und ist damit
    // strukturell kein Treffer — sonst waere jede Aufrufstelle des Praedikats rot.
    { name: "der Bezeichner istUeberfaellig", datei: "a.ts", quelle: "if (istUeberfaellig(a, heute)) {}", trifft: false },
    { name: "unverwandter Text", datei: "a.tsx", quelle: "<span>Frist heute</span>;", trifft: false },
  ];

  for (const fall of faelle) {
    it(`Gegenprobe: ${fall.name}`, () => {
      expect(scanneDatei(fall.datei, fall.quelle).length > 0).toBe(fall.trifft);
    });
  }

  it("Gegenprobe: dieselbe verbotene Form in einem der erlaubten Orte bleibt gruen", () => {
    expect(scanneDatei(ERLAUBT[0]!, "<span>Überfällig</span>;")).toEqual([]);
  });
});
