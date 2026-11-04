import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { KommplanDb } from "../_db/client";
import { plan } from "../_db/schema";
import type { PlanInhalt } from "./plan/schema";
import { verweisIds, type PlanZiel } from "./plan/verweis";
import { sichtbarFuer, type Person } from "./rechte";

/**
 * VERWEISE AUF ANDERE PLÄNE (IDA-355). Der Titel steht im Dokument; ob ein Verweis klickbar ist, löst der Server je
 * Betrachter aus der Datenbank auf (IDOR: nie aus dem Dokument oder der Anfrage) — dieselbe Sichtbarkeit wie in der Liste.
 */
export function erreichbareVerweise(db: KommplanDb, inhalt: PlanInhalt, wer: Person): string[] {
  const ids = verweisIds(inhalt);
  if (ids.length === 0) return [];
  return db.select({ id: plan.id }).from(plan).where(and(sichtbarFuer(wer), inArray(plan.id, ids))).all().map((z) => z.id);
}

/** Die Ziele für die Auswahl im Flyin: nicht archivierte Pläne (keine Vorlagen), die `wer` sieht, ohne den Plan selbst. */
export function verweisZiele(db: KommplanDb, wer: Person, ohne: string): PlanZiel[] {
  return db.select({ id: plan.id, titel: plan.titel }).from(plan)
    .where(and(sichtbarFuer(wer), isNull(plan.archiviertAm), eq(plan.istVorlage, false), ne(plan.id, ohne)))
    .orderBy(plan.titel, plan.id).all();
}
