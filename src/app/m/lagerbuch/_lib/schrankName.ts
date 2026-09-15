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
 * Die Form, in der zwei Namen als „derselbe" gelten.
 *
 * ⚠️ STRENGER ALS DER INDEX, und das ist Absicht. SQLites `lower()` ist
 * ASCII-only — „Ä" bleibt dort „Ä" —, `toLocaleLowerCase("de")` nicht. Die
 * Richtung stimmt: was diese Probe ablehnt, erreicht den Index nie; der Index
 * faengt nur den Rest. Andersherum waere der Index die strengere Regel, und die
 * Ablehnung kaeme als SQLite-Ausnahme statt als Satz am Feld.
 */
export function normalisiereSchrankName(name: string): string {
  return name.trim().toLocaleLowerCase("de");
}

/**
 * Traegt ein GESCHWISTER unter `parentId` diesen Namen schon?
 *
 * `ausnahmeId` ist der Schrank, der gerade umbenannt wird — ohne sie
 * kollidierte jede Bearbeitung, die den Namen gar nicht anfasst, mit sich
 * selbst.
 *
 * Liest alle Geschwister und vergleicht in JS, wie `_lib/lesepfade/orte.ts`:
 * `lagerorte` ist winzig, und die Faltung oben gibt es in SQLite nicht.
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
