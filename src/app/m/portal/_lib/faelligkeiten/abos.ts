/**
 * DIE ABOS VON „WAS STEHT AN" — eine Zeile je Person (`faelligkeiten_abos`, IDA-297).
 *
 * ⚠️ `personId` KOMMT IMMER AUS DER SITZUNG (`session.user.id`, der `sub` von Pocket ID), nie aus einem
 * Formular: wer eine fremde ID schicken könnte, läse deren Thema mit (IDOR, `CLAUDE.md`, „Zugriffsschutz").
 *
 * Kein `"use client"` (Falle 6).
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/app/m/portal/_db/client";
import { faelligkeitenAbos, type FaelligkeitenAbo } from "@/app/m/portal/_db/schema";
import { neuesThema } from "./konfiguration";

export type PortalDb = ReturnType<typeof getDb>;

export function aboVon(personId: string, db: PortalDb = getDb()): FaelligkeitenAbo | null {
  return db.select().from(faelligkeitenAbos).where(eq(faelligkeitenAbos.personId, personId)).get() ?? null;
}

/** Legt das Abo an oder gibt das bestehende zurück — ein doppelter Klick erzeugt kein zweites Thema. */
export function richteAboEin(personId: string, praefix: string, gruppen: readonly string[], db: PortalDb = getDb()): FaelligkeitenAbo {
  const da = aboVon(personId, db);
  if (da) return da;
  db.insert(faelligkeitenAbos)
    .values({ personId, thema: neuesThema(praefix), gruppen: [...gruppen] })
    .onConflictDoNothing({ target: faelligkeitenAbos.personId })
    .run();
  return aboVon(personId, db)!;
}

export function setzeAuswahl(personId: string, auswahl: { push: boolean; abgewaehlt: string[] }, db: PortalDb = getDb()): void {
  db.update(faelligkeitenAbos).set(auswahl).where(eq(faelligkeitenAbos.personId, personId)).run();
}

/**
 * Ein neues Thema: das alte Abo auf den Telefonen bekommt danach nichts mehr. Für „ich habe den Link
 * weitergegeben" oder „das alte Telefon ist weg".
 */
export function wechsleThema(personId: string, praefix: string, db: PortalDb = getDb()): void {
  db.update(faelligkeitenAbos).set({ thema: neuesThema(praefix), gesendeteWoche: null })
    .where(eq(faelligkeitenAbos.personId, personId)).run();
}

export function beendeAbo(personId: string, db: PortalDb = getDb()): void {
  db.delete(faelligkeitenAbos).where(eq(faelligkeitenAbos.personId, personId)).run();
}

/** Der Stand der Gruppen beim Besuch der Seite — nur schreiben, wenn er sich geändert hat. */
export function vermerkeGruppen(abo: FaelligkeitenAbo, gruppen: readonly string[], db: PortalDb = getDb()): void {
  const neu = [...gruppen].sort();
  if (JSON.stringify(neu) === JSON.stringify([...abo.gruppen].sort())) return;
  db.update(faelligkeitenAbos).set({ gruppen: neu }).where(eq(faelligkeitenAbos.personId, abo.personId)).run();
}

/** Alle Abos mit eingeschaltetem Push. */
export function abosMitPush(db: PortalDb = getDb()): FaelligkeitenAbo[] {
  return db.select().from(faelligkeitenAbos).where(eq(faelligkeitenAbos.push, true)).all();
}

export function vermerkeWoche(personId: string, woche: string, db: PortalDb = getDb()): void {
  db.update(faelligkeitenAbos).set({ gesendeteWoche: woche }).where(eq(faelligkeitenAbos.personId, personId)).run();
}
