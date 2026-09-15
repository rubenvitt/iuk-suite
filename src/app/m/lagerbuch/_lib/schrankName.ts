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
 * Die Form, in der zwei Namen als „derselbe" gelten: Leerraum an den Raendern
 * faellt weg, ASCII-Grossbuchstaben werden klein.
 *
 * ⚠️ NUR ASCII, UND DAS IST DIE ABSICHT — `toLocaleLowerCase` waere hier die
 * naheliegende und die falsche Wahl. Diese Funktion muss ZEICHENGENAU dasselbe
 * liefern wie `lower(trim(name))` in SQLite, denn genau dieser Ausdruck traegt
 * den Eindeutigkeitsindex UND die Entdoppelung der Altdaten in
 * `0009_lagerorte_name_eindeutig.sql`. SQLites `lower()` laesst „Ä" stehen.
 *
 * Waere die Probe hier STRENGER, blieben Altdaten stehen, die sie danach fuer
 * gleich haelt — „Schränkchen" neben „SCHRÄNKCHEN" —, und niemand koennte die
 * Mehrdeutigkeit mehr aufloesen: jeder Rettungsname in einer der beiden
 * Schreibweisen kaeme als „bereits vergeben" zurueck (Befund von Codex zu
 * PR #166). Waere sie LOCKERER, kaeme die Ablehnung als SQLite-Ausnahme statt
 * als Satz am Feld.
 *
 * Der Preis ist benannt und klein: zwei Namen, die sich allein in der
 * Gross-/Kleinschreibung eines Umlauts unterscheiden, gelten als verschieden.
 * Auf dem Bildschirm sind sie das auch — und der Auftrag lautet, zwei Eintraege
 * zu verhindern, die niemand auseinanderhalten kann.
 *
 * `_lib/schrankName.test.ts` vergleicht beide Fassungen gegen echtes SQLite,
 * damit die Gleichheit nicht beim naechsten Umbau still auseinanderlaeuft.
 */
export function normalisiereSchrankName(name: string): string {
  return name.trim().replace(/[A-Z]/g, (zeichen) => zeichen.toLowerCase());
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
