import { revalidatePath } from "next/cache";

/**
 * DIE FLAECHEN, DIE ARTIKELBESTAND ODER BUCHUNGEN ZEIGEN — EINE LISTE FUER DAS
 * GANZE MODUL (DRK-374).
 *
 * ⚠️ WARUM EINE LISTE UND NICHT SECHS. Die Review zu DRK-313 (PR #174) meldete
 * VIERMAL IN FOLGE dieselbe Sache in anderer Gestalt: eine Flaeche, die nach
 * einer Buchung veraltet stehen bleibt — `verwaltung/bestellung`,
 * `verwaltung/verfall`, die Auffuellrouten, `verwaltung/journal`,
 * `verwaltung/lagerorte`. Jeder Fund wurde einzeln nachgetragen, und der
 * naechste kam trotzdem. Die Ursache ist nicht Unachtsamkeit, sondern die
 * BAUFORM: solange jeder Schreiber seine eigene Liste fuehrt, ist „eine neue
 * Flaeche" eine Aenderung an acht Stellen, und acht Stellen driften.
 *
 * Gemessen war der Stand vor diesem Ticket: `aussondern` nannte drei Pfade,
 * `revalidiereZugang` acht, `csv` einen — und `verwaltung/journal` sowie
 * `verwaltung/lagerorte` nannte KEINE EINZIGE Action, obwohl beide
 * Buchungszeilen lesen.
 *
 * ⚠️ DIE WIRKUNG IST HEUTE LATENT, NICHT AKUT — und das ist kein Grund, sie
 * stehen zu lassen. `experimental.staleTimes.dynamic` steht auf dem Vorgabewert
 * `0` (`next.config.ts` ueberschreibt ihn nicht), und diese Seiten sind
 * dynamisch; eine dynamische Route wird bei Client-Navigation ohnehin neu
 * geholt. Wer den Wert spaeter hochsetzt oder eine dieser Seiten statisch
 * macht, schaltet die GANZE Klasse auf einmal scharf — nicht eine Flaeche.
 *
 * ⚠️ INNERE PFADE (Falle 49): `revalidatePath` bekommt den Pfad, unter dem die
 * Route im DATEIBAUM liegt, nicht den, den der Browser auf dem Lagerbuch-Host
 * sieht. Ein aeusserer Pfad trifft nichts — und wirft dabei NICHT. Deshalb
 * beginnt hier jeder Eintrag mit `/m/lagerbuch`.
 *
 * ⚠️ ROUTENGRUPPEN ZAEHLEN NICHT MIT: die Verwaltungsseiten liegen unter
 * `verwaltung/(arbeit)/…`, der Pfad lautet trotzdem `/m/lagerbuch/verwaltung/…`.
 * `revalidierung.test.ts` loest das beim Abgleich mit dem Dateibaum auf.
 *
 * ⚠️ DIESE DATEI TRAEGT KEIN `"use server"`, und das ist die Bedingung dafuer,
 * dass es sie gibt: in `_actions/buchung.ts` waere jeder Export eine Action
 * (`_actions/guards.test.ts`) — der Vorlaeufer `revalidiereZugang` musste
 * deshalb dateilokal bleiben und war genau darum nicht teilbar.
 */
export const BESTANDSFLAECHEN: readonly string[] = [
  /* Kennzahlen, Bestandstabelle und Journal-Auszug der Verwaltungsuebersicht. */
  "/m/lagerbuch/verwaltung",
  /* `artikelListe` — Bestand je Artikel, die Hauptflaeche. */
  "/m/lagerbuch/verwaltung/artikel",
  /*
   * `bestellvorschlag` liest den Handlager-Bestand (`bestandJeArtikelImBereich`)
   * und filtert die Zeilen danach. Ein Zugang nullt zusaetzlich `bestelltAt`:
   * eine zwischengespeicherte Liste fuehrte den gelieferten Artikel sonst weiter
   * als „bestellt" und schluege ihn nie wieder vor.
   */
  "/m/lagerbuch/verwaltung/bestellung",
  /*
   * `verfallListe` ueberspringt jede Charge mit `rest <= 0`. Jede Buchung
   * aendert genau das — eine aufgebrauchte, ablaufende Charge taucht nach einem
   * Zugang wieder auf, eine neu angelegte ist eine ganz neue Zeile.
   */
  "/m/lagerbuch/verwaltung/verfall",
  /* `journalEintraege` — die Buchungszeilen selbst. */
  "/m/lagerbuch/verwaltung/journal",
  /* Zaehlt „Bestandsposten je Schrank" direkt aus `buchungen`. */
  "/m/lagerbuch/verwaltung/lagerorte",
  /* `inventurZeilen` — Soll gegen Ist, also Bestand. */
  "/m/lagerbuch/verwaltung/inventur",
  /* `fahrzeugUebersicht` liest `bestandJeArtikelUndLagerort`. */
  "/m/lagerbuch/verwaltung/fahrzeuge",
  /* `boxInhalt`, `postenAmOrt`, `letzteBoxZugaenge` — Bestand am Box-Ort. */
  "/m/lagerbuch/verwaltung/entnahmebox",
  /* `artikelListe` — die Auffuellansicht der GF. */
  "/m/lagerbuch/auffuellen",
  /* `artikelListe` — das Regalblatt der Helferinnen. */
  "/m/lagerbuch/helfer",
  /* `postenAmOrt` — die Entnahmebox am Regal. */
  "/m/lagerbuch/helfer/box",
];

/**
 * DIE FLAECHEN MIT EINEM WERT IN DER URL.
 *
 * Sie stehen NICHT in `BESTANDSFLAECHEN`, weil ein Pfad mit Platzhalter nichts
 * traefe und ein Pfad ohne Wert die falsche Seite meinte. Wer die ID hat, gibt
 * sie mit; wer sie nicht hat, laesst sie weg — ein fehlender Eintrag kostet
 * hier einen veralteten Detailschirm, kein falsches Ergebnis.
 */
function flaechenMitId(
  artikelId?: string | null,
  lagerortId?: string | null,
): string[] {
  const pfade: string[] = [];
  if (artikelId) {
    /* `artikelDetailHelfer` — Bestand und Chargenliste am Regal. */
    pfade.push(`/m/lagerbuch/a/${artikelId}`);
    /* `artikelDetailAuffuellen` — die Chargenwahl der GF. */
    pfade.push(`/m/lagerbuch/auffuellen/${artikelId}`);
  }
  /* `chargenJeArtikelAmLagerort` — der Ortsbestand eines Fahrzeugs. */
  if (lagerortId) pfade.push(`/m/lagerbuch/verwaltung/fahrzeuge/${lagerortId}`);
  return pfade;
}

/**
 * DIE LISTE WIRD PAUSCHAL GENOMMEN, NICHT JE SCHREIBER GEFILTERT — und das ist
 * die Entscheidung dieses Tickets, nicht eine Bequemlichkeit.
 *
 * Drei Gruende, der dritte ist der gemessene:
 *
 *  1. DIE KOSTEN SIND UNSYMMETRISCH. Ein Pfad zu viel kostet einen Rerender
 *     einer ohnehin dynamischen Seite. Ein Pfad zu wenig zeigt eine falsche
 *     Zahl auf einer Arbeitsflaeche — und niemand meldet ihn, weil nichts
 *     bricht.
 *  2. EIN FILTER IST WIEDER EINE LISTE. Sechs Filter sind sechs Listen mit
 *     einem anderen Namen; die Drift, gegen die dieses Ticket gebaut ist, waere
 *     unveraendert da.
 *  3. DAS NAHELIEGENDSTE GEGENBEISPIEL HAELT NICHT. „Eine Umlagerung aendert die
 *     Bestellt-Markierung nicht" stimmt fuer `artikel.bestelltAt` — und trotzdem
 *     aendert sie die Bestellliste: `bestellvorschlag` filtert ueber
 *     `bestandJeArtikelImBereich(db, handlagerOrte(db))`, und eine Umlagerung
 *     AUS dem Handlager auf ein Fahrzeug senkt genau diesen Bestand unter den
 *     Mindestbestand. Wer nach der Markierung filtert, streicht die Flaeche, die
 *     sich gerade geaendert hat.
 *
 * Was ein Schreiber ZUSAETZLICH beruehrt — Checks, Sauerstoff, Inventurlaeufe —,
 * revalidiert er weiterhin selbst daneben. Diese Liste beantwortet genau eine
 * Frage: „wo steht Artikelbestand oder eine Buchungszeile?"
 */
export function revalidiereBestand(opts: {
  artikelId?: string | null;
  lagerortId?: string | null;
} = {}): void {
  for (const pfad of BESTANDSFLAECHEN) revalidatePath(pfad);
  for (const pfad of flaechenMitId(opts.artikelId, opts.lagerortId)) {
    revalidatePath(pfad);
  }
}
