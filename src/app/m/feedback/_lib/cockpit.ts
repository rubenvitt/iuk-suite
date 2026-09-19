import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../_db/schema";
import type { EveningRow, SurveyRow } from "../_db/schema";
import { listEvenings, getSurveyByEvening, listResponses } from "../_db/queries";
import { nextStatusOnAccess, type SurveyStatus } from "./lifecycle";

type DB = BetterSQLite3Database<typeof schema>;

/**
 * DER ZUSTANDS-SELEKTOR DES COCKPITS (Entwurf §2.2).
 *
 * EINE Stelle entscheidet vor dem Rendern, was die einzige Arbeitsseite des
 * Moduls zeigt. Nicht die JSX: dort stünden sonst fünf verschachtelte `&&`, und
 * die Frage „was passiert, wenn eine abgelaufene Umfrage aktiv ist UND ein
 * Altbestands-Entwurf existiert" wäre nirgends beantwortet, sondern verteilt.
 *
 * Vier Entscheidungen, die hier und nur hier liegen:
 *
 * 1. FALTEN STATT SCHREIBEN. Es gibt keinen Cron. `nextStatusOnAccess` rechnet
 *    den effektiven Status aus `closesAt`, ohne zu schreiben — deshalb ist die
 *    Seite prefetch-sicher, und eine verstrichene Frist zeigt sofort „nichts
 *    läuft" plus „Letzter Abend". Persistiert wird nur auf echten POSTs
 *    (Teilnahmepfad, `createAndStartSurvey`, `beendeFeedbackAction`).
 * 2. `laufend` KOMMT NICHT AUS `activeSurveyForGroup`. Diese Abfrage filtert in
 *    SQL auf `status='active'` (kennt die Frist also nicht) und liefert per
 *    `.get()` bei zwei aktiven Umfragen stumm eine beliebige. §2.2 verlangt aber
 *    die mit dem jüngsten `activatedAt` plus eine neutrale Zeile für die zweite.
 *    Beides ist nur aus der gefalteten Gesamtliste zu bekommen.
 * 3. DIE BELEGUNG IST EIN AUSDRUCK OHNE AUFFANGZWEIG. Damit ist die Totalität
 *    strukturell und nicht erhofft: `laufend` gesetzt → C oder D, sonst → A oder
 *    B. Ein fünfter Rückgabewert existiert nicht.
 * 4. BELEGUNG E IST KEIN KARTENZUSTAND. Ein Altbestands-Entwurf (importiert oder
 *    aus der alten Oberfläche) darf die Führung der Seite nicht kapern: er
 *    erscheint in `altbestand` und damit ausschließlich als Verlaufszeile. Die
 *    Lagekarte bleibt in A/B.
 * 5. EIN GEPLANTER ABEND ZÄHLT NIRGENDWO ALS ABEND. Er ist aus jeder der vier
 *    Entscheidungen oben herausgerechnet, und zwar an genau einer Stelle
 *    (`gelaufen`). Warum das nötig ist, sieht man an drei Stellen, die sonst
 *    still falsch werden:
 *    — `modus`/`belegung` hängen an „hat diese Gruppe überhaupt schon einen
 *      Abend?". Ein einziger vorausgeplanter Termin holte die Gruppe aus der
 *      Einrichtung heraus und ließe die Karte „NÄCHSTER SCHRITT" zeigen, obwohl
 *      noch nie Feedback erhoben wurde.
 *    — `verlauf` ist die Historie („Noch keine VERGANGENEN Dienstabende"). Die
 *      Liste sortiert absteigend, ein Termin im Dezember stünde also ganz oben
 *      im Rückblick.
 *    — `letzteTeilnehmerzahl` liest den JÜNGSTEN Abend als Vorbelegung des
 *      Startformulars. Mit einem geplanten Abend in der Liste wäre das ein
 *      Abend in der ZUKUNFT, und der trägt nie eine Teilnehmerzahl.
 *    Ein ABGESAGTER Abend gehört in die HISTORIE, aber nicht in die Zählung.
 *    Das sind zwei verschiedene Fragen, und deshalb gibt es zwei Listen:
 *    `gelaufen` (alles, was nicht mehr bevorsteht) trägt den Verlauf — ohne den
 *    abgesagten Abend wäre die Lücke im Notenverlauf von einem vergessenen
 *    Abend nicht zu unterscheiden. `stattgefunden` (nur `held`) beantwortet
 *    „hat diese Gruppe schon einen Dienstabend gehabt?", und da ist ein
 *    abgesagter Abend genau der, der es nicht war: eine Gruppe, deren einziger
 *    Termin ausfiel, stünde sonst auf „NÄCHSTER SCHRITT", obwohl sie noch nie
 *    Feedback erhoben hat, und `letzteTeilnehmerzahl` läse eine Teilnehmerzahl
 *    aus einem Abend ohne Teilnehmer.
 */

/** Die Belegungen der Lagekarte. E ist bewusst keine — siehe `altbestand`. */
export type Belegung = "A" | "B" | "C" | "D";

/** Ein Dienstabend samt (gefalteter) Umfragelage. */
export type AbendLage = {
  evening: EveningRow;
  survey: SurveyRow | null;
  /** Effektiver Status: `active` mit verstrichener Frist gilt als `closed`. */
  effektiv: SurveyStatus | null;
  responseCount: number;
};

/** Eine Lage mit gesicherter Umfrage — nur so kommt sie in `laufend`. */
export type LaufendeLage = AbendLage & { survey: SurveyRow };

export type CockpitZustand = {
  belegung: Belegung;
  /** „einrichtung" = die Gruppe hat noch keinen Dienstabend (§2.1). */
  modus: "einrichtung" | "betrieb";
  laufend: LaufendeLage | null;
  /** Zweite, dritte aktive Umfrage — Datenfehler, aber nie ein blinder Zustand. */
  weitereAktive: LaufendeLage[];
  /** Alles außer der laufenden Umfrage, Datum absteigend. */
  verlauf: AbendLage[];
  /** Jüngster ausgewerteter Abend mit mindestens einer Rückmeldung (§2.7). */
  letzterAbend: AbendLage | null;
  /** Entwürfe aus dem Altbestand (§2.2, Belegung E). */
  altbestand: AbendLage[];
  /**
   * Vorausgeplante Abende, AUFSTEIGEND — der nächste zuerst. Als einzige Liste
   * dieses Zustands, denn sie zeigt nach vorn; alle anderen blicken zurück.
   */
  geplant: AbendLage[];
  /**
   * Der jüngste Abend, der STATTGEFUNDEN hat und nicht mehr läuft — die Antwort
   * auf „wann war diese Gruppe zuletzt zusammen?".
   *
   * ⚠️ NICHT `verlauf[0]`, und das ist der Unterschied, der die Übersicht
   * still falsch gemacht hat: `verlauf` sortiert absteigend und enthält seit
   * DRK-426 auch ABGESAGTE Abende. Wer im September einen Termin im Dezember
   * absagt, hebt ihn damit an die Spitze — die Einstiegskarte meldete „letzter
   * Abend 10.12." und sortierte die Gruppe nach einem Datum in der Zukunft.
   * Für den Verlauf gehört die Absage hinein (sie erklärt die Lücke), für
   * diese Frage ist sie genau der Abend, der nicht war.
   *
   * ⚠️ AUCH NICHT `letzterAbend`: der verlangt zusätzlich eine Rückmeldung und
   * einen geschlossenen Bogen, weil er eine NOTE trägt. Ein Abend, den niemand
   * bewertet hat, hat trotzdem stattgefunden.
   */
  letzterStattgefundener: AbendLage | null;
  /** Teilnehmerzahl des jüngsten Abends — Vorbelegung des Startformulars (§2.3). */
  letzteTeilnehmerzahl: number | null;
};

export function cockpitZustand(db: DB, groupId: number, now: Date): CockpitZustand {
  const alle: AbendLage[] = listEvenings(db, groupId)
    .map((evening) => {
      const survey = getSurveyByEvening(db, evening.id) ?? null;
      return {
        evening,
        survey,
        effektiv: survey
          ? nextStatusOnAccess(survey.status as SurveyStatus, survey.closesAt, now)
          : null,
        responseCount: survey ? listResponses(db, survey.id).length : 0,
      };
    })
    // Eigene Sortierung, obwohl `listEvenings` bereits `ORDER BY date DESC` hat:
    // die Reihenfolge ist hier fachlich tragend (jüngster Abend zuerst) und darf
    // nicht an einer Query hängen, die jemand später um einen Filter erweitert.
    .sort((a, b) => b.evening.date.getTime() - a.evening.date.getTime());

  // Aktiv UND Frist nicht verstrichen. Mehrere sind theoretisch möglich, weil
  // `setSurveyStatus` keinen Übergangs-Check hat; die jüngste Aktivierung führt.
  const aktive = alle
    .filter((x): x is LaufendeLage => x.effektiv === "active" && x.survey !== null)
    .sort((a, b) => (b.survey.activatedAt?.getTime() ?? 0) - (a.survey.activatedAt?.getTime() ?? 0));
  const laufend = aktive[0] ?? null;
  const weitereAktive = aktive.slice(1);

  // Die eine Trennlinie aus Entscheidung 5. Alles darunter rechnet mit
  // `gelaufen`, nie wieder mit `alle`.
  const gelaufen = alle.filter((x) => x.evening.status !== "planned");
  const stattgefunden = gelaufen.filter((x) => x.evening.status === "held");
  const geplant = alle
    .filter((x) => x.evening.status === "planned")
    .sort((a, b) => a.evening.date.getTime() - b.evening.date.getTime());

  const verlauf = gelaufen.filter((x) => x.evening.id !== laufend?.evening.id);
  const letzterStattgefundener = verlauf.find((x) => x.evening.status === "held") ?? null;
  const letzterAbend =
    verlauf.find(
      (x) => (x.effektiv === "closed" || x.effektiv === "archived") && x.responseCount >= 1,
    ) ?? null;
  const altbestand = verlauf.filter((x) => x.effektiv === "draft");

  // Der eine Ausdruck. Kein `else`, kein Auffangzweig, kein sechster Fall.
  const belegung: Belegung = laufend
    ? laufend.responseCount === 0
      ? "C"
      : "D"
    : stattgefunden.length === 0
      ? "A"
      : "B";

  return {
    belegung,
    modus: stattgefunden.length === 0 ? "einrichtung" : "betrieb",
    laufend,
    weitereAktive,
    verlauf,
    letzterAbend,
    altbestand,
    geplant,
    letzterStattgefundener,
    letzteTeilnehmerzahl: stattgefunden[0]?.evening.participantCount ?? null,
  };
}
