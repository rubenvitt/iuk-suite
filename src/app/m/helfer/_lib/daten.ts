/**
 * Lesen und Pflegen des Bestands. Die Liste verlässt den Server nur an Personen mit Modulzugang
 * (Seiten hinter `requireHelferZugang`) und nur mit den Spalten von `HelferDTO`.
 */
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { HelferDb } from "../_db/client";
import { helfer, importlauf } from "../_db/schema";
import { schreibeEinstellung, type Quelle } from "./einstellungen";
import type { Ausschlussgrund } from "./filter";
import type { Qualifikation } from "./hiorg/person";

export interface HelferDTO {
  id: string;
  vorname: string;
  nachname: string;
  status: string;
  gruppen: string[];
  qualifikationen: Qualifikation[];
  fuerEinsatzbuch: boolean;
  demo: boolean;
  aktualisiertAm: string;
}

export interface LaufDTO {
  id: string;
  zeitpunkt: string;
  quelle: Quelle;
  vonName: string;
  gelesen: number;
  neu: number;
  geaendert: number;
  entfernt: number;
  ausgefiltert: Partial<Record<Ausschlussgrund, number>>;
}

function json<T>(roh: string, ersatz: T): T {
  try {
    return JSON.parse(roh) as T;
  } catch {
    return ersatz;
  }
}

export function listeHelfer(db: HelferDb): HelferDTO[] {
  return db.select().from(helfer).all()
    .map((h) => ({
      id: h.id, vorname: h.vorname, nachname: h.nachname, status: h.status,
      gruppen: json<string[]>(h.gruppen, []), qualifikationen: json<Qualifikation[]>(h.qualifikationen, []),
      fuerEinsatzbuch: h.fuerEinsatzbuch, demo: h.herkunft === "demo", aktualisiertAm: h.aktualisiertAm.toISOString(),
    }))
    .sort((a, b) => a.nachname.localeCompare(b.nachname, "de") || a.vorname.localeCompare(b.vorname, "de"));
}

export function listeLaeufe(db: HelferDb, anzahl = 10): LaufDTO[] {
  return db.select().from(importlauf).orderBy(desc(importlauf.zeitpunkt)).limit(anzahl).all().map((l) => ({
    id: l.id, zeitpunkt: l.zeitpunkt.toISOString(), quelle: l.quelle, vonName: l.vonName,
    gelesen: l.gelesen, neu: l.neu, geaendert: l.geaendert, entfernt: l.entfernt,
    ausgefiltert: json<Partial<Record<Ausschlussgrund, number>>>(l.ausgefiltert, {}),
  }));
}

/** Setzt die Freigabe fürs Einsatzbuch; nur tatsächlich geänderte Zeilen werden geschrieben (eine Audit-Zeile je Person). */
export function setzeFreigabe(db: HelferDb, ids: string[], wert: boolean): number {
  if (ids.length === 0) return 0;
  return db.update(helfer).set({ fuerEinsatzbuch: wert })
    .where(and(inArray(helfer.id, ids), ne(helfer.fuerEinsatzbuch, wert))).run().changes;
}

/**
 * Wechselt die Quelle und löscht dabei ALLE Helfer der bisherigen — eine Liste aus Demo- und echten
 * Personen wäre im Einsatzbuch nicht mehr auseinanderzuhalten. Gibt die Zahl der gelöschten zurück.
 */
export function wechsleQuelle(db: HelferDb, quelle: Quelle): number {
  return db.transaction((tx) => {
    const geloescht = tx.delete(helfer).where(ne(helfer.herkunft, quelle)).run().changes;
    schreibeEinstellung(tx, "quelle", quelle);
    return geloescht;
  });
}

/** Löscht alle Helfer und das Abgleichprotokoll. Die Verbindung zu HiOrg trennt `trenneVerbindung`. */
export function loescheAlles(db: HelferDb): number {
  return db.transaction((tx) => {
    const n = tx.delete(helfer).run().changes;
    tx.delete(importlauf).run();
    return n;
  });
}

export function anzahlHelfer(db: HelferDb, nur?: { fuerEinsatzbuch: boolean }): number {
  const q = db.select({ id: helfer.id }).from(helfer);
  return (nur ? q.where(eq(helfer.fuerEinsatzbuch, nur.fuerEinsatzbuch)) : q).all().length;
}
