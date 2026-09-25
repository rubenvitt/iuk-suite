/**
 * Der Rechner hinter einem Geräte-Token (Spec §12). Das Token bekommt die App einmal bei der
 * Einrichtung; die Suite kennt nur seinen Hash. Ein widerrufener Rechner ist für jede
 * Geräte-Schnittstelle (Stammdaten, Anker, Sicherung) unbekannt.
 */
import { and, eq, isNull } from "drizzle-orm";
import { rechner } from "../../_db/schema";
import type { Db } from "../stammdaten/daten";
import { gleich, hashVon } from "./token";

export type RechnerZeile = typeof rechner.$inferSelect;

export function rechnerAusToken(db: Db, token: string | null): RechnerZeile | null {
  if (!token) return null;
  const hash = hashVon(token);
  const r = db.select().from(rechner).where(and(eq(rechner.tokenHash, hash), isNull(rechner.widerrufenAm))).get();
  return r && gleich(r.tokenHash, hash) ? r : null;
}

/** Vermerkt den letzten Kontakt. Unauditiert (`AUDIT_TABLES.einsatzbuch.rechner.unauditedColumns`). */
export function kontakt(db: Db, rechnerId: string, jetzt: Date): void {
  db.update(rechner).set({ letzterKontakt: jetzt }).where(eq(rechner.id, rechnerId)).run();
}
