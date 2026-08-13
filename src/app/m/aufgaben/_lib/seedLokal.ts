import { and, eq } from "drizzle-orm";
import { schreibeVerlauf } from "../_db/queries";
import type { DB } from "../_db/client";
import {
  aufgaben,
  nachweise,
  personen,
  routinen,
  type NachweisArt,
  type Prioritaet,
  type Rolle,
  type Status,
} from "../_db/schema";
import { isoTag, montagDerWoche, wochenTage } from "./datum";

/**
 * ANREICHERUNG NUR FÜR DIE LOKALE ARBEIT — bewusst NICHT am Boot-Pfad.
 *
 * `shouldSeed()` (`core/bootstrap.ts`) ist wahr bei `SUITE_SEED=1`, dem
 * GENERALPROBEN-Schalter — ein Boot-Seed wäre damit nicht lokal-only. Diese
 * Datei läuft ausschließlich über `scripts/seed-lokal.ts`.
 *
 * DIE ANMELDEADRESSE IST DER LOKALE ROLLENWECHSEL (Spec §13): es gibt bewusst
 * keinen Demo-Rollenwechsler im Modul selbst — man meldet sich am Dev-Login mit
 * einer anderen E-Mail an, und `sub` (`dev:<email>`, `core/auth/config.ts`)
 * macht daraus eine andere Person. Das Protokoll nennt deshalb für jede Person
 * die Adresse.
 *
 * IDEMPOTENT PRO ENTITÄT (nicht ein gemeinsames Gate) und REIN ADDITIV: eine
 * schon vorhandene Person/Aufgabe/Routine wird übersprungen und im Protokoll
 * benannt, nichts wird überschrieben oder gelöscht. Der `titel` einer Aufgabe
 * bzw. das Paar (Person, `titel`) einer Routine ist dabei der Wiedererkennungs-
 * schlüssel — dieselbe Rolle, die `sub` für Personen spielt.
 *
 * AUFGABEN, ROUTINEN UND VERLAUF SIND ABSICHTLICH DATENGETRIEBEN UND RELATIV:
 * jede Kalenderangabe geht über `isoTag`/`montagDerWoche`/`wochenTage` aus
 * `_lib/datum.ts` — GENAU diese Funktionen, keine zweite Datumsrechnung. Ein
 * Seed mit einem festen `"2026-08-14"` zeigte nach zwei Wochen eine leere Woche
 * und lauter überfällige Aufgaben; ein Lauf heute und ein Lauf in sechs Wochen
 * müssen deshalb unterschiedliche Plandaten ergeben (siehe `seedLokal.test.ts`).
 *
 * `schreibeVerlauf` (`_db/queries.ts`) bekommt hier seinen ERSTEN Aufrufer:
 * jeder Übergang der Übergangstabelle (Spec §5.2) schreibt eine Verlaufszeile,
 * und die Demo-Aufgaben unten bilden ihre Geschichte genau darüber nach.
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

const TAG_MS = 24 * 60 * 60 * 1000;

interface VerlaufEintrag {
  ereignis: string;
  akteurId: string;
  notiz?: string;
}

interface DemoAufgabe {
  titel: string;
  beschreibung: string;
  prioritaet: Prioritaet;
  erstellerId: string;
  zugewiesenAn: string | null;
  prueferId: string | null;
  status: Status;
  faelligAm: string;
  planDatum?: string | null;
  dauerMinuten: number;
  istSelbst?: boolean;
  nachweisPflicht?: boolean;
  nachweisArt?: NachweisArt;
  vorschlagDatum?: string | null;
  vorschlagUhrzeit?: string | null;
  verlauf: VerlaufEintrag[];
  nachweis?: { art: NachweisArt; text: string; erstelltVon: string };
}

/**
 * Legt eine Demo-Aufgabe samt ihrer Verlaufszeilen (und optional einem Nachweis) an — oder
 * überspringt sie, wenn der `titel` schon existiert. `titel` ist hier der Wiedererkennungs-
 * schlüssel, wie `sub` bei den Personen: die neun Demo-Aufgaben unten tragen deshalb feste,
 * unterscheidbare Titel statt generierter Namen.
 */
function legeAufgabeAn(db: DB, zeilen: string[], demo: DemoAufgabe): void {
  const vorhanden = db.select().from(aufgaben).where(eq(aufgaben.titel, demo.titel)).get();
  if (vorhanden) {
    zeilen.push(`aufgaben: Aufgabe „${demo.titel}“ war schon da — übersprungen.`);
    return;
  }
  const zeile = db
    .insert(aufgaben)
    .values({
      titel: demo.titel,
      beschreibung: demo.beschreibung,
      prioritaet: demo.prioritaet,
      erstellerId: demo.erstellerId,
      zugewiesenAn: demo.zugewiesenAn,
      prueferId: demo.prueferId,
      status: demo.status,
      faelligAm: demo.faelligAm,
      planDatum: demo.planDatum ?? null,
      dauerMinuten: demo.dauerMinuten,
      istSelbst: demo.istSelbst ?? false,
      nachweisPflicht: demo.nachweisPflicht ?? false,
      nachweisArt: demo.nachweisArt ?? "text",
      vorschlagDatum: demo.vorschlagDatum ?? null,
      vorschlagUhrzeit: demo.vorschlagUhrzeit ?? null,
    })
    .returning()
    .get();
  for (const eintrag of demo.verlauf) {
    schreibeVerlauf(db, { aufgabeId: zeile.id, ...eintrag });
  }
  if (demo.nachweis) {
    db.insert(nachweise)
      .values({
        aufgabeId: zeile.id,
        art: demo.nachweis.art,
        text: demo.nachweis.text,
        erstelltVon: demo.nachweis.erstelltVon,
      })
      .run();
  }
  zeilen.push(`aufgaben: Aufgabe „${demo.titel}“ (${demo.status}) angelegt.`);
}

interface DemoRoutine {
  personId: string;
  titel: string;
  /** Bitmaske Mo–Fr, dieselbe Kodierung wie `anzeige.ts` (`WOCHENTAG_BIT`, Index 0 = Montag). */
  wochentage: number;
  uhrzeit: string | null;
  dauerMinuten: number;
}

/** Wiedererkennungsschlüssel einer Routine ist das Paar (Person, `titel`) — es gibt keine `sub`-Analogie. */
function legeRoutineAn(db: DB, zeilen: string[], demo: DemoRoutine): void {
  const vorhanden = db
    .select()
    .from(routinen)
    .where(and(eq(routinen.personId, demo.personId), eq(routinen.titel, demo.titel)))
    .get();
  if (vorhanden) {
    zeilen.push(`aufgaben: Routine „${demo.titel}“ war schon da — übersprungen.`);
    return;
  }
  db.insert(routinen)
    .values({
      personId: demo.personId,
      titel: demo.titel,
      wochentage: demo.wochentage,
      uhrzeit: demo.uhrzeit,
      dauerMinuten: demo.dauerMinuten,
    })
    .run();
  zeilen.push(`aufgaben: Routine „${demo.titel}“ angelegt.`);
}

/** Legt die sechs Demo-Personen des Moduls `aufgaben` an, dann Aufgaben, Routinen und Verlauf. */
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

  // Personen-IDs nachschlagen — unabhängig davon, ob gerade angelegt oder schon vorhanden.
  const ids: Record<string, string> = {};
  for (const person of DEMO_PERSONEN) {
    const zeile = db.select().from(personen).where(eq(personen.sub, subFuer(person))).get();
    if (zeile) ids[person.sub] = zeile.id;
  }
  // Ohne alle sechs Personen (z. B. eine von Hand gelöschte) blieben Aufgaben ohne gültigen
  // Ersteller/Zugewiesenen stehen — lieber sichtbar abbrechen als eine FK-Verletzung zu riskieren.
  const fehlend = DEMO_PERSONEN.map((p) => p.sub).filter((sub) => !ids[sub]);
  if (fehlend.length > 0) {
    zeilen.push(
      `aufgaben: Aufgaben/Routinen übersprungen — Personen fehlen: ${fehlend.join(", ")}.`,
    );
    return zeilen;
  }

  // Relative Kalenderdaten — AUSSCHLIESSLICH über _lib/datum.ts (siehe Kopfkommentar).
  const heute = isoTag(new Date());
  const montag = montagDerWoche(heute);
  const [mo, di, mi, don] = wochenTage(montag);
  const inTagen = (n: number) => isoTag(new Date(Date.now() + n * TAG_MS));

  legeAufgabeAn(db, zeilen, {
    titel: "Verbandskästen im Fahrzeugpark prüfen",
    beschreibung: "Bestand und Verfallsdaten in allen Einsatzfahrzeugen kontrollieren.",
    prioritaet: "mittel",
    erstellerId: ids.schulle,
    zugewiesenAn: null,
    prueferId: null,
    status: "eingegangen",
    faelligAm: inTagen(10),
    dauerMinuten: 60,
    verlauf: [{ ereignis: "eingestellt", akteurId: ids.schulle }],
  });

  // Zeitvorschlag offen (Spec §5.1): verteilt, planDatum NULL, vorschlagDatum gesetzt.
  legeAufgabeAn(db, zeilen, {
    titel: "Zeltlager-Inventar dokumentieren",
    beschreibung: "Materialliste des Zeltlagers prüfen und Fehlbestände melden.",
    prioritaet: "niedrig",
    erstellerId: ids.schulle,
    zugewiesenAn: ids.lea,
    prueferId: ids.schulle,
    status: "verteilt",
    faelligAm: don,
    dauerMinuten: 90,
    vorschlagDatum: don,
    vorschlagUhrzeit: "09:00",
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.schulle },
      { ereignis: "verteilt", akteurId: ids.sarah, notiz: "Vorschlag: Do, 09:00" },
    ],
  });

  // Überfällig: faelligAm in der Vergangenheit, Status nicht abgeschlossen.
  legeAufgabeAn(db, zeilen, {
    titel: "Sanitätswache Stadtfest vorbereiten",
    beschreibung: "Material und Personaleinteilung für die Wache abstimmen.",
    prioritaet: "hoch",
    erstellerId: ids.joenne,
    zugewiesenAn: ids.noah,
    prueferId: ids.joenne,
    status: "in_arbeit",
    faelligAm: inTagen(-3),
    planDatum: inTagen(-3),
    dauerMinuten: 180,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.joenne },
      { ereignis: "verteilt", akteurId: ids.sarah },
      { ereignis: "eingeplant", akteurId: ids.noah },
      { ereignis: "gestartet", akteurId: ids.noah },
    ],
  });

  // nachweisPflicht: true, mit passendem Nachweis — freigabe_offen zeigt "Nachweis liegt vor".
  legeAufgabeAn(db, zeilen, {
    titel: "Erste-Hilfe-Kurs Nachbereitung",
    beschreibung: "Kursunterlagen abschließen und Nachweis für die Akte hinterlegen.",
    prioritaet: "mittel",
    erstellerId: ids.sarah,
    zugewiesenAn: ids.mira,
    prueferId: ids.joenne,
    status: "freigabe_offen",
    faelligAm: inTagen(2),
    planDatum: mi,
    dauerMinuten: 120,
    nachweisPflicht: true,
    nachweisArt: "text",
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.sarah },
      { ereignis: "verteilt", akteurId: ids.sarah },
      { ereignis: "eingeplant", akteurId: ids.mira },
      { ereignis: "gestartet", akteurId: ids.mira },
      { ereignis: "fertig_gemeldet", akteurId: ids.mira, notiz: "Nachweis hinterlegt." },
    ],
    nachweis: {
      art: "text",
      text: "Kurs durchgeführt, 8 Teilnehmende, Feedback positiv.",
      erstelltVon: ids.mira,
    },
  });

  legeAufgabeAn(db, zeilen, {
    titel: "Fahrzeugcheck Rettungswagen 3",
    beschreibung: "Wöchentlicher Check nach Checkliste, inklusive Reifendruck.",
    prioritaet: "mittel",
    erstellerId: ids.schulle,
    zugewiesenAn: ids.lea,
    prueferId: ids.schulle,
    status: "zurueckgewiesen",
    faelligAm: inTagen(1),
    planDatum: mo,
    dauerMinuten: 45,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.schulle },
      { ereignis: "verteilt", akteurId: ids.schulle },
      { ereignis: "eingeplant", akteurId: ids.lea },
      { ereignis: "gestartet", akteurId: ids.lea },
      { ereignis: "fertig_gemeldet", akteurId: ids.lea },
      {
        ereignis: "zurueckgewiesen",
        akteurId: ids.schulle,
        notiz: "Bitte Reifendruck nachtragen.",
      },
    ],
  });

  // Selbstaufgabe (Spec §5.2): istSelbst, kein Prüfer, Ersteller = Zugewiesener, Kurzstrecke
  // verteilt → in_arbeit → abgeschlossen ohne freigabe_offen.
  legeAufgabeAn(db, zeilen, {
    titel: "Eigene Fortbildung: Reanimation auffrischen",
    beschreibung: "Praktische Übung anhand der aktuellen Leitlinie.",
    prioritaet: "niedrig",
    erstellerId: ids.noah,
    zugewiesenAn: ids.noah,
    prueferId: null,
    istSelbst: true,
    status: "abgeschlossen",
    faelligAm: inTagen(-2),
    planDatum: di,
    dauerMinuten: 60,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.noah, notiz: "Selbstaufgabe" },
      { ereignis: "gestartet", akteurId: ids.noah },
      { ereignis: "abgeschlossen", akteurId: ids.noah },
    ],
  });

  // Eingeplante Aufgaben über mehrere Tage der Woche, bei mindestens zwei BuFDis: Lea (Montag,
  // Mittwoch via Nachweis-Aufgabe oben) und Noah (Montag, doppelt belegt — siehe unten).
  legeAufgabeAn(db, zeilen, {
    titel: "Standwache Blutspendetermin",
    beschreibung: "Aufbau, Einweisung Erstspenderinnen, Betreuung nach der Spende.",
    prioritaet: "mittel",
    erstellerId: ids.schulle,
    zugewiesenAn: ids.lea,
    prueferId: ids.schulle,
    status: "verteilt",
    faelligAm: mo,
    planDatum: mo,
    dauerMinuten: 240,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.schulle },
      { ereignis: "verteilt", akteurId: ids.schulle },
      { ereignis: "eingeplant", akteurId: ids.lea },
    ],
  });

  // Überbuchter Tag: Noahs Montag trägt 300 + 250 = 550 Minuten, über sollMinutenTag (468).
  legeAufgabeAn(db, zeilen, {
    titel: "Materialtransport Kreisverband",
    beschreibung: "Sanitätsmaterial vom Kreisverband zur Ortsgruppe transportieren.",
    prioritaet: "mittel",
    erstellerId: ids.schulle,
    zugewiesenAn: ids.noah,
    prueferId: ids.schulle,
    status: "verteilt",
    faelligAm: mo,
    planDatum: mo,
    dauerMinuten: 300,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.schulle },
      { ereignis: "verteilt", akteurId: ids.schulle },
      { ereignis: "eingeplant", akteurId: ids.noah },
    ],
  });

  legeAufgabeAn(db, zeilen, {
    titel: "Nachbereitung Materialtransport",
    beschreibung: "Fahrzeug reinigen, Restbestände zurückbuchen, Lieferschein ablegen.",
    prioritaet: "niedrig",
    erstellerId: ids.schulle,
    zugewiesenAn: ids.noah,
    prueferId: ids.schulle,
    status: "verteilt",
    faelligAm: mo,
    planDatum: mo,
    dauerMinuten: 250,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.schulle },
      { ereignis: "verteilt", akteurId: ids.schulle },
      { ereignis: "eingeplant", akteurId: ids.noah },
    ],
  });

  // Routinen bei mindestens zwei BuFDis, mit unterschiedlichen Wochentagsmasken (Bit je Wochentag,
  // Index 0 = Montag — dieselbe Kodierung wie `anzeige.ts`, `WOCHENTAG_BIT`).
  legeRoutineAn(db, zeilen, {
    personId: ids.lea,
    titel: "Frühbesprechung",
    wochentage: 0b11111, // Mo–Fr
    uhrzeit: "08:00",
    dauerMinuten: 15,
  });
  legeRoutineAn(db, zeilen, {
    personId: ids.noah,
    titel: "Sportprogramm",
    wochentage: 0b01010, // Di + Do
    uhrzeit: "16:00",
    dauerMinuten: 45,
  });
  legeRoutineAn(db, zeilen, {
    personId: ids.mira,
    titel: "Nachtbereitschaft-Übergabe",
    wochentage: 0b10101, // Mo + Mi + Fr
    uhrzeit: null,
    dauerMinuten: 20,
  });

  return zeilen;
}
