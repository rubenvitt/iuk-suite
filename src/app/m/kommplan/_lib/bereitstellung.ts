/**
 * DIE TAKTISCHEN ZEICHEN, DIE DAS MODUL KOMMPLAN FÜR ANDERE MODULE VERÖFFENTLICHT (LGM-10: der Lagemonitor zeigt
 * Fahrzeuge mit ihrem Zeichen). Bauform wie `fahrzeuge/_lib/bereitstellung.ts`: ein anderes Modul liest weder die
 * Datenbank noch das Generat, sondern nur, was hier herausgeht — Katalog UND eigene Zeichen (`zeichen/symbole.ts`).
 *
 * NUR SERVER. Das Generat ist groß; ein Client bekommt die Auswahl und fertige Bilder als Prop.
 */
import { getDb, type KommplanDb } from "../_db/client";
import { symboleMitEigenen, zeichenIndexMitEigenen } from "./zeichen/symbole";

export interface ZeichenWahl {
  schluessel: string;
  titel: string;
}

/** Alle wählbaren Zeichen, eigene zuerst. */
export function zeichenAuswahl(db: Pick<KommplanDb, "select"> = getDb()): ZeichenWahl[] {
  return zeichenIndexMitEigenen(db).map(({ schluessel, titel }) => ({ schluessel, titel }));
}

/**
 * Die Zeichen als eigenständige SVG-Dokumente, je Schlüssel; unbekannte fehlen. `xmlns` und die Schrift stehen an der
 * Wurzel, weil ein `<img>` (Data-URI) weder Namensraum noch Seitenschrift erbt.
 */
export function zeichenAlsSvg(schluessel: readonly string[], db: Pick<KommplanDb, "select"> = getDb()): Record<string, string> {
  return Object.fromEntries(
    Object.entries(symboleMitEigenen(db, schluessel)).map(([k, q]) => [
      k,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${q.viewBox}" font-family="Arial, Helvetica, sans-serif">${q.inhalt}</svg>`,
    ]),
  );
}
