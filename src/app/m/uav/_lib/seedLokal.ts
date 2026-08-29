import type { UavDb } from "../_db/client";
import { executions, participants, tasks } from "../_db/schema";
import type { Teil } from "./typen";

/**
 * ANREICHERUNG NUR FÜR DIE LOKALE ARBEIT — bewusst NICHT `_lib/boot.ts` (das läuft am
 * Boot, sobald `shouldSeed()` wahr ist, also auch bei `SUITE_SEED=1`, dem Schalter der
 * GENERALPROBE — ein geseedeter Teilnehmer-Code wäre dort ein gültiger anonymer Zugang,
 * `bootstrap.ts:59-61` schließt uav deshalb ausdrücklich vom Boot-Seed aus). Diese Datei
 * läuft ausschließlich über `scripts/seed-lokal.ts`.
 *
 * Die Bild-URLs zeigen schon auf das umgeschriebene Präfix (`/m/uav/illustrations/…`) —
 * Task 20 kopiert die Dateien dorthin, und `illustrationen.test.ts` prüft für jede Zeile
 * hier, dass die Datei existiert.
 */

interface LokaleAufgabe {
  id: string;
  teil: Teil;
  nummer: string;
  titel: string;
  lernziel: string;
  schritte: string[];
  durchfuehrungshinweise: string[];
  sicherheitshinweise: string[];
  zielanzahlDefault: number;
  sortOrder: number;
  bild: string;
}

export const LOKALE_TASKS: LokaleAufgabe[] = [
  {
    id: "1-1",
    teil: 1,
    nummer: "1.1",
    titel: "Vorflugkontrolle",
    lernziel: "Die Teilnehmerin prüft das Fluggerät vor dem Start vollständig und selbstständig.",
    schritte: ["Akkuzustand prüfen", "Propeller auf Beschädigung prüfen", "GPS-Fix abwarten"],
    durchfuehrungshinweise: ["Bei Wind über 8 m/s Übung abbrechen"],
    sicherheitshinweise: ["Sicherheitsabstand zu Personen einhalten"],
    zielanzahlDefault: 3,
    sortOrder: 0,
    bild: "/m/uav/illustrations/1-1.webp",
  },
  {
    id: "1-2",
    teil: 1,
    nummer: "1.2",
    titel: "Start und Schwebeflug",
    lernziel: "Die Teilnehmerin startet kontrolliert und hält die Position im Schwebeflug.",
    schritte: ["Senkrecht starten", "Auf Augenhöhe abfangen", "30 Sekunden Position halten"],
    durchfuehrungshinweise: [],
    sicherheitshinweise: ["Nur mit Luftraumbeobachter durchführen"],
    zielanzahlDefault: 2,
    sortOrder: 1,
    bild: "/m/uav/illustrations/1-2.webp",
  },
  {
    id: "2-1",
    teil: 2,
    nummer: "2.1",
    titel: "Wegpunktflug",
    lernziel: "Die Teilnehmerin fliegt eine vorgegebene Strecke aus mehreren Wegpunkten ab.",
    schritte: ["Route vor dem Start ansagen", "Wegpunkte in Reihenfolge anfliegen", "Am letzten Wegpunkt landen"],
    durchfuehrungshinweise: ["Route vorher mit Kreide markieren"],
    sicherheitshinweise: ["Rückweg freihalten"],
    zielanzahlDefault: 1,
    sortOrder: 2,
    bild: "/m/uav/illustrations/2-1.webp",
  },
];

interface LokalerTeilnehmer {
  id: string;
  name: string;
  loginCode: string;
  aktiv: boolean;
  beginn: string | null;
}

/**
 * Feste Codes, KEINE `loginCodeErzeugen()`-Zufallswerte: `E2ETEST1`/`E2EGESP2` sind die
 * Codes, die `e2e/helpers/uav.ts` (Task 21) fest verdrahtet — ein zufälliger Code wäre
 * bei jedem Seed-Lauf ein anderer und ließe sich aus einem E2E-Test heraus nicht mehr
 * ansprechen.
 */
export const LOKALE_TEILNEHMER: LokalerTeilnehmer[] = [
  { id: "seed-uav-teilnehmer-aktiv", name: "Erika Mustermann (E2E)", loginCode: "E2ETEST1", aktiv: true, beginn: "2026-01-05" },
  { id: "seed-uav-teilnehmer-inaktiv", name: "Max Gesperrt (E2E)", loginCode: "E2EGESP2", aktiv: false, beginn: null },
];

interface LokaleDurchfuehrung {
  id: string;
  participantId: string;
  taskId: string;
  datum: string;
  drohnensteuerer: string;
  luftraumbeobachter: string;
}

export const LOKALE_DURCHFUEHRUNGEN: LokaleDurchfuehrung[] = [
  {
    id: "seed-uav-durchfuehrung-1",
    participantId: "seed-uav-teilnehmer-aktiv",
    taskId: "1-1",
    datum: "2026-01-06",
    drohnensteuerer: "Erika Mustermann",
    luftraumbeobachter: "Klaus Beobachter",
  },
  {
    id: "seed-uav-durchfuehrung-2",
    participantId: "seed-uav-teilnehmer-aktiv",
    taskId: "1-1",
    datum: "2026-01-13",
    drohnensteuerer: "Klaus Beobachter",
    luftraumbeobachter: "Erika Mustermann",
  },
];

/**
 * Idempotent PRO ENTITÄT über `onConflictDoNothing()` (kein gemeinsames Gate) und
 * ADDITIV — Vorbild `qr/_lib/seedLokal.ts`. Einfügereihenfolge: Aufgaben und
 * Teilnehmer zuerst, `executions.participant_id` trägt eine FK darauf.
 */
export async function seedLokalUav(db: UavDb): Promise<string[]> {
  const jetzt = new Date().toISOString();

  let aufgabenAngelegt = 0;
  for (const t of LOKALE_TASKS) {
    const ergebnis = db
      .insert(tasks)
      .values({
        id: t.id,
        teil: t.teil,
        nummer: t.nummer,
        titel: t.titel,
        lernziel: t.lernziel,
        schritte: JSON.stringify(t.schritte),
        durchfuehrungshinweise: JSON.stringify(t.durchfuehrungshinweise),
        sicherheitshinweise: JSON.stringify(t.sicherheitshinweise),
        zielanzahlDefault: t.zielanzahlDefault,
        sortOrder: t.sortOrder,
        aktiv: 1,
        bild: t.bild,
        updatedAt: jetzt,
      })
      .onConflictDoNothing()
      .run();
    if (ergebnis.changes > 0) aufgabenAngelegt++;
  }

  let teilnehmerAngelegt = 0;
  for (const p of LOKALE_TEILNEHMER) {
    const ergebnis = db
      .insert(participants)
      .values({
        id: p.id,
        name: p.name,
        loginCode: p.loginCode,
        aktiv: p.aktiv ? 1 : 0,
        beginn: p.beginn,
        createdAt: jetzt,
      })
      .onConflictDoNothing()
      .run();
    if (ergebnis.changes > 0) teilnehmerAngelegt++;
  }

  let durchfuehrungenAngelegt = 0;
  for (const e of LOKALE_DURCHFUEHRUNGEN) {
    const ergebnis = db
      .insert(executions)
      .values({
        id: e.id,
        participantId: e.participantId,
        taskId: e.taskId,
        datum: e.datum,
        drohnensteuerer: e.drohnensteuerer,
        luftraumbeobachter: e.luftraumbeobachter,
        createdAt: jetzt,
      })
      .onConflictDoNothing()
      .run();
    if (ergebnis.changes > 0) durchfuehrungenAngelegt++;
  }

  return [
    `uav: ${aufgabenAngelegt} Aufgaben angelegt, ${LOKALE_TASKS.length - aufgabenAngelegt} bereits vorhanden (${LOKALE_TASKS.length} insgesamt).`,
    `uav: ${teilnehmerAngelegt} Teilnehmer angelegt, ${LOKALE_TEILNEHMER.length - teilnehmerAngelegt} bereits vorhanden.`,
    `uav: ${durchfuehrungenAngelegt} Durchführungen angelegt, ${LOKALE_DURCHFUEHRUNGEN.length - durchfuehrungenAngelegt} bereits vorhanden.`,
    "uav: http://uav.localtest.me:3000/login?code=E2ETEST1 — aktiver Teilnehmer (Erika Mustermann).",
    "uav: http://uav.localtest.me:3000/login?code=E2EGESP2 — gesperrter Teilnehmer, Login schlägt fehl.",
  ];
}
