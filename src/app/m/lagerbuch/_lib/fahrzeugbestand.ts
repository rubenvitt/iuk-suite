/**
 * DIE FAHRZEUGE DES LAGERBUCHS FÜR DEN ERSTIMPORT DER FAHRZEUGVERWALTUNG (IDA-256,
 * `fahrzeuge/_lib/erstimport/`). Das Modul fahrzeuge liest weder diese Datenbank noch ihr Schema,
 * sondern nur, was hier herausgegeben wird.
 *
 * Herausgegeben werden die Bestandsträger mit `typ = "fahrzeug"` OHNE die Taschen: eine Tasche fährt
 * mit, ist aber kein Fahrzeug der Bereitschaft. `einheitenart = null` („noch nicht zugeordnet“, Spalte in
 * `_db/schema.ts`) kommt mit — ob es ein Fahrzeug ist, entscheidet die Vorschau des Imports.
 */
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { getDb, type DB } from "../_db/client";
import { lagerorte } from "../_db/schema";

export interface LagerbuchFahrzeug {
  id: string;
  /** Der Anzeigename, z. B. „RTW 1“. */
  name: string;
  /** Im Lagerbuch das amtliche Kennzeichen, optional. */
  kennung: string | null;
  /** `null`: im Lagerbuch noch nicht als Fahrzeug oder Tasche zugeordnet. */
  einheitenart: "fahrzeug" | null;
  aktiv: boolean;
}

export function lagerbuchFahrzeuge(db: DB = getDb()): LagerbuchFahrzeug[] {
  return db.select({
    id: lagerorte.id, name: lagerorte.name, kennung: lagerorte.kennung, einheitenart: lagerorte.einheitenart, aktiv: lagerorte.aktiv,
  }).from(lagerorte)
    .where(and(eq(lagerorte.typ, "fahrzeug"), or(isNull(lagerorte.einheitenart), ne(lagerorte.einheitenart, "tasche"))))
    .all()
    .map((z) => ({ ...z, einheitenart: z.einheitenart === "fahrzeug" ? "fahrzeug" : null }));
}
