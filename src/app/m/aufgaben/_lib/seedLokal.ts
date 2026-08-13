import { eq } from "drizzle-orm";
import type { DB } from "../_db/client";
import { personen, type Rolle } from "../_db/schema";

/**
 * ANREICHERUNG NUR FÜR DIE LOKALE ARBEIT — bewusst NICHT am Boot-Pfad.
 *
 * `shouldSeed()` (`core/bootstrap.ts`) ist wahr bei `SUITE_SEED=1`, dem
 * GENERALPROBEN-Schalter — ein Boot-Seed wäre damit nicht lokal-only. Diese
 * Datei läuft ausschließlich über `scripts/seed-lokal.ts`.
 *
 * VORGEZOGEN AUS EINER SPÄTEREN AUFGABE: das Dreieck (Migrationsverzeichnis,
 * `MODULE_MIGRATIONS`, Dockerfile-`COPY`) trägt `aufgaben` bereits in
 * `MODULE_MIGRATIONS`, und `scripts/seed-lokal.test.ts` verlangt hart, dass
 * jedes dort gelistete Modul auch in `SEED_MODULE` steht — sonst bekäme das
 * nächste Modul mit `_db/` lautlos keine lokalen Daten. Diese Datei legt daher
 * schon jetzt NUR die sechs Demo-Personen an; Aufgaben, Routinen und Verlauf
 * bleiben einer späteren Aufgabe vorbehalten, die dieselbe Datei erweitert statt
 * sie neu zu schreiben.
 *
 * DIE ANMELDEADRESSE IST DER LOKALE ROLLENWECHSEL (Spec §13): es gibt bewusst
 * keinen Demo-Rollenwechsler im Modul selbst — man meldet sich am Dev-Login mit
 * einer anderen E-Mail an, und `sub` (`dev:<email>`, `core/auth/config.ts`)
 * macht daraus eine andere Person. Das Protokoll nennt deshalb für jede Person
 * die Adresse.
 *
 * IDEMPOTENT PRO PERSON (nicht ein gemeinsames Gate) und REIN ADDITIV: eine
 * schon vorhandene `sub` wird übersprungen und im Protokoll benannt, nichts
 * wird überschrieben oder gelöscht.
 */

interface DemoPerson {
  vorname: string;
  name: string;
  initialen: string;
  rolle: Rolle;
}

/** Namen aus der Spec (§1, §4); der dritte BuFDi ist dort nicht benannt — "Mira" ist hier festgelegt. */
const DEMO_PERSONEN: DemoPerson[] = [
  { vorname: "Sarah", name: "Sarah", initialen: "SA", rolle: "koordination" },
  { vorname: "Schulle", name: "Schulle", initialen: "SC", rolle: "auftrag" },
  { vorname: "Jönne", name: "Jönne", initialen: "JÖ", rolle: "auftrag" },
  { vorname: "Lea", name: "Lea", initialen: "LE", rolle: "bufdi" },
  { vorname: "Noah", name: "Noah", initialen: "NO", rolle: "bufdi" },
  { vorname: "Mira", name: "Mira", initialen: "MI", rolle: "bufdi" },
];

const AKTIV_VON = "2026-08-01";

function subFuer(vorname: string): string {
  return `dev:${vorname.toLowerCase()}@localtest.me`;
}

/** Legt die sechs Demo-Personen des Moduls `aufgaben` an. */
export async function seedLokalAufgaben(db: DB): Promise<string[]> {
  const zeilen: string[] = [];

  for (const person of DEMO_PERSONEN) {
    const sub = subFuer(person.vorname);
    const vorhanden = db.select().from(personen).where(eq(personen.sub, sub)).get();
    if (vorhanden) {
      zeilen.push(`aufgaben: Person ${person.name} (${sub}) war schon da — übersprungen.`);
      continue;
    }
    db.insert(personen)
      .values({
        sub,
        name: person.name,
        initialen: person.initialen,
        rolle: person.rolle,
        aktivVon: AKTIV_VON,
      })
      .run();
    zeilen.push(
      `aufgaben: Person ${person.name} (${person.rolle}) angelegt — Anmeldeadresse ${sub}.`,
    );
  }

  return zeilen;
}
