/**
 * DIE FLAECHEN, DIE VERALTEN, WENN SICH DER HANDLAGER-BESTAND EINES ARTIKELS
 * AENDERT — EINMAL, FUER ALLE SCHREIBWEGE (DRK-381).
 *
 * ── WARUM DIESE DATEI UEBERHAUPT EXISTIERT ────────────────────────────────
 *
 * ⚠️ DREI REVIEW-RUNDEN, DREI FEHLENDE PFADE, EINE URSACHE: zwei Listen fuer
 * denselben Effekt. Die Liste stand bis DRK-381 als `revalidiereZugang` in
 * `_actions/buchung.ts` und trug dort den Befund aus drei Runden zu PR #174 —
 * nacheinander fehlten `verwaltung/bestellung`, `verwaltung/verfall` und
 * `auffuellen`. Der Kommentar dort schloss woertlich: „Die naechste Flaeche
 * fehlte wieder, solange die Listen getrennt sind."
 *
 * Mit DRK-381 kam ein VIERTER Schreibweg dazu (`raeumeAusEntnahmebox`), und er
 * aendert denselben Bestand. Ihn seine eigene Liste schreiben zu lassen waere
 * genau der Fehler, vor dem der Kommentar gewarnt hat — nur diesmal
 * angekuendigt.
 *
 * ⚠️ SIE LIEGT IN `_lib/` UND NICHT IN EINER ACTION-DATEI, und das ist keine
 * Geschmacksfrage: `_actions/*.ts` tragen `"use server"`, und dort ist JEDER
 * Export eine Server Action mit global aufrufbarer Id (`guards.test.ts`).
 * Eine geteilte Hilfsfunktion koennte dort also gar nicht exportiert werden.
 *
 * KEIN "use client": `revalidatePath` gibt es nur auf dem Server, und beide
 * Aufrufer sind Actions.
 *
 * ── WAS DIE LISTE NICHT IST ───────────────────────────────────────────────
 *
 * ⚠️ SIE IST NICHT „ALLES, WAS MIT DEM ARTIKEL ZU TUN HAT". Jeder Pfad steht
 * mit einem Grund unten; ein Pfad ohne Grund ist Arbeit bei jeder Buchung, die
 * niemand braucht. Und sie ist NICHT die Liste der BOX-Flaechen: die aendern
 * sich nur beim Ein- und Ausraeumen und stehen deshalb beim jeweiligen
 * Aufrufer.
 *
 * ⚠️ INNERE PFADE (§2.1 g, Falle 49): `revalidatePath` bekommt den Pfad, unter
 * dem die Route im DATEIBAUM liegt. Ein aeusserer Pfad trifft nichts — und
 * wirft dabei NICHT.
 */
import { revalidatePath } from "next/cache";

/**
 * Die Flaechen, die den Handlager-Bestand eines Artikels zeigen.
 *
 * Was sie nennt, und warum jeweils:
 *
 *  * `verwaltung/verfall` — `verfallListe` ueberspringt jede Charge mit
 *    `rest <= 0` und liest den Rest ueber den Handlager-Bereich
 *    (`_lib/lesepfade/verfall.ts`). Jede Bestandsaenderung aendert genau das:
 *    eine aufgebrauchte, ablaufende Charge taucht wieder auf, eine NEU
 *    angelegte mit nahem Verfall ist eine ganz neue Zeile.
 *  * `verwaltung/bestellung` — die Liste zeigt, was unter den Mindestbestand
 *    gefallen ist; steigt der Bestand, faellt der Artikel heraus. ⚠️ EIN
 *    ZUGANG nullt zusaetzlich `bestelltAt`, eine UMLAGERUNG ausdruecklich
 *    NICHT (§5.5, Punkt 2). Der Pfad gehoert trotzdem in BEIDE Wege — die
 *    Zahl aendert sich so oder so. `markiereBestellt` raeumt denselben Pfad
 *    aus demselben Grund; zwei Schreiber DERSELBEN Liste duerfen sich darin
 *    nicht unterscheiden.
 *  * `verwaltung/artikel` und `verwaltung` — Bestand und Kennzahlen.
 *  * `auffuellen` und `auffuellen/<id>` — Liste und Chargenwahl der GF-Flaeche.
 *  * `a/<id>` und `helfer` — Bestand und Chargenliste am Regal.
 */
export function revalidiereHandlagerBestand(artikelId: string): void {
  revalidatePath("/m/lagerbuch/verwaltung/verfall");
  revalidatePath("/m/lagerbuch/verwaltung/artikel");
  revalidatePath("/m/lagerbuch/verwaltung/bestellung");
  revalidatePath("/m/lagerbuch/verwaltung");
  revalidatePath(`/m/lagerbuch/auffuellen/${artikelId}`);
  revalidatePath("/m/lagerbuch/auffuellen");
  revalidatePath(`/m/lagerbuch/a/${artikelId}`);
  revalidatePath("/m/lagerbuch/helfer");
}
