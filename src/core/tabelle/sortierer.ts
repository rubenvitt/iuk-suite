/**
 * Vergleichsfunktionen für `columns[].sorter` — die Sortierung wandert damit in
 * den Spaltenkopf, wo antd sie von sich aus anbietet, statt in eine Knopfleiste
 * über der Tabelle.
 *
 * KEIN "use client" (Falle 6). Eine Spaltenliste OHNE `render` darf in einer
 * Server Component stehen; käme der Vergleicher aus einem Client-Modul, bekäme
 * sie eine Client-Referenz statt der Funktion — HTTP 500 für die ganze Seite,
 * das `build` nicht sieht und Vitest strukturell nicht sehen KANN.
 *
 * ⚠️ EIN GETEILTER `Intl.Collator`, NICHT `localeCompare` JE AUFRUF. Ein Sortier‐
 * lauf über 1000 Zeilen ruft den Vergleicher rund 10 000 Mal; `localeCompare`
 * baut in mehreren Engines bei JEDEM Aufruf ein Collator-Objekt auf. Einmal
 * gebaut und wiederverwendet ist dieselbe Ordnung um ein Vielfaches billiger.
 * `numeric: true` sortiert außerdem „Fach 2" vor „Fach 10" — in einem Lager mit
 * durchnummerierten Fächern ist die rein lexikalische Ordnung schlicht falsch.
 *
 * ⛔ **KEIN SORTIERER ÜBER EINER UNVOLLSTÄNDIGEN LISTE.** Das ist die Regel, die
 * dieser Änderung (DRK-331) dreimal um die Ohren geflogen ist — im Journal, im
 * Audit-Protokoll des Portals und in vier gedeckelten Historien —, und sie ist
 * eine Korrektheits-, keine Geschmacksfrage.
 *
 * **Ein Sortierer verspricht ein EXTREM.** „Zeit aufsteigend" heißt: oben steht
 * der älteste Eintrag. „Menge absteigend": oben steht die größte Buchung. Hält
 * die Tabelle nur einen AUSSCHNITT — die neuesten hundert, die neuesten
 * fünfzig, die erste Cursor-Seite —, ist dieses Versprechen genau dann falsch,
 * wenn der Deckel greift. Und dann sagt es niemand: die Zeile steht oben, sie
 * sieht richtig aus, und der gesuchte Datensatz liegt außerhalb.
 *
 * Es hilft NICHT, dass über der Tabelle „Neueste 50 von mehr Treffern" steht.
 * Der Satz erklärt die MENGE; der Spaltenkopf behauptet etwas über die
 * ORDNUNG, und beide Aussagen liest niemand zusammen.
 *
 * Erlaubt ist ein Vergleicher deshalb nur, wo die Tabelle ALLES hält, was der
 * Filter trifft (Artikel, Fahrzeuge, Geräte …). Wo sie das nicht tut:
 * - die Ordnung gehört in die ABFRAGE (`ORDER BY`), fest und dokumentiert, oder
 * - `sorter: true` — antds Wort für „serverseitig sortiert, NICHT hier"
 *   (Vorbild: `radio/GeraeteTabelle`).
 *
 * Für Spaltenfilter gilt dasselbe in schwächerer Form: sie grenzen den
 * Ausschnitt ein, statt eine Aussage über den Bestand zu machen — und können
 * bei automatischem Nachladen einen Leerlauf erzeugen (Journal, DRK-331).
 */
const SAMMLER = new Intl.Collator("de", { numeric: true, sensitivity: "base" });

/**
 * ⚠️ LEERE WERTE STEHEN AUFSTEIGEND HINTEN — und absteigend damit vorn.
 *
 * Das ist keine Nachlässigkeit, sondern die Grenze der Schnittstelle: antd
 * bekommt EINEN Vergleicher und dreht sein Ergebnis für die absteigende
 * Richtung schlicht um. „Leeres immer ans Ende" ließe sich nur mit Kenntnis der
 * Richtung bauen, die der Vergleicher nicht hat. Wer eine Spalte braucht, in der
 * das Fehlen selbst eine Aussage trägt (die Verfallsspalte im Lagerbuch), gibt
 * ihr einen eigenen Vergleicher statt diesen zu verbiegen.
 */
const LEER_ZULETZT = 1;

type Feld<T, W> = (zeile: T) => W | null | undefined;

/** Text, deutsche Sortierfolge, Ziffernfolgen numerisch. */
export function nachText<T>(feld: Feld<T, string>): (a: T, b: T) => number {
  return (a, b) => {
    const wa = feld(a);
    const wb = feld(b);
    if (!wa && !wb) return 0;
    if (!wa) return LEER_ZULETZT;
    if (!wb) return -LEER_ZULETZT;
    return SAMMLER.compare(wa, wb);
  };
}

/** Zahlen. `null`/`undefined` zählen als fehlend, `0` ausdrücklich nicht. */
export function nachZahl<T>(feld: Feld<T, number>): (a: T, b: T) => number {
  return (a, b) => {
    const wa = feld(a);
    const wb = feld(b);
    const aLeer = wa === null || wa === undefined || Number.isNaN(wa);
    const bLeer = wb === null || wb === undefined || Number.isNaN(wb);
    if (aLeer && bLeer) return 0;
    if (aLeer) return LEER_ZULETZT;
    if (bLeer) return -LEER_ZULETZT;
    return wa - wb;
  };
}

/**
 * Zeitpunkte — `Date` oder ISO-Zeichenkette.
 *
 * ⚠️ ISO-Zeichenketten werden als ZEICHENKETTEN verglichen, nicht über
 * `new Date()`. Das ist bei gleichem Format identisch geordnet, kostet aber
 * keine Datumsauswertung je Vergleich — und ein `Date` aus „2026-02-30"
 * wäre `Invalid Date` und sortierte still irgendwohin.
 */
export function nachDatum<T>(feld: Feld<T, string | Date>): (a: T, b: T) => number {
  return (a, b) => {
    const wa = feld(a);
    const wb = feld(b);
    if (!wa && !wb) return 0;
    if (!wa) return LEER_ZULETZT;
    if (!wb) return -LEER_ZULETZT;
    const za = wa instanceof Date ? wa.getTime() : wa;
    const zb = wb instanceof Date ? wb.getTime() : wb;
    if (typeof za === "number" && typeof zb === "number") return za - zb;
    return String(za) < String(zb) ? -1 : String(za) > String(zb) ? 1 : 0;
  };
}

/**
 * Wahrheitswerte — `true` zuerst, weil die Spalten, die das nutzen, „aktiv",
 * „offen" oder „kritisch" heißen: der Fall, der Aufmerksamkeit verlangt, gehört
 * nach oben.
 */
export function nachJaNein<T>(feld: Feld<T, boolean>): (a: T, b: T) => number {
  return (a, b) => Number(feld(b) ?? false) - Number(feld(a) ?? false);
}

/**
 * Eine feste Reihenfolge — für Spalten mit einer fachlichen Ordnung, die weder
 * alphabetisch noch numerisch ist (Ampeln: rot vor gelb vor grün). Ein Wert, der
 * nicht in der Liste steht, landet hinten.
 */
export function nachRang<T, W extends string>(
  feld: Feld<T, W>,
  reihenfolge: readonly W[],
): (a: T, b: T) => number {
  const rang = new Map(reihenfolge.map((wert, i) => [wert, i]));
  return (a, b) => {
    const wa = feld(a);
    const wb = feld(b);
    const ra = wa ? rang.get(wa) ?? reihenfolge.length : reihenfolge.length;
    const rb = wb ? rang.get(wb) ?? reihenfolge.length : reihenfolge.length;
    return ra - rb;
  };
}
