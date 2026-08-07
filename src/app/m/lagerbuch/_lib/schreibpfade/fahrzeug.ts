/** Gemeinsamer Datenbank-Guard für schreibende Fahrzeugziele. */
import { and, eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { lagerorte } from "../../_db/schema";
import type { Tx } from "./abbuchung";

/**
 * Löst eine Kennung nur dann auf, wenn sie wirklich ein Fahrzeug bezeichnet.
 * Ein Fremdschlüssel auf `lagerorte.id` unterscheidet das feste Handlager nicht
 * von einem Fahrzeug und ist deshalb für Action-Nutzlasten kein ausreichender
 * Riegel.
 */
export function findeFahrzeug(db: DB | Tx, id: string) {
  return db.select().from(lagerorte).where(and(
    eq(lagerorte.id, id),
    eq(lagerorte.typ, "fahrzeug"),
  )).get();
}
