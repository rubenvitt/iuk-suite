/**
 * Lesen und Schreiben der Veranstaltungen. Kein Objekt hängt an einer anderen Kennung als seiner
 * eigenen; die Schichtplanung verweist nur darauf (`bereitstellung.ts`).
 */
import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { VeranstaltungenDb } from "../_db/client";
import { veranstaltung } from "../_db/schema";
import type { VeranstaltungEingabe } from "./eingabe";
import type { VeranstaltungDTO } from "./typen";

export class NichtGefunden extends Error {
  constructor(was = "Diese Veranstaltung gibt es nicht mehr.") {
    super(was);
  }
}

type Zeile = typeof veranstaltung.$inferSelect;

const alsDto = (z: Zeile): VeranstaltungDTO => ({
  id: z.id, name: z.name, art: z.art, status: z.status, ort: z.ort, veranstalter: z.veranstalter, von: z.von, bis: z.bis, bemerkung: z.bemerkung,
});

/** Alle Veranstaltungen, frühester Beginn zuerst. Eine Bereitschaft hat davon wenige Dutzend im Jahr. */
export function alleVeranstaltungen(db: VeranstaltungenDb): VeranstaltungDTO[] {
  return db.select().from(veranstaltung).orderBy(asc(veranstaltung.von), asc(veranstaltung.name)).all().map(alsDto);
}

export function ladeVeranstaltung(db: VeranstaltungenDb, id: string): VeranstaltungDTO | null {
  const z = db.select().from(veranstaltung).where(eq(veranstaltung.id, id)).get();
  return z ? alsDto(z) : null;
}

/** Anlegen (`id === null`) oder ändern; gibt die Kennung zurück. */
export function speichereVeranstaltung(db: VeranstaltungenDb, id: string | null, e: VeranstaltungEingabe, jetzt = Date.now()): string {
  if (id === null) {
    const neu = nanoid();
    db.insert(veranstaltung).values({ id: neu, ...e, angelegtAm: jetzt, aktualisiertAm: jetzt }).run();
    return neu;
  }
  if (db.update(veranstaltung).set({ ...e, aktualisiertAm: jetzt }).where(eq(veranstaltung.id, id)).run().changes === 0) throw new NichtGefunden();
  return id;
}

/**
 * Löscht die Veranstaltung. Eine Planung, die auf sie verweist, bleibt stehen: Name, Ort und
 * Zeitraum hat sie beim Anlegen übernommen, der Verweis zeigt dann ins Leere und die Planung sagt das.
 */
export function loescheVeranstaltung(db: VeranstaltungenDb, id: string): void {
  if (db.delete(veranstaltung).where(eq(veranstaltung.id, id)).run().changes === 0) throw new NichtGefunden();
}
