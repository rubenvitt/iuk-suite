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
  /**
   * Die Anmeldeadresse (ohne `dev:`-Praefix und Domain), EXPLIZIT statt aus
   * `name` abgeleitet — sonst laufen Anzeigename und Anmeldeadresse auseinander
   * (siehe Jönne unten).
   */
  sub: string;
  name: string;
  initialen: string;
  rolle: Rolle;
}

/**
 * Namen aus der Spec (§1, §4); der dritte BuFDi ist dort nicht benannt — "Mira"
 * ist hier festgelegt.
 *
 * `sub` bleibt ASCII, AUCH bei "Jönne" (`joenne`, nicht `jönne`): die
 * Anmeldeadresse ist eine Zeichenfolge, die ein Mensch abtippt, um lokal die
 * Rolle zu wechseln (Spec §13, kein Demo-Rollenwechsler). Ein falsch
 * getroffenes "ö" ergaebe einen `sub` ohne `personen`-Zeile, und der Befund
 * waere `notFound()` — "die Seite ist kaputt" statt "falsch angemeldet". Das
 * Login-Feld ist ausserdem ein normales antd-`<Input>` ohne `type="email"`,
 * pruefte den Wert also nicht vorher. Und die Datenbankwerte dieses Moduls
 * meiden Umlaute ohnehin aus Prinzip (`zurueckgewiesen`, nicht
 * "zurückgewiesen"). Der Anzeigename bleibt "Jönne" — nur die Adresse weicht ab.
 */
const DEMO_PERSONEN: DemoPerson[] = [
  { sub: "sarah", name: "Sarah", initialen: "SA", rolle: "koordination" },
  { sub: "schulle", name: "Schulle", initialen: "SC", rolle: "auftrag" },
  { sub: "joenne", name: "Jönne", initialen: "JÖ", rolle: "auftrag" },
  { sub: "lea", name: "Lea", initialen: "LE", rolle: "bufdi" },
  { sub: "noah", name: "Noah", initialen: "NO", rolle: "bufdi" },
  { sub: "mira", name: "Mira", initialen: "MI", rolle: "bufdi" },
];

const AKTIV_VON = "2026-08-01";

function subFuer(person: DemoPerson): string {
  return `dev:${person.sub}@localtest.me`;
}

/** Legt die sechs Demo-Personen des Moduls `aufgaben` an. */
export async function seedLokalAufgaben(db: DB): Promise<string[]> {
  const zeilen: string[] = [];

  for (const person of DEMO_PERSONEN) {
    const sub = subFuer(person);
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
