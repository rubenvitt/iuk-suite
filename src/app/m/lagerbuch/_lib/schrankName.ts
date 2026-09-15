/**
 * DRK-367 — die Eindeutigkeit eines Schranknamens innerhalb seines Elternorts.
 *
 * Kein "use client", kein Icon-Import (Fallen 6 und 7): die Actions lesen diese
 * Datei auf dem Server.
 *
 * ⚠️ ZWEI EBENEN, UND SIE SIND NICHT DIESELBE ZUSAGE. Hier steht die MELDUNG:
 * die verwaltende Person erfaehrt am Feld, dass der Name schon vergeben ist.
 * Die ZUSAGE steht als `idx_lagerorte_name_je_parent` in der Datenbank
 * (0009_lagerorte_name_eindeutig.sql) und faengt, was an den Actions vorbeikaeme
 * — ein Import, ein Seed, ein spaeteres zweites Formular. Dasselbe Paar tragen
 * `pruefeBarcodeFrei` und `geraete_barcode_unique` seit 0000.
 */
import { eq } from "drizzle-orm";
import { lagerorte } from "../_db/schema";
import type { Leser } from "./lesepfade/bestand";

/** Ein Satz fuer beide Stellen: `fehler` neben dem Formular und `feldFehler.name`
 *  am Eingabefeld. Zwei verschiedene Formulierungen fuer denselben Grund waeren
 *  zwei Meldungen uebereinander, die sich widersprechen koennen. */
export const NAME_VERGEBEN = "Dieser Name ist bereits vergeben.";

/**
 * Die Form, in der zwei Namen als „derselbe" gelten: Leerzeichen an den Raendern
 * fallen weg, ASCII-Grossbuchstaben werden klein.
 *
 * ⚠️ DAS IST DIE HANDGESCHRIEBENE FASSUNG VON `lower(trim(name))` IN SQLITE,
 * und sie muss ZEICHENGENAU dasselbe liefern: genau dieser Ausdruck traegt den
 * Eindeutigkeitsindex UND die Entdoppelung der Altdaten in
 * `0009_lagerorte_name_eindeutig.sql`. Beide naheliegenden JavaScript-Bausteine
 * waeren hier die falsche Wahl, und beide Male, weil sie MEHR koennen als ihr
 * SQL-Gegenstueck:
 *
 *   * `toLocaleLowerCase()` faltet „Ä" zu „ä", SQLites `lower()` ist ASCII-only.
 *   * `String.prototype.trim()` nimmt Tabulator, Zeilenumbruch, geschuetztes
 *     Leerzeichen und ein Dutzend weiterer Unicode-Zeichen, SQLites `trim(X)`
 *     nimmt ausschliesslich U+0020.
 *
 * Waere die Probe hier STRENGER als die Datenbank, blieben Altdaten stehen, die
 * sie danach fuer gleich haelt — „Schränkchen" neben „SCHRÄNKCHEN" —, und
 * niemand koennte die Mehrdeutigkeit mehr aufloesen: jeder Rettungsname in einer
 * der beiden Schreibweisen kaeme als „bereits vergeben" zurueck (zwei Befunde
 * von Codex zu PR #166). Waere sie LOCKERER, kaeme die Ablehnung als
 * SQLite-Ausnahme statt als Satz am Feld.
 *
 * Der Preis ist benannt und klein: zwei Namen, die sich allein in der
 * Gross-/Kleinschreibung eines Umlauts unterscheiden, gelten als verschieden.
 * Auf dem Bildschirm sind sie das auch — und der Auftrag lautet, zwei Eintraege
 * zu verhindern, die niemand auseinanderhalten kann.
 *
 * ⚠️ DER EXOTISCHE RANDLEERRAUM IST DAMIT NICHT ABGETAN, sondern anderswo
 * erledigt: er koennte auf dem Schirm sehr wohl unsichtbar sein (HTML faltet
 * fuehrenden Leerraum weg). Deshalb raeumt 0009 ihn in Schritt 0 einmalig aus
 * den Bestandsdaten, und `SchrankSchema` zieht jede Eingabe vorher durch
 * `.trim()` — nach beidem gibt es keinen gespeicherten Namen mehr, bei dem die
 * beiden `trim`-Bedeutungen auseinandergehen.
 *
 * `_lib/schrankName.test.ts` vergleicht beide Fassungen gegen echtes SQLite,
 * damit die Gleichheit nicht beim naechsten Umbau still auseinanderlaeuft.
 */
export function normalisiereSchrankName(name: string): string {
  return name
    .replace(/^ +| +$/g, "")
    .replace(/[A-Z]/g, (zeichen) => zeichen.toLowerCase());
}

/**
 * Traegt ein GESCHWISTER unter `parentId` diesen Namen schon?
 *
 * `ausnahmeId` ist der Schrank, der gerade umbenannt wird — ohne sie
 * kollidierte jede Bearbeitung, die den Namen gar nicht anfasst, mit sich
 * selbst.
 *
 * Liest alle Geschwister und vergleicht in JS, wie `_lib/lesepfade/orte.ts`:
 * `lagerorte` ist winzig.
 */
export function schrankNameVergeben(
  db: Leser,
  parentId: string,
  name: string,
  ausnahmeId: string | null = null,
): boolean {
  const gesucht = normalisiereSchrankName(name);
  return db.select({ id: lagerorte.id, name: lagerorte.name })
    .from(lagerorte)
    .where(eq(lagerorte.parentId, parentId))
    .all()
    .some((o) => o.id !== ausnahmeId && normalisiereSchrankName(o.name) === gesucht);
}

/**
 * Greift der Index statt der Probe darueber, kommt die Ablehnung als
 * SQLite-Ausnahme zurueck — beim Anlegen praktisch nur im Rennen zweier
 * gleichzeitiger Formulare. Ohne diese Uebersetzung stuende dort „Schrank
 * konnte nicht angelegt werden.", und die verwaltende Person suchte den Grund
 * an der falschen Stelle.
 */
export function istNamensKollision(e: unknown): boolean {
  return e instanceof Error
    && /idx_lagerorte_name_je_parent|lagerorte\.name/i.test(e.message);
}
