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
