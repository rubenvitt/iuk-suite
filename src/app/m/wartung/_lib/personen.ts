/**
 * VERWALTER EINER GRUPPE (IDA-337). Pocket ID kennt nur `wartung-nutzer` und `wartung-admin`; wer Technik oder
 * I&K verwaltet, ordnet der Admin hier im Modul zu. Gespeichert wird die Kennung (`sub`), der Name nur zum
 * Anzeigen (Vorbild `kommplan/_lib/mitglieder.ts`).
 *
 * Zuordnen lässt sich nur, wen das Modul (`person`) oder das Personenverzeichnis kennt — eine frei getippte
 * Kennung würde nie greifen. Rechte prüfen die Actions davor (`requireAktion("admin")`).
 */
import { and, asc, eq } from "drizzle-orm";
import type { DirectoryResult } from "@/core/directory";
import type { WartungDb } from "../_db/client";
import { gruppe, person, verwalter } from "../_db/schema";
import { Abgelehnt } from "./schreiben";
import type { PersonVorschlag, VerwalterDTO } from "./typen";

type Leser = Pick<WartungDb, "select">;

/** Wie `kommplan`: ab zwei Zeichen, höchstens zwanzig Treffer. */
export const SUCHE_MIN_ZEICHEN = 2;
export const SUCHE_MAX_TREFFER = 20;

/** Wer das Modul öffnet, steht danach in `person`. Geschrieben wird nur bei neuem oder geändertem Namen. */
export function merkePerson(db: WartungDb, nutzer: string | null, name: string | null | undefined): void {
  const n = name?.trim() ?? "";
  if (nutzer === null || n === "") return;
  const da = db.select({ name: person.name }).from(person).where(eq(person.nutzer, nutzer)).get();
  if (da?.name === n) return;
  db.insert(person).values({ nutzer, name: n }).onConflictDoUpdate({ target: person.nutzer, set: { name: n } }).run();
}

/** Alle Zuordnungen, je Gruppe nach Namen. */
export function ladeVerwalter(db: Leser): Map<string, VerwalterDTO[]> {
  const aus = new Map<string, VerwalterDTO[]>();
  for (const v of db.select().from(verwalter).orderBy(asc(verwalter.name), asc(verwalter.nutzer)).all()) {
    aus.set(v.gruppeId, [...(aus.get(v.gruppeId) ?? []), { nutzer: v.nutzer, name: v.name }]);
  }
  return aus;
}

/** Vorschläge der Suche: Verzeichnis und bekannte Personen, nach Kennung vereint, ohne schon Zugeordnete. */
export function vorschlaege(db: Leser, gruppeId: string, begriff: string, verzeichnis: DirectoryResult): PersonVorschlag[] {
  const q = begriff.trim().toLowerCase();
  if (q.length < SUCHE_MIN_ZEICHEN) return [];
  const weg = new Set(db.select({ nutzer: verwalter.nutzer }).from(verwalter).where(eq(verwalter.gruppeId, gruppeId)).all().map((v) => v.nutzer));
  const aus = new Map<string, PersonVorschlag>();
  for (const v of verzeichnis.people) {
    if (v.name && !weg.has(v.userId)) aus.set(v.userId, { nutzer: v.userId, name: v.name, email: v.email });
  }
  for (const b of db.select().from(person).all()) {
    if (!weg.has(b.nutzer) && !aus.has(b.nutzer) && b.name.toLowerCase().includes(q)) aus.set(b.nutzer, { nutzer: b.nutzer, name: b.name, email: null });
  }
  const rang = (v: PersonVorschlag) => (v.name.toLowerCase().startsWith(q) || (v.email ?? "").toLowerCase().startsWith(q) ? 0 : 1);
  return [...aus.values()].sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, "de")).slice(0, SUCHE_MAX_TREFFER);
}

function nameZu(db: Leser, nutzer: string, verzeichnis: DirectoryResult): string | null {
  const b = db.select({ name: person.name }).from(person).where(eq(person.nutzer, nutzer)).get();
  return b?.name ?? verzeichnis.people.find((v) => v.userId === nutzer)?.name ?? null;
}

export function verwalterHinzufuegen(db: WartungDb, gruppeId: string, nutzer: string, jetzt: number, verzeichnis: DirectoryResult): void {
  if (!db.select({ id: gruppe.id }).from(gruppe).where(eq(gruppe.id, gruppeId)).get()) throw new Abgelehnt("Diese Gruppe gibt es nicht mehr.");
  const name = nameZu(db, nutzer, verzeichnis);
  if (name === null) throw new Abgelehnt("Diese Person ist unbekannt. Sie muss die Gerätewartung einmal geöffnet haben.");
  db.insert(verwalter).values({ gruppeId, nutzer, name, angelegtAm: jetzt }).onConflictDoNothing().run();
}

export function verwalterEntfernen(db: WartungDb, gruppeId: string, nutzer: string): void {
  db.delete(verwalter).where(and(eq(verwalter.gruppeId, gruppeId), eq(verwalter.nutzer, nutzer))).run();
}
