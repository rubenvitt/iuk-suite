// src/app/m/radio/_lib/suchparameter.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SORTIER_SCHLUESSEL,
  SUCHFELDER,
  SUCHFELDER_VORGABE,
} from "./lesepfade/geraete";
import {
  LEERE_FILTER,
  SEITEN_GROESSE,
  angewandt,
  geraeteParameterAus,
  sortierungLesen,
  sortierungZeichenkette,
  suchparameterZu,
  ausleihenParameterAus,
  ausleihenSuchparameterZu,
} from "./suchparameter";

/**
 * DER SUCHPARAMETER-VERTRAG DER GERAETELISTE (§5.7.1,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:4631-4645`; Aufgabe V13).
 *
 * ⛔ ER IST DIE FACHLOGIK OHNE OBERFLAECHE, und deshalb steht er unter `_lib/` und nicht
 * neben der Insel. Der Vorbildverweis des Briefs zeigt auf
 * `lagerbuch/verwaltung/(arbeit)/journal/journalFilterLogik.ts`; die Ablage unter `_lib/`
 * ist der Unterschied, und sie ist nicht kosmetisch: nur dort gilt fuer die Datei der
 * Direktivenscan aus `riegel.test.ts:909-962` (kein `"use client"`, kein `"use server"`).
 * Eine Datei mit `"use client"` machte aus jedem hier exportierten WERT eine
 * Client-Referenz, sobald die Server Component sie liest — Falle 6, HTTP 500, und weder
 * typecheck noch lint noch build sagen ein Wort.
 */

const QUELLE = "src/app/m/radio/_lib/suchparameter.ts";

describe("radio-suchparameter: der Vertrag der Geraeteliste", () => {
  it("die Seitengroesse ist fest zwanzig", () => {
    /*
     * 1:1 aus `radio-admin/client/src/features/devices/DeviceList.tsx:28`
     * (`const PAGE_SIZE = 20;`) — und OHNE Groessenwechsler
     * (`DeviceList.tsx:168`: `showSizeChanger: false`). ⚠️ Die Vorgabe des Lesepfads ist
     * eine ANDERE (25, `_lib/lesepfade/geraete.ts:398`, 1:1 zu
     * `radio-admin/server/src/repos/deviceRepo.ts:193`); wer sie hier stehen liesse,
     * zeigte zwanzig Zeilen pro Seite im Bestand und fuenfundzwanzig in der Suite.
     */
    expect(SEITEN_GROESSE).toBe(20);
    const { filter } = geraeteParameterAus({});
    expect(filter.seitenGroesse, "die Seitengroesse erreicht den Lesepfad nicht").toBe(20);
  });

  it("ein geleerter Filter verschwindet aus den Parametern", () => {
    /*
     * ⛔ DER FALL AUS `DeviceList.tsx:77-78`, mit dem Alt-Kommentar als Beleg: „Map every
     * filter key explicitly (not a spread) so that clearing a filter actually removes it
     * from params."
     *
     * ⛔ WARUM DER MERGE MITGEMESSEN WIRD UND NICHT NUR DER PATCH: die Insel schreibt
     * ihre Werte in eine BESTEHENDE Adresszeile (`angewandt`), wie
     * `lagerbuch/_ui/useUrlFilter.ts:16-27`. Baut `suchparameterZu` seinen Patch per
     * Spread ueber nur die GESETZTEN Werte, fehlt der geleerte Schluessel im Patch — und
     * der alte Wert bleibt in der URL stehen. Ein Test, der nur den Patch anschaut,
     * saehe genau das nicht.
     */
    const { werte } = geraeteParameterAus({ status: "Defekt", q: "abc" });
    expect(werte.filter.status).toEqual(["Defekt"]);

    const geleert = { ...werte, filter: { ...werte.filter, status: [] } };
    const patch = suchparameterZu(geleert);
    expect(patch.status, "der geleerte Filter fehlt im Patch statt leer zu sein").toBe("");

    const bestand = new URLSearchParams("status=Defekt&q=abc");
    const nachher = angewandt(bestand, patch);
    expect(nachher.has("status"), "der geleerte Filter steht noch in der URL").toBe(false);
    expect(nachher.get("q"), "der Suchtext ist mit verschwunden").toBe("abc");
  });

  it("alle zehn Filter stehen im Patch, auch die ungesetzten", () => {
    /*
     * Die andere Haelfte desselben Falles: die ZEHN Filter aus `DeviceList.tsx:82-91`
     * (`updateStatus`, `status`, `location`, `deviceType`, `funktion`, `hersteller`,
     * `deviceModes`, `loanable`, `alamosIntegrated`, `hasUpdateNote`) sind je EINZELN
     * abgebildet. Fehlte einer, bliebe genau er beim Leeren stehen.
     */
    const patch = suchparameterZu(geraeteParameterAus({}).werte);
    for (const name of [
      "updateStand",
      "status",
      "lagerort",
      "geraeteTyp",
      "funktion",
      "hersteller",
      "geraeteFunktionen",
      "ausleihbar",
      "alamos",
      "hatAbweichung",
    ]) {
      expect(Object.hasOwn(patch, name), `der Filter ${name} fehlt im Patch`).toBe(true);
    }
  });

  it("die Sortierung wird als schluessel:richtung gelesen und geschrieben", () => {
    /*
     * 1:1 aus `DeviceList.tsx:120-123`:
     * `sort = \`${String(single.columnKey)}:${single.order === 'descend' ? 'desc' : 'asc'}\``.
     * ⛔ Die Richtung kennt genau ZWEI Woerter; alles, was nicht `descend` ist, ist
     * aufsteigend — deshalb kein Fehlerzweig und kein dritter Zustand.
     */
    expect(sortierungZeichenkette("rufname", "descend")).toBe("rufname:desc");
    expect(sortierungZeichenkette("rufname", "ascend")).toBe("rufname:asc");
    expect(sortierungZeichenkette("rufname", null), "ohne Richtung keine Sortierung").toBe("");
    expect(sortierungZeichenkette(undefined, "descend"), "ohne Schluessel keine Sortierung").toBe("");

    expect(sortierungLesen("issi:desc")).toEqual({ schluessel: "issi", richtung: "desc" });
    expect(sortierungLesen("issi:asc")).toEqual({ schluessel: "issi", richtung: "asc" });
    expect(sortierungLesen(""), "die leere Sortierung ist keine").toBeNull();
  });

  it("ein unbekannter Sortierschluessel wird verworfen, nicht durchgereicht", () => {
    /*
     * ⛔ DIE ZWEITE VERTEIDIGUNGSLINIE VOR DEM LESEPFAD (Entscheidung E-V9,
     * `.superpowers/sdd/planteil4/briefs/KOPF.md:708-733`). Der Lesepfad selbst laesst
     * einen unbekannten Schluessel still auf die Vorgabe `desc(createdAt)` fallen
     * (`_lib/lesepfade/geraete.ts:504-511`, 1:1 zu `deviceRepo.ts:196-201`) — er ist also
     * nicht gefaehrlich, aber er ist auch nichts, was in der Adresszeile stehen bleiben
     * soll. Wer ihn durchreichte, zeigte in der URL eine Sortierung an, die die Tabelle
     * nicht hat.
     *
     * ⛔ DIE ACHT ANNEHMBAREN SCHLUESSEL KOMMEN AUS `SORTIER_SCHLUESSEL`
     * (`_lib/lesepfade/geraete.ts:273`) und werden hier NICHT zweitgeschrieben. Der
     * Alt-Kommentar `deviceColumns.tsx:12-15` nennt nur sechs — der Vertrag ist der Code,
     * den er beschreibt.
     */
    expect(sortierungZeichenkette("erfundenerSchluessel", "descend")).toBe("");
    const { werte, filter } = geraeteParameterAus({ sortierung: "erfundenerSchluessel:desc" });
    expect(werte.sortierung, "der unbekannte Schluessel steht in der Adresszeile").toBe("");
    expect(filter.sortierung, "der unbekannte Schluessel erreicht den Lesepfad").toBeUndefined();

    const bekannt = geraeteParameterAus({ sortierung: "lastUpdatedAt:desc" });
    expect(
      bekannt.filter.sortierung,
      "ein Schluessel der Server-Liste wurde verworfen (E-V9)",
    ).toBe("lastUpdatedAt:desc");
    expect(SORTIER_SCHLUESSEL).toContain("lastUpdatedAt");
  });

  it("unbekannte Suchfelder werden DURCHGEREICHT, nicht weggeworfen", () => {
    /*
     * ⛔ HIER LAEUFT DER VERTRAG GEGENLAEUFIG ZUR SORTIERUNG, UND DAS IST GEMESSEN.
     * `_lib/lesepfade/geraete.ts:456-472` (1:1 zu `deviceRepo.ts:159-173`) fuehrt einen
     * SICHERHEITSZWEIG: sind ALLE angeforderten Felder unbekannt, liefert die Abfrage
     * KEINE Zeile (`sql\`0\``) — „never interpolate unknown names into SQL". Eine LEERE
     * Feldliste bedeutet dagegen etwas voellig anderes: die sieben Vorgabefelder
     * (`:458`).
     *
     * ⛔ WER HIER UNBEKANNTE FELDER WEGWIRFT, DREHT „alle unbekannt ⇒ keine Zeile" IN
     * „alle unbekannt ⇒ Vorgabefelder ⇒ ALLE Zeilen" — und kein Tor sagt etwas dazu.
     * Das ist zeichengleich der Praezedenzfall dieses Wegs, in dem ein Lesepfad den
     * `loanable`-Filter weggelassen haette.
     */
    const { werte, filter } = geraeteParameterAus({ q: "abc", sf: "erfundenesFeld" });
    expect(werte.sf).toEqual(["erfundenesFeld"]);
    expect(filter.suchfelder, "das unbekannte Feld wurde weggeworfen").toEqual(["erfundenesFeld"]);
    expect(SUCHFELDER, "das Feld ist entgegen der Annahme doch bekannt").not.toContain(
      "erfundenesFeld",
    );

    const ohne = geraeteParameterAus({ q: "abc" });
    expect(ohne.werte.sf, "ohne sf gelten die sieben Vorgabefelder").toEqual([
      ...SUCHFELDER_VORGABE,
    ]);
  });

  it("die drei Schalter filtern NUR, wenn sie wahr sind", () => {
    /*
     * ⛔ 1:1 aus `deviceRepo.ts:186-188` (`if (params.loanable) ...`), im Suite-Lesepfad
     * ausgeschrieben als `_lib/lesepfade/geraete.ts:491-493`: „nicht ausleihbar" ist in
     * dieser Maske NICHT ausdrueckbar. Ein `false`, das den Lesepfad erreichte, waere
     * heute wirkungslos — und genau deshalb der stille Fehler von morgen, wenn jemand
     * dort `!== undefined` schreibt.
     */
    const aus = geraeteParameterAus({});
    expect(aus.filter.ausleihbar, "ein false erreicht den Lesepfad").toBeUndefined();
    expect(aus.filter.alamos).toBeUndefined();
    expect(aus.filter.hatAbweichung).toBeUndefined();

    const an = geraeteParameterAus({ ausleihbar: "1", alamos: "1", hatAbweichung: "1" });
    expect(an.filter.ausleihbar).toBe(true);
    expect(an.filter.alamos).toBe(true);
    expect(an.filter.hatAbweichung).toBe(true);
    expect(an.werte.filter.ausleihbar).toBe(true);
  });

  it("die Seite ist eins-basiert und faellt nie unter eins", () => {
    /*
     * `DeviceList.tsx:126` (`page: pagination.current ?? 1`). Ein `seite=0` oder
     * `seite=abc` aus einer von Hand getippten Adresszeile darf keinen negativen
     * `OFFSET` erzeugen — der Lesepfad rechnet `(seite - 1) * seitenGroesse`
     * (`_lib/lesepfade/geraete.ts:521`).
     */
    expect(geraeteParameterAus({}).werte.seite).toBe(1);
    expect(geraeteParameterAus({ seite: "3" }).werte.seite).toBe(3);
    expect(geraeteParameterAus({ seite: "0" }).werte.seite).toBe(1);
    expect(geraeteParameterAus({ seite: "abc" }).werte.seite).toBe(1);
    expect(geraeteParameterAus({ seite: "-4" }).werte.seite).toBe(1);
  });

  it("die Listenfilter kommen kommagetrennt und getrimmt an", () => {
    /*
     * ⛔ KOMMAGETRENNT, wie die Suchfelder (`DeviceList.tsx:70-71` reicht ein Feld-ARRAY
     * an den Umschlag; die URL kann nur Zeichenketten). Leere Glieder fallen weg, sonst
     * entstuende ein `IN ('')` — der Lesepfad wirft sie zwar ein zweites Mal weg
     * (`_lib/lesepfade/geraete.ts:367-369`), aber die Adresszeile soll sie gar nicht
     * erst zeigen.
     */
    const { werte, filter } = geraeteParameterAus({ status: "Defekt, Wartung ,, " });
    expect(werte.filter.status).toEqual(["Defekt", "Wartung"]);
    expect(filter.status).toEqual(["Defekt", "Wartung"]);
    expect(suchparameterZu(werte).status).toBe("Defekt,Wartung");
  });

  it("ein mehrfach gesetzter Parameter nimmt den ERSTEN Wert", () => {
    /*
     * ⚠️ Next reicht `?q=a&q=b` als `string[]` durch (`searchParams`); ohne diese Faltung
     * stuende ein Array dort, wo der Vertrag eine Zeichenkette fuehrt, und
     * `String(["a","b"])` ergaebe still den Suchbegriff `a,b`.
     */
    expect(geraeteParameterAus({ q: ["a", "b"] }).werte.q).toBe("a");
  });

  it("der leere Filtersatz ist wirklich leer", () => {
    /*
     * `LEERE_FILTER` ist der Wert, den der Zuruecksetzen-Knopf der Schublade setzt
     * (1:1 `DeviceFilterDrawer.tsx:11`, `EMPTY_FILTERS`). Ein vergessenes Feld darin
     * ist ein Filter, den „Zuruecksetzen" nicht zuruecksetzt.
     */
    const patch = suchparameterZu({ ...geraeteParameterAus({}).werte, filter: LEERE_FILTER });
    const gesetzt = Object.entries(patch).filter(([, wert]) => wert !== "");
    expect(gesetzt.map(([name]) => name)).toEqual([]);
  });

  it("traegt keine Bauform-Direktive", () => {
    /*
     * Falle 6, dieselbe Zusage wie in `riegel.test.ts:909-962` — hier zusaetzlich an der
     * Datei selbst, weil sie der WERTLIEFERANT der Insel und der Server Component
     * zugleich ist.
     */
    const quelle = readFileSync(QUELLE, "utf8");
    expect(quelle).not.toMatch(/^\s*["']use client["']/m);
    expect(quelle).not.toMatch(/^\s*["']use server["']/m);
  });
});

describe("radio-suchparameter: der Vertrag der Ausleihenliste (V-L11)", () => {
  /*
   * ⛔ ER STEHT IN DERSELBEN DATEI WIE DER DER GERAETELISTE UND NICHT IN EINER ZWEITEN —
   * Vorabscan-Fund F3 (`.superpowers/sdd/planteil4/VORABSCAN.md:146-148`, woertlich: „die
   * Normalisierung in `_lib/suchparameter.ts` (V13) mitfuehren, ⛔ nicht in einer zweiten
   * Datei"). Zwei Vertragsdateien nebeneinander liefen bei der naechsten gemeinsamen Regel
   * auseinander.
   *
   * ⛔ WARUM ES IHN UEBERHAUPT GIBT: Betreiberentscheidung ⬜ **V-L11** vom 2026-08-24
   * (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „✅ V-L11": „Beides."). Der Plan
   * sah an drei Stellen ausdruecklich KEIN Bedienelement vor; die Entscheidung ueberholt ihn.
   */
  const TAG_SOMMER = "2026-06-14";
  const TAG_WINTER = "2026-01-15";

  it("der Geraetefilter wirkt nur, wenn er gesetzt ist", () => {
    /*
     * ⛔ 1:1 DIE WAHRHEITSPRUEFUNG DER DATENFUNKTION (`_db/leihen.ts`, `if (f.geraeteId)`,
     * uebernommen aus `loanRepo.ts:139`): eine LEERE Id filtert nicht, statt nichts zu
     * finden. Ein `!== undefined` an dieser Stelle ergaebe fuer `?geraet=` eine dauerhaft
     * leere Liste ohne Fehlermeldung.
     */
    expect(ausleihenParameterAus({ geraet: "g-1" }).parameter.geraeteId).toBe("g-1");
    expect(ausleihenParameterAus({ geraet: "  " }).parameter.geraeteId).toBeUndefined();
    expect(ausleihenParameterAus({}).parameter.geraeteId).toBeUndefined();
  });

  it("von ist der Anfang und bis das ENDE des Kalendertags", () => {
    /*
     * ⛔ DER FALL, DER DIESE UMRECHNUNG UEBERHAUPT RECHTFERTIGT. `leihhistorie` vergleicht
     * `lte(borrowedAt, bis)` gegen einen Zeitstempel (`_db/leihen.ts`). Waere `bis` der
     * TAGESANFANG, fiele jede Leihe heraus, die an diesem Tag nach Mitternacht ausgeliehen
     * wurde — `von = bis = heute` ergaebe eine leere Liste, und kein Typ, kein Lint und kein
     * Build saehe es.
     */
    const { parameter } = ausleihenParameterAus({ von: TAG_SOMMER, bis: TAG_SOMMER });
    // Berlin liegt im Juni auf UTC+2.
    expect(parameter.von?.toISOString()).toBe("2026-06-13T22:00:00.000Z");
    expect(parameter.bis?.toISOString()).toBe("2026-06-14T21:59:59.999Z");
  });

  it("die Tagesraender rechnen in Berlin und nicht in UTC", () => {
    /*
     * ⛔ `new Date("2026-01-15")` WAERE UTC-MITTERNACHT und damit 01:00 Berliner Zeit — eine
     * Stunde des gewaehlten Tages fiele vorne heraus und eine Stunde des Vortags herein.
     * Der Winterfall misst den anderen Versatz (+1) und faengt damit einen fest verdrahteten
     * Sommerversatz.
     */
    const { parameter } = ausleihenParameterAus({ von: TAG_WINTER, bis: TAG_WINTER });
    expect(parameter.von?.toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(parameter.bis?.toISOString()).toBe("2026-01-15T22:59:59.999Z");
  });

  it("an den zwei Umstellungstagen tragen die beiden Tagesraender VERSCHIEDENE Versaetze", () => {
    /*
     * ⛔ DER FALL, DER DIE ZWEI-KANDIDATEN-FORM RECHTFERTIGT. An diesen zwei Tagen ist der
     * Zonenversatz innerhalb DESSELBEN Tages verschieden: ein einmal (etwa zur Mittagszeit)
     * abgelesener Versatz, auf beide Raender angewandt, liegt an EINEM der beiden um eine
     * Stunde daneben — und zwar still.
     *
     * 29.03.2026 ist der letzte Maerzsonntag (Beginn der Sommerzeit): der Tag beginnt mit
     * UTC+1 und endet mit UTC+2. 25.10.2026 ist der letzte Oktobersonntag: umgekehrt.
     */
    const fruehjahr = ausleihenParameterAus({ von: "2026-03-29", bis: "2026-03-29" }).parameter;
    expect(fruehjahr.von?.toISOString(), "Tagesanfang noch in der Winterzeit (UTC+1)").toBe(
      "2026-03-28T23:00:00.000Z",
    );
    expect(fruehjahr.bis?.toISOString(), "Tagesende schon in der Sommerzeit (UTC+2)").toBe(
      "2026-03-29T21:59:59.999Z",
    );

    const herbst = ausleihenParameterAus({ von: "2026-10-25", bis: "2026-10-25" }).parameter;
    expect(herbst.von?.toISOString(), "Tagesanfang noch in der Sommerzeit (UTC+2)").toBe(
      "2026-10-24T22:00:00.000Z",
    );
    expect(herbst.bis?.toISOString(), "Tagesende schon in der Winterzeit (UTC+1)").toBe(
      "2026-10-25T22:59:59.999Z",
    );
  });

  it("die Zone haengt nicht an der Zone des Prozesses", () => {
    /*
     * Dieselbe Bauform und derselbe Grund wie in `_lib/anzeige.test.ts` („die Zone haengt
     * nicht an der Zone des Prozesses"): auf einer deutschen Entwicklungsmaschine waere ein
     * Rueckfall auf die Systemzone von der richtigen Fassung nicht zu unterscheiden und im
     * Container (UTC) um ein bis zwei Stunden falsch.
     */
    const vorher = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      const { parameter } = ausleihenParameterAus({ von: TAG_SOMMER });
      expect(parameter.von?.toISOString()).toBe("2026-06-13T22:00:00.000Z");
    } finally {
      process.env.TZ = vorher;
    }
  });

  it("ein unmoeglicher Kalendertag wird verworfen — in der Adresse UND im Filter", () => {
    /*
     * ⛔ „2026-02-31" IST FORMATGERECHT UND EXISTIERT NICHT. Eine blosse Formatpruefung
     * liesse ihn durch, und die Rechnung landete beim 3. Maerz — der Filter zeigte still zu
     * viel. Dieselbe Strenge wie in `lagerbuch/_lib/format.ts` (`grenze`: Format UND echter
     * Kalendertag).
     *
     * ⛔ UND DER WERT VERSCHWINDET AUCH AUS `werte`: sonst zeigte das Datumsfeld einen
     * Zeitraum an, nach dem gar nicht gefiltert wird — genau der stille Ausgang, den
     * `lagerbuch/_lib/format.ts:106-116` ausschreibt.
     */
    const { werte, parameter } = ausleihenParameterAus({ von: "2026-02-31", bis: "kein Datum" });
    expect(parameter.von).toBeUndefined();
    expect(parameter.bis).toBeUndefined();
    expect(werte.von).toBe("");
    expect(werte.bis).toBe("");
  });

  it("die Seitenzahl faellt bei jedem unbrauchbaren Wert auf eins", () => {
    expect(ausleihenParameterAus({ seite: "3" }).werte.seite).toBe(3);
    for (const wert of ["0", "-2", "zwei", "", undefined]) {
      expect(ausleihenParameterAus({ seite: wert }).werte.seite, `Seite aus ${wert}`).toBe(1);
    }
  });

  it("die Seitengroesse steht im Lesepfad und NICHT in diesem Vertrag", () => {
    /*
     * ⛔ SIE IST EINE ANDERE ZAHL ALS DIE DER GERAETELISTE UND HAT EINEN ANDEREN BELEG
     * (`LoanList.tsx:8` gegen `DeviceList.tsx:28`). Sie steht in
     * `_lib/lesepfade/ausleihen.ts` (`AUSLEIHEN_SEITENGROESSE`); schriebe dieser Vertrag sie
     * ein zweites Mal hin, zeigte die Flaeche eine andere Zahl an, als die Abfrage benutzt.
     */
    const quelle = readFileSync(QUELLE, "utf8");
    const werte = ausleihenParameterAus({});
    expect(Object.keys(werte.parameter).includes("seitenGroesse")).toBe(false);
    expect(quelle, "die Ausleihen-Seitengroesse steht hier ein zweites Mal").not.toMatch(
      /AUSLEIHEN_SEITENGROESSE/,
    );
  });

  it("der Patch fuehrt ALLE vier Schluessel, auch die leeren", () => {
    /*
     * ⛔ DERSELBE GRUND WIE BEI `suchparameterZu` OBEN (`DeviceList.tsx:77-78`: „so that
     * clearing a filter actually removes it from params"): die Insel schreibt in eine
     * BESTEHENDE Adresszeile. Ein Patch, der nur die gesetzten Werte fuehrt, liesse den
     * geleerten Filter dort stehen.
     */
    expect(
      ausleihenSuchparameterZu({ geraet: "", von: "", bis: "", seite: 1 }),
    ).toEqual({ geraet: "", von: "", bis: "", seite: "" });

    expect(
      ausleihenSuchparameterZu({ geraet: "g-1", von: TAG_SOMMER, bis: TAG_WINTER, seite: 4 }),
    ).toEqual({ geraet: "g-1", von: TAG_SOMMER, bis: TAG_WINTER, seite: "4" });
  });
});
