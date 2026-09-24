/**
 * Datenzugriff für die Stammdaten (Fahrzeuge, Personal, Stichworte). Deaktivieren statt
 * Löschen — es gibt keine Löschfunktion (Spec §5.1). Die Stammdatenversion (ETag für
 * Stufe 5) steigt ausschließlich über die Trigger `stand_*` der Migration 0001.
 */
import { asc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";
import * as schema from "../../_db/schema";
import { fahrzeug, person, stichwort } from "../../_db/schema";
import type { FahrzeugEingabe, PersonEingabe, StichwortEingabe } from "./schemas";
import type { FahrzeugDTO, PersonDTO, Stammdatenart, StichwortDTO } from "./typen";

export type Db = BetterSQLite3Database<typeof schema>;

export class NichtGefunden extends Error {
  constructor() {
    super("Eintrag nicht gefunden");
  }
}
export class SchonVergeben extends Error {
  constructor(readonly feld: "kennung" | "name") {
    super(feld === "kennung" ? "Diese Kennung gibt es schon." : "Dieses Stichwort gibt es schon.");
  }
}

/** Übersetzt den `UNIQUE constraint failed`-Fehler von better-sqlite3 in `SchonVergeben`. */
function eindeutig<T>(feld: "kennung" | "name", schreiben: () => T): T {
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
export function listePersonal(db: Db): PersonDTO[] {
  return db.select().from(person).all().sort((a, b) => a.name.localeCompare(b.name, "de"));
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
  if (id === null) return db.insert(person).values({ id: nanoid(), ...e }).returning().get();
  const z = db.update(person).set(e).where(eq(person.id, id)).returning().get();
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

/** Der ETag-Zähler (Spec §5.1). Erhöht nur durch die Trigger `stand_*` der Migration 0001. */
export function stammdatenVersion(db: Db): number {
  return (db.all(sql`SELECT version FROM stammdatenstand WHERE id = 1`) as { version: number }[])[0]?.version ?? 0;
}
