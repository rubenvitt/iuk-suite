/**
 * DIE DETAILADRESSEN DER VERWALTUNG — EIN PFADBAUER STATT VIELER TEMPLATE-STRINGS
 * (DRK-477).
 *
 * Bis hierher setzten rund 15 Links, Weiterleitungen und `revalidatePath`-Aufrufe
 * die Id roh in den Pfad (`/verwaltung/fahrzeuge/${id}`). Eine Id mit `#`, `?`
 * oder `/` fuehrte dort still auf eine falsche oder leere Detailseite: der
 * Browser liest den Rest als Fragment, als Abfrage oder als weiteres Segment.
 * Dasselbe Muster hatte die Helfer-Seite an ihren Landepfaden (DRK-394,
 * `tokenZielPfad`); die Verwaltung zieht hier nach.
 *
 * ⚠️ EINE VORSICHTSMASSNAHME, KEIN FEHLER IM BESTAND. Alt-Anwendung und Suite
 * vergeben diese Ids ueber `nanoid()` (URL-sicheres Alphabet) oder als feste
 * Konstanten; fuer all diese Ids ist die Ausgabe ZEICHENGLEICH mit dem rohen
 * Pfad (`verwaltungPfad.test.ts` haelt das ueber das ganze Alphabet fest).
 * Treffen kann es erst eine von Hand bearbeitete oder importierte Id — die
 * Cutover-Stichprobe (Runbook §17.4) sagt, ob es die gibt.
 *
 * ⚠️ KODIERT WIRD HIER, NICHT BEIM LESEN: Next dekodiert den Routenparameter
 * selbst (`params.id` kommt als `rtw#1` an, nicht als `rtw%231`). Die
 * Detailseiten bleiben deshalb unberuehrt.
 *
 * ⚠️ ZWEI FORMEN, EINE ENTSCHEIDUNG. Links und `redirect()` landen beim Browser
 * und tragen die AEUSSERE Form (`/verwaltung/…`); `revalidatePath` braucht die
 * INNERE (`/m/lagerbuch/verwaltung/…`, Falle 49 in `revalidierung.ts`). Beide
 * entstehen aus derselben Funktion, damit die Kodierung nicht an einer der
 * beiden fehlt. Auch der innere Pfad ist kodiert: Next vergleicht ihn mit dem
 * Anfragepfad, und den schickt der Browser kodiert.
 *
 * ⚠️ DIESE DATEI TRAEGT KEIN `"use client"` und importiert nichts Serverseitiges:
 * Server Components, Client-Inseln und Actions nehmen sie gleichermassen
 * (Falle 6).
 */

/** Die Verwaltungsflaechen, die eine Detailseite `…/[id]` haben. */
export type Detailflaeche =
  | "fahrzeuge"
  | "geraete"
  | "bz"
  | "checks"
  | "vorlagen"
  | "sauerstoff"
  | "inventur/verlauf";

/** Unterseiten einer Detailseite — heute nur die BZ-Kontrolle. */
export type Unterseite = "kontrolle";

/** Aeusserer Pfad einer Detailseite, fuer `Link`, `href` und `redirect()`. */
export function verwaltungDetailPfad(
  flaeche: Detailflaeche,
  id: string,
  unterseite?: Unterseite,
): string {
  const pfad = `/verwaltung/${flaeche}/${encodeURIComponent(id)}`;
  return unterseite ? `${pfad}/${unterseite}` : pfad;
}

/** Innerer Pfad derselben Detailseite, fuer `revalidatePath` (Falle 49). */
export function verwaltungDetailPfadIntern(
  flaeche: Detailflaeche,
  id: string,
  unterseite?: Unterseite,
): string {
  return `/m/lagerbuch${verwaltungDetailPfad(flaeche, id, unterseite)}`;
}
