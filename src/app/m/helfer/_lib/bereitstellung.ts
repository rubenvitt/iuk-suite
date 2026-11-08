/**
 * DIE EINE FUNKTION, DIE DAS MODUL HELFER FÜR ANDERE MODULE VERÖFFENTLICHT (heute: das Einsatzbuch,
 * `einsatzbuch/_lib/stammdaten/helferAbgleich.ts`).
 *
 * Modul-Interna sind kein API (`docs/design/README.md`, „Die Regel für `src/core`“): das Einsatzbuch
 * liest weder diese Datenbank noch ihr Schema, sondern nur, was hier herausgegeben wird — dieselbe
 * Bauform wie `portal/_lib/launcher.ts`, nur zum ersten Mal von Modul zu Modul statt von `core` aus.
 * Ein Umweg über `core` hätte keinen zweiten Nutznießer.
 *
 * Herausgegeben wird, was die Auswahl im Einsatzbuch braucht, und nicht mehr: die eigene Kennung (nie
 * die HiOrg-Kennung — sie wandert sonst in versiegelte Einsätze), Vor- und Nachname, Qualifikationen.
 * Kein Status, keine Gruppen. Nur Helfer mit Freigabe fürs Einsatzbuch. `demo` sagt dem Empfänger,
 * dass es erfundene Personen sind — das Einsatzbuch zeigt sie in der Vorschau, übernimmt sie aber nicht.
 *
 * Wer hier ein Feld ergänzt, prüft zuerst, ob das Einsatzbuch es wirklich braucht;
 * `bereitstellung.test.ts` hält die Feldliste fest.
 *
 * Zweiter Empfänger ist die Schichtplanung (`helferFuerSchichtplanung`, IDA-313): ALLE übernommenen
 * Helfer, denn die Freigabe gilt nur fürs Einsatzbuch, und zusätzlich die Fahrerlaubnisklassen und
 * die HiOrg-Kennung (IDA-365). Die Schichtplanung versiegelt nichts; sie gibt die Kennung nur im
 * Austauschblatt an Lifeline Hub weiter, damit dort dieselbe Person wiedererkannt wird.
 */
import { desc, eq } from "drizzle-orm";
import { getDb, type HelferDb } from "../_db/client";
import { helfer, importlauf } from "../_db/schema";
import type { Qualifikation } from "./hiorg/person";

export interface BereitgestellterHelfer {
  id: string;
  vorname: string;
  nachname: string;
  qualifikationen: Pick<Qualifikation, "name" | "kurz">[];
  demo: boolean;
}

export interface Bereitstellung {
  helfer: BereitgestellterHelfer[];
  /** Zeitpunkt des letzten Abgleichs mit der Quelle (ISO), `null` vor dem ersten. */
  stand: string | null;
}

function json<T>(roh: string, ersatz: T): T {
  try {
    return JSON.parse(roh) as T;
  } catch {
    // Ein unlesbarer Wert heißt hier „nichts“: das Einsatzbuch übernimmt die Person dann nicht.
    return ersatz;
  }
}

function stand(db: HelferDb): string | null {
  const letzter = db.select({ zeitpunkt: importlauf.zeitpunkt }).from(importlauf).orderBy(desc(importlauf.zeitpunkt)).limit(1).get();
  return letzter?.zeitpunkt.toISOString() ?? null;
}

export function bereitgestellteHelfer(db: HelferDb = getDb()): Bereitstellung {
  const zeilen = db.select({
    id: helfer.id, vorname: helfer.vorname, nachname: helfer.nachname, qualifikationen: helfer.qualifikationen, herkunft: helfer.herkunft,
  }).from(helfer).where(eq(helfer.fuerEinsatzbuch, true)).all();
  return {
    stand: stand(db),
    helfer: zeilen.map((z) => ({
      id: z.id, vorname: z.vorname, nachname: z.nachname,
      qualifikationen: json<Qualifikation[]>(z.qualifikationen, []).map((q) => ({ name: q.name, kurz: q.kurz })),
      demo: z.herkunft === "demo",
    })),
  };
}

export interface HelferFuerSchichtplanung extends BereitgestellterHelfer {
  /** Nur die Klassen, z. B. `["B", "C1"]`. */
  fahrerlaubnis: string[];
  /** Die Kennung in HiOrg-Server, `null` bei Demo-Helfern und solchen aus einer Datei. */
  hiorgId: string | null;
}

/** Alle übernommenen Helfer — der Import lässt ohnehin nur Aktive durch —, ohne Blick auf die Einsatzbuch-Freigabe. */
export function helferFuerSchichtplanung(db: HelferDb = getDb()): { helfer: HelferFuerSchichtplanung[]; stand: string | null } {
  const zeilen = db.select({
    id: helfer.id, vorname: helfer.vorname, nachname: helfer.nachname, qualifikationen: helfer.qualifikationen,
    fahrerlaubnis: helfer.fahrerlaubnis, herkunft: helfer.herkunft, quellId: helfer.quellId,
  }).from(helfer).all();
  return {
    stand: stand(db),
    helfer: zeilen.map((z) => ({
      id: z.id, vorname: z.vorname, nachname: z.nachname,
      qualifikationen: json<Qualifikation[]>(z.qualifikationen, []).map((q) => ({ name: q.name, kurz: q.kurz })),
      fahrerlaubnis: json<string[]>(z.fahrerlaubnis, []),
      demo: z.herkunft === "demo",
      hiorgId: z.herkunft === "hiorg" ? z.quellId : null,
    })),
  };
}
