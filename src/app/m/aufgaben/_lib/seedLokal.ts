import { and, eq } from "drizzle-orm";
import { schreibeVerlauf } from "../_db/queries";
import type { DB } from "../_db/client";
import {
  aufgaben,
  nachweise,
  personen,
  routinen,
  type Ereignis,
  type NachweisArt,
  type Prioritaet,
  type Rolle,
  type Status,
} from "../_db/schema";
import { isoTag, montagDerWoche, tagePlus, wochenTage } from "./datum";

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
 * jede Kalenderangabe geht über `isoTag`/`montagDerWoche`/`wochenTage`/`tagePlus`
 * aus `_lib/datum.ts` — GENAU diese Funktionen, keine zweite Datumsrechnung. Ein
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
   * `name` abgeleitet — sonst laufen Anzeigename und Anmeldeadresse auseinander,
   * sobald ein Name ein Sonderzeichen traegt.
   */
  sub: string;
  name: string;
  initialen: string;
  rolle: Rolle;
  /** Ueberschreibt `AKTIV_VON` — nur fuer die ausgeschiedene Person unten gebraucht. */
  aktivVon?: string;
  aktivBis?: string;
}

/**
 * ERFUNDENE PERSONAS (Betreiberentscheidung 2026-08-13) — nicht die Namen aus der
 * Spec. Dort beschreiben sechs Namen reale Kolleginnen und Kollegen, und die
 * haben in Demodaten nichts zu suchen: sie landen dauerhaft im Repository und in
 * jeder lokalen Datenbank. A/B/C bei den drei BuFDis ist Absicht — es macht
 * Reihenfolgen in Tests und Listen lesbar.
 *
 * `sub` bleibt ASCII, AUCH wenn ein kuenftiger Name einen Umlaut trueg: die
 * Anmeldeadresse ist eine Zeichenfolge, die ein Mensch abtippt, um lokal die
 * Rolle zu wechseln (Spec §13, kein Demo-Rollenwechsler). Ein falsch
 * getroffenes Sonderzeichen ergaebe einen `sub` ohne `personen`-Zeile, und der
 * Befund waere `notFound()` — "die Seite ist kaputt" statt "falsch angemeldet".
 * Das Login-Feld ist ausserdem ein normales antd-`<Input>` ohne `type="email"`,
 * pruefte den Wert also nicht vorher. Und die Datenbankwerte dieses Moduls
 * meiden Umlaute ohnehin aus Prinzip (`zurueckgewiesen`, nicht
 * "zurückgewiesen"). Die Regel gilt unabhaengig davon, dass alle sechs Namen
 * hier von sich aus schon ASCII sind.
 */
const DEMO_PERSONEN: DemoPerson[] = [
  { sub: "rike", name: "Rike", initialen: "RI", rolle: "koordination" },
  { sub: "malte", name: "Malte", initialen: "MA", rolle: "auftrag" },
  { sub: "tomke", name: "Tomke", initialen: "TO", rolle: "auftrag" },
  { sub: "alina", name: "Alina", initialen: "AL", rolle: "bufdi" },
  { sub: "bendix", name: "Bendix", initialen: "BE", rolle: "bufdi" },
  { sub: "carla", name: "Carla", initialen: "CA", rolle: "bufdi" },
];

const AKTIV_VON = "2026-08-01";

function subFuer(person: DemoPerson): string {
  return `dev:${person.sub}@localtest.me`;
}

interface VerlaufEintrag {
  /** `Ereignis` statt `string` seit Aufgabe 8 (`EREIGNISSE`, `_db/schema.ts`) — der Seed war das
   * Vokabular, das jene Aufgabe erst festgehalten hat, und haelt sich unveraendert daran. */
  ereignis: Ereignis;
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
 * schlüssel, wie `sub` bei den Personen: die Demo-Aufgaben unten tragen deshalb feste,
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

/** Legt die Demo-Personen des Moduls `aufgaben` an, dann Aufgaben, Routinen und Verlauf. */
export async function seedLokalAufgaben(db: DB): Promise<string[]> {
  const zeilen: string[] = [];

  // Relative Kalenderdaten — AUSSCHLIESSLICH über _lib/datum.ts (siehe Kopfkommentar). Vor der
  // Personenliste ermittelt, weil die siebte, ausgeschiedene Person unten relative Werte braucht.
  const heute = isoTag(new Date());
  const montag = montagDerWoche(heute);
  const [mo, di, mi, don] = wochenTage(montag);

  /**
   * DIE SIEBTE PERSON, AUSGESCHIEDEN: `aktivBis` ist die Spalte, an der `istAktiv`,
   * `aktivePersonen`, `bufdis` und alle fünf Handlungsprädikate hängen — ohne einen
   * Demo-Datensatz mit gesetztem `aktivBis` können die Seiten der Aufgaben 13–16 lokal nie
   * zeigen, was ein Ausgeschiedener sieht und was nicht. `aktivBis` liegt relativ zu `heute`
   * (nicht fest), damit sie auch bei einem Lauf in einigen Wochen noch als ausgeschieden gilt.
   */
  const doerte: DemoPerson = {
    sub: "doerte",
    name: "Dörte",
    initialen: "DÖ",
    rolle: "bufdi",
    aktivVon: tagePlus(heute, -400),
    aktivBis: tagePlus(heute, -14),
  };
  const demoPersonen: DemoPerson[] = [...DEMO_PERSONEN, doerte];

  for (const person of demoPersonen) {
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
        aktivVon: person.aktivVon ?? AKTIV_VON,
        aktivBis: person.aktivBis ?? null,
      })
      .run();
    zeilen.push(
      `aufgaben: Person ${person.name} (${person.rolle}) angelegt — Anmeldeadresse ${sub}.`,
    );
  }

  // Personen-IDs nachschlagen — unabhängig davon, ob gerade angelegt oder schon vorhanden.
  const ids: Record<string, string> = {};
  for (const person of demoPersonen) {
    const zeile = db.select().from(personen).where(eq(personen.sub, subFuer(person))).get();
    if (zeile) ids[person.sub] = zeile.id;
  }
  // Ohne alle Personen (z. B. eine von Hand gelöschte) blieben Aufgaben ohne gültigen
  // Ersteller/Zugewiesenen stehen — lieber sichtbar abbrechen als eine FK-Verletzung zu riskieren.
  const fehlend = demoPersonen.map((p) => p.sub).filter((sub) => !ids[sub]);
  if (fehlend.length > 0) {
    zeilen.push(
      `aufgaben: Aufgaben/Routinen übersprungen — Personen fehlen: ${fehlend.join(", ")}.`,
    );
    return zeilen;
  }

  legeAufgabeAn(db, zeilen, {
    titel: "Verbandskästen im Fahrzeugpark prüfen",
    beschreibung: "Bestand und Verfallsdaten in allen Einsatzfahrzeugen kontrollieren.",
    prioritaet: "mittel",
    erstellerId: ids.malte,
    zugewiesenAn: null,
    prueferId: null,
    status: "eingegangen",
    faelligAm: tagePlus(heute, 10),
    dauerMinuten: 60,
    verlauf: [{ ereignis: "eingestellt", akteurId: ids.malte }],
  });

  // Zeitvorschlag offen (Spec §5.1): verteilt, planDatum NULL, vorschlagDatum gesetzt.
  legeAufgabeAn(db, zeilen, {
    titel: "Zeltlager-Inventar dokumentieren",
    beschreibung: "Materialliste des Zeltlagers prüfen und Fehlbestände melden.",
    prioritaet: "niedrig",
    erstellerId: ids.malte,
    zugewiesenAn: ids.alina,
    prueferId: ids.malte,
    status: "verteilt",
    faelligAm: don,
    dauerMinuten: 90,
    vorschlagDatum: don,
    vorschlagUhrzeit: "09:00",
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.malte },
      { ereignis: "verteilt", akteurId: ids.rike, notiz: "Vorschlag: Do, 09:00" },
    ],
  });

  // Überfällig: faelligAm in der Vergangenheit, Status nicht abgeschlossen.
  legeAufgabeAn(db, zeilen, {
    titel: "Sanitätswache Stadtfest vorbereiten",
    beschreibung: "Material und Personaleinteilung für die Wache abstimmen.",
    prioritaet: "hoch",
    erstellerId: ids.tomke,
    zugewiesenAn: ids.bendix,
    prueferId: ids.tomke,
    status: "in_arbeit",
    faelligAm: tagePlus(heute, -3),
    planDatum: tagePlus(heute, -3),
    dauerMinuten: 180,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.tomke },
      { ereignis: "verteilt", akteurId: ids.rike },
      { ereignis: "eingeplant", akteurId: ids.bendix },
      { ereignis: "gestartet", akteurId: ids.bendix },
    ],
  });

  // VERTEILT, UNVERPLANT, MIT BILD-NACHWEISPFLICHT (Aufgabe 19) — die eine Demo-Aufgabe, an der
  // sich der Upload UND die Auslieferung end-to-end vorfuehren lassen (e2e/aufgaben.spec.ts).
  // BEWUSST NICHT SCHON `in_arbeit`: `wartetAufEinplanung` (`_lib/anzeige.ts`, `status ===
  // "verteilt" && planDatum === null`) ist die einzige Bedingung, unter der ein Aufgabentitel in
  // Alinas Posteingang als ECHTER LINK erscheint (`_ui/AufgabenListe.tsx`) — die Wochenplan-Spalten
  // rendern Titel nur als Text, ohne Verweis (`_ui/Wochenplan.tsx`). Der e2e-Test klickt sich also
  // ueber den Posteingang zur Detailseite und startet die Aufgabe dort selbst (Knopf „Bearbeitung
  // starten"), bevor er den Nachweis hochlaedt.
  legeAufgabeAn(db, zeilen, {
    titel: "Fahrzeugerstausstattung fotografisch dokumentieren",
    beschreibung: "Vollständigkeit der Erstausstattung im Rettungswagen 3 per Foto belegen.",
    prioritaet: "mittel",
    erstellerId: ids.malte,
    zugewiesenAn: ids.alina,
    prueferId: ids.malte,
    status: "verteilt",
    faelligAm: tagePlus(heute, 5),
    dauerMinuten: 20,
    nachweisPflicht: true,
    nachweisArt: "bild",
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.malte },
      { ereignis: "verteilt", akteurId: ids.malte },
    ],
  });

  // nachweisPflicht: true, mit passendem Nachweis — freigabe_offen zeigt "Nachweis liegt vor".
  legeAufgabeAn(db, zeilen, {
    titel: "Erste-Hilfe-Kurs Nachbereitung",
    beschreibung: "Kursunterlagen abschließen und Nachweis für die Akte hinterlegen.",
    prioritaet: "mittel",
    erstellerId: ids.rike,
    zugewiesenAn: ids.carla,
    prueferId: ids.tomke,
    status: "freigabe_offen",
    faelligAm: tagePlus(heute, 2),
    planDatum: mi,
    dauerMinuten: 120,
    nachweisPflicht: true,
    nachweisArt: "text",
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.rike },
      { ereignis: "verteilt", akteurId: ids.rike },
      { ereignis: "eingeplant", akteurId: ids.carla },
      { ereignis: "gestartet", akteurId: ids.carla },
      { ereignis: "fertig_gemeldet", akteurId: ids.carla, notiz: "Nachweis hinterlegt." },
    ],
    nachweis: {
      art: "text",
      text: "Kurs durchgeführt, 8 Teilnehmende, Feedback positiv.",
      erstelltVon: ids.carla,
    },
  });

  // Eingeplant auf Dienstag statt Montag (siehe Kommentar bei "Standwache Blutspendetermin"
  // unten) — damit belegt Alina zwei verschiedene Tage, nicht nur einen.
  legeAufgabeAn(db, zeilen, {
    titel: "Fahrzeugcheck Rettungswagen 3",
    beschreibung: "Wöchentlicher Check nach Checkliste, inklusive Reifendruck.",
    prioritaet: "mittel",
    erstellerId: ids.malte,
    zugewiesenAn: ids.alina,
    prueferId: ids.malte,
    status: "zurueckgewiesen",
    faelligAm: tagePlus(heute, 1),
    planDatum: di,
    dauerMinuten: 45,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.malte },
      { ereignis: "verteilt", akteurId: ids.malte },
      { ereignis: "eingeplant", akteurId: ids.alina },
      { ereignis: "gestartet", akteurId: ids.alina },
      { ereignis: "fertig_gemeldet", akteurId: ids.alina },
      {
        ereignis: "zurueckgewiesen",
        akteurId: ids.malte,
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
    erstellerId: ids.bendix,
    zugewiesenAn: ids.bendix,
    prueferId: null,
    istSelbst: true,
    status: "abgeschlossen",
    faelligAm: tagePlus(heute, -2),
    planDatum: di,
    dauerMinuten: 60,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.bendix, notiz: "Selbstaufgabe" },
      { ereignis: "gestartet", akteurId: ids.bendix },
      { ereignis: "abgeschlossen", akteurId: ids.bendix },
    ],
  });

  // Eingeplante Aufgaben über mehrere Tage der Woche, bei mindestens zwei BuFDis: Alina (Montag
  // hier, Dienstag beim Fahrzeugcheck oben) und Bendix (Montag, doppelt belegt — siehe unten,
  // plus Dienstag bei der Eigenen Fortbildung oben).
  legeAufgabeAn(db, zeilen, {
    titel: "Standwache Blutspendetermin",
    beschreibung: "Aufbau, Einweisung Erstspenderinnen, Betreuung nach der Spende.",
    prioritaet: "mittel",
    erstellerId: ids.malte,
    zugewiesenAn: ids.alina,
    prueferId: ids.malte,
    status: "verteilt",
    faelligAm: mo,
    planDatum: mo,
    dauerMinuten: 240,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.malte },
      { ereignis: "verteilt", akteurId: ids.malte },
      { ereignis: "eingeplant", akteurId: ids.alina },
    ],
  });

  // Überbuchter Tag: Bendix' Montag trägt 300 + 250 = 550 Minuten, über sollMinutenTag (468).
  legeAufgabeAn(db, zeilen, {
    titel: "Materialtransport Kreisverband",
    beschreibung: "Sanitätsmaterial vom Kreisverband zur Ortsgruppe transportieren.",
    prioritaet: "mittel",
    erstellerId: ids.malte,
    zugewiesenAn: ids.bendix,
    prueferId: ids.malte,
    status: "verteilt",
    faelligAm: mo,
    planDatum: mo,
    dauerMinuten: 300,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.malte },
      { ereignis: "verteilt", akteurId: ids.malte },
      { ereignis: "eingeplant", akteurId: ids.bendix },
    ],
  });

  legeAufgabeAn(db, zeilen, {
    titel: "Nachbereitung Materialtransport",
    beschreibung: "Fahrzeug reinigen, Restbestände zurückbuchen, Lieferschein ablegen.",
    prioritaet: "niedrig",
    erstellerId: ids.malte,
    zugewiesenAn: ids.bendix,
    prueferId: ids.malte,
    status: "verteilt",
    faelligAm: mo,
    planDatum: mo,
    dauerMinuten: 250,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.malte },
      { ereignis: "verteilt", akteurId: ids.malte },
      { ereignis: "eingeplant", akteurId: ids.bendix },
    ],
  });

  // Dörtes eine, laengst abgeschlossene Aufgabe — aus der Zeit, bevor sie ausschied
  // (planDatum liegt vor ihrem aktivBis).
  legeAufgabeAn(db, zeilen, {
    titel: "Depotbestand Winterausstattung dokumentieren",
    beschreibung: "Jährliche Inventur der Winterausstattung, Fehlbestände melden.",
    prioritaet: "niedrig",
    erstellerId: ids.malte,
    zugewiesenAn: ids.doerte,
    prueferId: ids.malte,
    status: "abgeschlossen",
    faelligAm: tagePlus(heute, -20),
    planDatum: tagePlus(heute, -20),
    dauerMinuten: 90,
    verlauf: [
      { ereignis: "eingestellt", akteurId: ids.malte },
      { ereignis: "verteilt", akteurId: ids.malte },
      { ereignis: "eingeplant", akteurId: ids.doerte },
      { ereignis: "gestartet", akteurId: ids.doerte },
      { ereignis: "fertig_gemeldet", akteurId: ids.doerte },
      { ereignis: "abgeschlossen", akteurId: ids.malte, notiz: "Freigegeben." },
    ],
  });

  // Routinen bei mindestens zwei BuFDis, mit unterschiedlichen Wochentagsmasken (Bit je Wochentag,
  // Index 0 = Montag — dieselbe Kodierung wie `anzeige.ts`, `WOCHENTAG_BIT`).
  legeRoutineAn(db, zeilen, {
    personId: ids.alina,
    titel: "Frühbesprechung",
    wochentage: 0b11111, // Mo–Fr
    uhrzeit: "08:00",
    dauerMinuten: 15,
  });
  legeRoutineAn(db, zeilen, {
    personId: ids.bendix,
    titel: "Sportprogramm",
    wochentage: 0b01010, // Di + Do
    uhrzeit: "16:00",
    dauerMinuten: 45,
  });
  legeRoutineAn(db, zeilen, {
    personId: ids.carla,
    titel: "Nachtbereitschaft-Übergabe",
    wochentage: 0b10101, // Mo + Mi + Fr
    uhrzeit: null,
    dauerMinuten: 20,
  });

  return zeilen;
}
