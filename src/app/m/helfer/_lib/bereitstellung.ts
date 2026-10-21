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

export function bereitgestellteHelfer(db: HelferDb = getDb()): Bereitstellung {
  const zeilen = db.select({
    id: helfer.id, vorname: helfer.vorname, nachname: helfer.nachname, qualifikationen: helfer.qualifikationen, herkunft: helfer.herkunft,
  }).from(helfer).where(eq(helfer.fuerEinsatzbuch, true)).all();
  const letzter = db.select({ zeitpunkt: importlauf.zeitpunkt }).from(importlauf).orderBy(desc(importlauf.zeitpunkt)).limit(1).get();
  return {
    stand: letzter?.zeitpunkt.toISOString() ?? null,
    helfer: zeilen.map((z) => {
      let qualifikationen: Qualifikation[] = [];
      try {
        qualifikationen = JSON.parse(z.qualifikationen) as Qualifikation[];
      } catch {
        // Ein unlesbarer Wert heißt hier „keine Qualifikation“: das Einsatzbuch übernimmt die Person dann nicht.
      }
      return {
        id: z.id, vorname: z.vorname, nachname: z.nachname,
        qualifikationen: qualifikationen.map((q) => ({ name: q.name, kurz: q.kurz })),
        demo: z.herkunft === "demo",
      };
    }),
  };
}
