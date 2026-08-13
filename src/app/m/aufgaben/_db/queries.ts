import { asc, eq } from "drizzle-orm";
import { isoTag } from "../_lib/datum";
import { darfFreigeben, istAktiv } from "../_lib/zugang";
import type { DB } from "./client";
import {
  aufgaben,
  nachweise,
  personen,
  routinen,
  verlauf,
  type AufgabeRow,
  type NachweisRow,
  type PersonRow,
  type Rolle,
  type RoutineRow,
  type VerlaufRow,
} from "./schema";

/*
 * LESEPFADE — ALLE SYNCHRON. better-sqlite3 ist ein synchroner Treiber; `.all()`/`.get()`/`.run()`
 * liefern das Ergebnis direkt, kein Promise. Ein `async`-Wrapper hier waere eine Verzierung ohne
 * Gegenwert und zwaenge jeden Aufrufer zu einem `await`, das nichts abwartet — dieselbe Wahl wie
 * `feedback/_db/queries.ts`. EINZIGE AUSNAHME im Modul ist `personFuerSession` (`_lib/zugang.ts`):
 * die ist `async`, aber NUR wegen `auth()` — nicht wegen der Datenbank.
 *
 * Kein `"use client"` — Server Components lesen diese Funktionen direkt.
 *
 * DIE ZUGEHOERIGKEIT KOMMT AUS DER AUFGABE IN DER DATENBANK, NIE AUS EINEM URL-PARAMETER. Diese
 * Datei liest nur; das eigentliche IDOR-Risiko liegt bei den AUFRUFERN (Seiten, Actions), die eine
 * `id` aus der URL nehmen und sie ungeprueft an `aufgabe(db, id)` durchreichen wuerden. Vorbild
 * fuer die Gegenprobe: `assertGroupAccess` im Modul `feedback`.
 */

const ROLLEN_RANG: Record<Rolle, number> = { koordination: 0, auftrag: 1, bufdi: 2 };

/** Sortiert: Rolle in der fachlichen Rangfolge, dann Name alphabetisch. */
export function allePersonen(db: DB): PersonRow[] {
  return db
    .select()
    .from(personen)
    .all()
    .sort((a, b) => ROLLEN_RANG[a.rolle] - ROLLEN_RANG[b.rolle] || a.name.localeCompare(b.name));
}

/** Fuer Verteillisten und Plan-Navigation — eine ausgeschiedene Person verschwindet hier. */
export function aktivePersonen(db: DB, heute: string): PersonRow[] {
  return allePersonen(db).filter((p) => istAktiv(p, heute));
}

/** Aktive Personen mit `rolle === "bufdi"`, in der Sortierung von `allePersonen` (alphabetisch). */
export function bufdis(db: DB, heute: string): PersonRow[] {
  return aktivePersonen(db, heute).filter((p) => p.rolle === "bufdi");
}

export function personNachSub(db: DB, sub: string): PersonRow | null {
  return db.select().from(personen).where(eq(personen.sub, sub)).get() ?? null;
}

export function personNachId(db: DB, id: string): PersonRow | null {
  return db.select().from(personen).where(eq(personen.id, id)).get() ?? null;
}

export function aufgabe(db: DB, id: string): AufgabeRow | null {
  return db.select().from(aufgaben).where(eq(aufgaben.id, id)).get() ?? null;
}

/** `zugewiesenAn === personId` — der eigene Arbeitsvorrat eines BuFDi. */
export function aufgabenFuerPerson(db: DB, personId: string): AufgabeRow[] {
  return db.select().from(aufgaben).where(eq(aufgaben.zugewiesenAn, personId)).all();
}

/** `status === "eingegangen"` — noch niemandem zugewiesen. */
export function posteingang(db: DB): AufgabeRow[] {
  return db.select().from(aufgaben).where(eq(aufgaben.status, "eingegangen")).all();
}

/**
 * FILTERT SERVERSEITIG AUF DAS SICHTRECHT: das Ergebnis ist genau die Menge, fuer die
 * `darfFreigeben` wahr waere — Oberflaeche und Riegel sagen an dieser Stelle dasselbe, statt einer
 * Warteschlange, die mehr zeigt als der Knopf erlaubt.
 *
 * `heute` wird HIER ermittelt, nicht vom Aufrufer uebernommen — die Signatur (Brief, Aufgabe 4)
 * nimmt bewusst kein `heute`-Argument: „bin ich gerade zur Freigabe befugt" ist unmittelbar eine
 * Frage nach JETZT, nicht nach einem an anderer Stelle im Request schon berechneten Anzeigetag.
 * Der einzige Aufruf von `isoTag(new Date())` in diesem Modul steht bewusst NUR hier — die
 * Zeitzone bleibt trotzdem an der einen Stelle (`_lib/datum.ts`), diese Funktion fragt sie nur ab.
 */
export function freigabenFuer(db: DB, p: PersonRow): AufgabeRow[] {
  const heute = isoTag(new Date());
  return db
    .select()
    .from(aufgaben)
    .where(eq(aufgaben.status, "freigabe_offen"))
    .all()
    .filter((a) => darfFreigeben(p, a, heute));
}

export function aufgabenVonErsteller(db: DB, personId: string): AufgabeRow[] {
  return db.select().from(aufgaben).where(eq(aufgaben.erstellerId, personId)).all();
}

/** `status === "abgeschlossen"` — der Endzustand, das Archiv. */
export function archiv(db: DB): AufgabeRow[] {
  return db.select().from(aufgaben).where(eq(aufgaben.status, "abgeschlossen")).all();
}

export function routinenFuer(db: DB, personId: string): RoutineRow[] {
  return db.select().from(routinen).where(eq(routinen.personId, personId)).all();
}

/**
 * Aufsteigend nach `ts` — die Geschichte einer Aufgabe in der Reihenfolge, in der sie geschah.
 * `ORDER BY` in SQL statt eines JS-Sorts: das nutzt `verlauf_aufgabe_idx` auf
 * `(aufgabe_id, ts)` (Schema-Kommentar), fuer genau diese Abfrage angelegt.
 */
export function verlaufFuer(db: DB, aufgabeId: string): VerlaufRow[] {
  return db
    .select()
    .from(verlauf)
    .where(eq(verlauf.aufgabeId, aufgabeId))
    .orderBy(asc(verlauf.ts))
    .all();
}

export function nachweiseFuer(db: DB, aufgabeId: string): NachweisRow[] {
  return db.select().from(nachweise).where(eq(nachweise.aufgabeId, aufgabeId)).all();
}

/**
 * DAS EINE SCHREIBPRIMITIV DIESER AUFGABE. Jeder Uebergang der Uebergangstabelle (Spec §5.2)
 * schreibt eine Verlaufszeile — diese Funktion ist damit heute schon belegbar gebraucht (erster
 * Aufrufer: `_lib/seedLokal.ts`). Die UEBRIGEN Schreibprimitive (Aufgabe erstellen, verteilen,
 * Status wechseln, …) gehoeren NICHT in diese Aufgabe: welche Form sie brauchen, weiss man erst,
 * wenn die Server-Actions der Aufgaben 9/10 geschrieben sind. Sie jetzt zu erfinden hiesse, eine
 * Schnittstelle gegen einen unbekannten Aufrufer zu bauen.
 *
 * `ts` bekommt bewusst KEIN Argument: der Zeitpunkt eines Verlaufseintrags ist der Moment des
 * Schreibens, nicht ein von aussen mitgebrachter Wert — die Spalte traegt ohnehin einen
 * `$defaultFn(() => new Date())` (Schema).
 */
export function schreibeVerlauf(
  db: DB,
  eintrag: { aufgabeId: string; ereignis: string; akteurId: string; notiz?: string },
): VerlaufRow {
  return db
    .insert(verlauf)
    .values({
      aufgabeId: eintrag.aufgabeId,
      ereignis: eintrag.ereignis,
      akteurId: eintrag.akteurId,
      notiz: eintrag.notiz ?? null,
    })
    .returning()
    .get();
}

