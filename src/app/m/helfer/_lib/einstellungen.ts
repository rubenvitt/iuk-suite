/**
 * Die Einstellungen des Moduls (Tabelle `einstellung`, Schlüssel/Wert als JSON). Ein unlesbarer
 * Wert fällt auf die Vorgabe zurück, statt die Seite zu sprengen.
 *
 * - `quelle`: `demo` (Vorgabe) oder `hiorg`. Ohne Verbindung zu HiOrg ist nur die Demo sinnvoll;
 *   der Wechsel löscht die Helfer der anderen Quelle (`daten.ts`, `wechsleQuelle`).
 * - `filter`: der Importfilter (`filter.ts`).
 * - `neueFreigeben`: ob neu übernommene Helfer gleich fürs Einsatzbuch freigegeben sind.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { HelferDb, HelferSchreiber } from "../_db/client";
import { einstellung } from "../_db/schema";
import { filterSchema, STANDARD_FILTER, type Importfilter } from "./filter";

export type Quelle = "demo" | "hiorg";

export interface Einstellungen {
  quelle: Quelle;
  filter: Importfilter;
  neueFreigeben: boolean;
}

export const STANDARD_EINSTELLUNGEN: Einstellungen = { quelle: "demo", filter: STANDARD_FILTER, neueFreigeben: true };

const SCHEMAS = {
  quelle: z.enum(["demo", "hiorg"]),
  filter: filterSchema,
  neueFreigeben: z.boolean(),
} as const;

export function leseEinstellungen(db: HelferDb): Einstellungen {
  const roh = new Map(db.select().from(einstellung).all().map((z) => [z.schluessel, z.wert]));
  const lies = <K extends keyof Einstellungen>(k: K): Einstellungen[K] => {
    const wert = roh.get(k);
    if (wert === undefined) return STANDARD_EINSTELLUNGEN[k];
    try {
      const p = SCHEMAS[k].safeParse(JSON.parse(wert));
      return p.success ? (p.data as Einstellungen[K]) : STANDARD_EINSTELLUNGEN[k];
    } catch {
      return STANDARD_EINSTELLUNGEN[k];
    }
  };
  return { quelle: lies("quelle"), filter: lies("filter"), neueFreigeben: lies("neueFreigeben") };
}

/** Schreibt nur, was sich ändert — ein unveränderter Wert erzeugt keine Audit-Zeile. */
export function schreibeEinstellung<K extends keyof Einstellungen>(db: HelferSchreiber, k: K, wert: Einstellungen[K]): void {
  const json = JSON.stringify(SCHEMAS[k].parse(wert));
  const alt = db.select().from(einstellung).where(eq(einstellung.schluessel, k)).get();
  if (alt?.wert === json) return;
  db.insert(einstellung).values({ schluessel: k, wert: json }).onConflictDoUpdate({ target: einstellung.schluessel, set: { wert: json } }).run();
}
