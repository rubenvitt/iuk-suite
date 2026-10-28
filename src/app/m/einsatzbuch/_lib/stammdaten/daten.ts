/**
 * Datenzugriff für die Stammdaten (Fahrzeuge, Personal, Stichworte). Deaktivieren statt
 * Löschen — es gibt keine Löschfunktion (Spec §5.1). Die Stammdatenversion (ETag für
 * Stufe 5) steigt ausschließlich über die Trigger `stand_*` der Migration 0001.
 */
import { asc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";
import * as schema from "../../_db/schema";
import { fahrzeug, person, qualifikation, stichwort } from "../../_db/schema";
import type { FahrzeugEingabe, PersonEingabe, StichwortEingabe } from "./schemas";
import type { FahrzeugDTO, PersonDTO, QualifikationDTO, Stammdatenart, StichwortDTO } from "./typen";

export type Db = BetterSQLite3Database<typeof schema>;

export class NichtGefunden extends Error {
  constructor() {
    super("Eintrag nicht gefunden");
  }
}
const SCHON_VERGEBEN = { kennung: "Diese Kennung gibt es schon.", name: "Dieses Stichwort gibt es schon.", kurz: "Diese Kurzform gibt es schon." } as const;
export class SchonVergeben extends Error {
  constructor(readonly feld: keyof typeof SCHON_VERGEBEN) {
    super(SCHON_VERGEBEN[feld]);
  }
}
/** Ein fachlicher Einwand gegen eine Änderung an den Qualifikationen; die Meldung geht so an die Oberfläche. */
export class QualiFehler extends Error {}

/** Übersetzt den `UNIQUE constraint failed`-Fehler von better-sqlite3 in `SchonVergeben`. */
export function eindeutig<T>(feld: keyof typeof SCHON_VERGEBEN, schreiben: () => T): T {
  try {
    return schreiben();
  } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed/.test(e.message)) throw new SchonVergeben(feld);
    throw e;
  }
}

export function listeFahrzeuge(db: Db): FahrzeugDTO[] {
  return db.select().from(fahrzeug).orderBy(asc(fahrzeug.standort), asc(fahrzeug.kennung)).all();
}
/** Die Spalten von `PersonDTO`: `ov` bleibt in der Tabelle, verlässt die Datenschicht aber nicht mehr (DRK-488). */
const PERSON_SPALTEN = { id: person.id, name: person.name, quali: person.quali, aktiv: person.aktiv };
export function listePersonal(db: Db): PersonDTO[] {
  return db.select(PERSON_SPALTEN).from(person).all().sort((a, b) => a.name.localeCompare(b.name, "de"));
}
/** Höchste zuerst; bei gleichem Rang nach Kurzform. */
export function listeQualifikationen(db: Db): QualifikationDTO[] {
  return db.select().from(qualifikation).orderBy(asc(qualifikation.rang), asc(qualifikation.kurz)).all();
}
export function listeStichworte(db: Db): StichwortDTO[] {
  return db.select().from(stichwort).orderBy(asc(stichwort.gruppe), asc(stichwort.reihenfolge), asc(stichwort.name)).all();
}

export function speichereFahrzeug(db: Db, id: string | null, e: FahrzeugEingabe): FahrzeugDTO {
  return eindeutig("kennung", () => {
    if (id === null) return db.insert(fahrzeug).values({ id: nanoid(), ...e }).returning().get();
    const z = db.update(fahrzeug).set(e).where(eq(fahrzeug.id, id)).returning().get();
    if (!z) throw new NichtGefunden();
    return z;
  });
}
export function speicherePerson(db: Db, id: string | null, e: PersonEingabe): PersonDTO {
  if (id === null) return db.insert(person).values({ id: nanoid(), ...e }).returning(PERSON_SPALTEN).get();
  const z = db.update(person).set(e).where(eq(person.id, id)).returning(PERSON_SPALTEN).get();
  if (!z) throw new NichtGefunden();
  return z;
}
export function speichereStichwort(db: Db, id: string | null, e: StichwortEingabe): StichwortDTO {
  return eindeutig("name", () => {
    if (id === null) return db.insert(stichwort).values({ id: nanoid(), ...e }).returning().get();
    const z = db.update(stichwort).set(e).where(eq(stichwort.id, id)).returning().get();
    if (!z) throw new NichtGefunden();
    return z;
  });
}

const TABELLE = { fahrzeuge: fahrzeug, personal: person, stichworte: stichwort } as const;

export function setzeAktiv(db: Db, art: Stammdatenart, id: string, aktiv: boolean): void {
  const t = TABELLE[art];
  const z = db.update(t).set({ aktiv }).where(eq(t.id, id)).run();
  // better-sqlite3 meldet bei einem Update mit gleichen Werten `changes = 1`; die Existenz
  // wird deshalb nur geprüft, wenn `changes === 0` war.
  if (z.changes === 0 && !db.select({ id: t.id }).from(t).where(eq(t.id, id)).get()) throw new NichtGefunden();
}

/** Der ETag-Zähler (Spec §5.1). Erhöht nur durch die Trigger `stand_*` der Migration 0001; `schreibeEinstellungen` fasst ihre Schritte zu einem zusammen. */
export function stammdatenVersion(db: Db): number {
  return (db.all(sql`SELECT version FROM stammdatenstand WHERE id = 1`) as { version: number }[])[0]?.version ?? 0;
}
