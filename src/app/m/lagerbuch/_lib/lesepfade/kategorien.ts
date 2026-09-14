/**
 * DRK-294 — die ausgeblendeten Kategorien EINES Kontos, als gefaltete Schluessel.
 * Kein "use client", kein Icon-Import.
 *
 * `userId` ist immer `viewer.sub` aus der Sitzung, nie ein URL-Parameter.
 */
import { asc, eq } from "drizzle-orm";
import { ausgeblendeteKategorien } from "../../_db/schema";
import type { Leser } from "./bestand";

export function ausgeblendeteKategorienVon(db: Leser, userId: string): string[] {
  return db
    .select({ kategorie: ausgeblendeteKategorien.kategorie })
    .from(ausgeblendeteKategorien)
    .where(eq(ausgeblendeteKategorien.userId, userId))
    .orderBy(asc(ausgeblendeteKategorien.kategorie))
    .all()
    .map((zeile) => zeile.kategorie);
}
