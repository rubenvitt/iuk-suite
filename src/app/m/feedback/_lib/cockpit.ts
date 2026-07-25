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

  const verlauf = alle.filter((x) => x.evening.id !== laufend?.evening.id);
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
    : alle.length === 0
      ? "A"
      : "B";

  return {
    belegung,
    modus: alle.length === 0 ? "einrichtung" : "betrieb",
    laufend,
    weitereAktive,
    verlauf,
    letzterAbend,
    altbestand,
    letzteTeilnehmerzahl: alle[0]?.evening.participantCount ?? null,
  };
}
