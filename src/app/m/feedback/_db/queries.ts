import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import {
  groups,
  evenings,
  surveys,
  responses,
  userGroups,
  knownUsers,
  type GroupRow,
  type EveningRow,
  type SurveyRow,
  type ResponseRow,
} from "./schema";
import {
  computeClosesAt,
  kalendertagInZone,
  type EveningStatus,
  type SurveyStatus,
} from "@/app/m/feedback/_lib/lifecycle";
import { STANDARD_QUESTIONS } from "@/app/m/feedback/_lib/questions";

type DB = BetterSQLite3Database<typeof schema>;

/**
 * DIE Sicherheitsgrenze, keine Abfrage: speist `assertGroupAccess`. Vereinigung
 * aus zwei Quellen, absichtlich in dieser Reihenfolge gedacht:
 *
 * 1. `user_groups` — im Werkzeug gepflegte Zuordnung.
 * 2. `fachgruppenSlugs` — das Attribut aus Pocket ID (signiertes ID-Token),
 *    exakter Abgleich gegen `groups.slug`.
 *
 * Der dritte Parameter ist mit Absicht PFLICHT und hat keinen Vorgabewert: ein
 * `[]`-Default würde das sicherheitsrelevante Argument an jeder Aufrufstelle
 * still weglassbar machen — aus einem Übersetzungsfehler würde eine Lücke.
 *
 * Eine leere Slug-Liste degradiert auf `user_groups` allein — NIEMALS auf „alle
 * Gruppen". Deshalb der frühe Ausstieg: kein Codepfad, auf dem eine leere Liste
 * in ein `IN ()` läuft. Verglichen wird exakt und Groß-/Kleinschreibung
 * beachtend (SQLite-TEXT ohne COLLATE NOCASE, kein LIKE, kein lower()).
 */
export function memberGroupIdsFor(db: DB, sub: string, fachgruppenSlugs: string[]): number[] {
  const assigned = db
    .select({ groupId: userGroups.groupId })
    .from(userGroups)
    .where(eq(userGroups.userId, sub))
    .all()
    .map((r) => r.groupId);
  if (fachgruppenSlugs.length === 0) return [...new Set(assigned)];
  const fromClaim = db
    .select({ id: groups.id })
    .from(groups)
    .where(inArray(groups.slug, fachgruppenSlugs))
    .all()
    .map((r) => r.id);
  // Set, nicht Concat: dieselbe Gruppe kann aus BEIDEN Quellen kommen, und
  // Duplikate schlagen später als doppelte Zeilen in Listen durch.
  return [...new Set([...assigned, ...fromClaim])];
}
// onConflictDoNothing: (userId, groupId) ist Primary Key — ein erneuter Seed-
// Lauf darf nicht auf einer bereits vorhandenen Zuordnung scheitern.
export function insertUserGroup(db: DB, userId: string, groupId: number): void {
  db.insert(userGroups).values({ userId, groupId }).onConflictDoNothing().run();
}

/**
 * ERSETZT die Zuordnung einer Gruppe vollständig — Entfernen muss genauso
 * funktionieren wie Hinzufügen, sonst wäre eine Fehlzuordnung nur noch per
 * Datenbankzugriff korrigierbar. Das `delete` ist auf `groupId` eingegrenzt;
 * andere Gruppen bleiben unberührt. Beides in einer Transaktion, damit kein
 * Zwischenzustand ohne Zuordnung sichtbar wird.
 */
export function setGroupMembers(db: DB, groupId: number, userIds: string[]): void {
  db.transaction((tx) => {
    tx.delete(userGroups).where(eq(userGroups.groupId, groupId)).run();
    const unique = [...new Set(userIds)];
    if (unique.length > 0) {
      tx.insert(userGroups)
        .values(unique.map((userId) => ({ userId, groupId })))
        .run();
    }
  });
}

// Idempotent auf `user_id` (Primärschlüssel): jeder Besuch aktualisiert Name,
// E-Mail und `seen_at`, legt aber keinen zweiten Datensatz an.
export function upsertKnownUser(
  db: DB,
  u: { userId: string; name: string | null; email: string | null; seenAt: Date },
): void {
  db.insert(knownUsers)
    .values(u)
    .onConflictDoUpdate({
      target: knownUsers.userId,
      set: { name: u.name, email: u.email, seenAt: u.seenAt },
    })
    .run();
}

// Ohne `seenAt`: die Zuordnungs-Oberfläche braucht eine Namensliste, kein
// Anwesenheitsprotokoll.
export function listKnownUsers(
  db: DB,
): Array<{ userId: string; name: string | null; email: string | null }> {
  return db
    .select({ userId: knownUsers.userId, name: knownUsers.name, email: knownUsers.email })
    .from(knownUsers)
    .all();
}

/**
 * DIE GEGENRICHTUNG zu `memberGroupIdsFor` — und der Grund, warum sie existieren
 * muss: `setGroupMembers` ERSETZT die Liste. Die Zuordnungs-Oberfläche darf die
 * gewünschte Liste deshalb nicht vom Client geschickt bekommen (ein manipulierter
 * Formularwert würde die ganze Leitung einer Gruppe austauschen). Sie liest den
 * Ist-Stand hier serverseitig und rechnet eine Kennung dazu bzw. weg.
 *
 * Ausschließlich `user_groups`: der `fachgruppen`-Claim aus Pocket ID ist im
 * Werkzeug nicht editierbar und darf hier nicht als „zugeordnet" auftauchen,
 * sonst zeigte die Tabelle Zeilen mit einem Entfernen-Knopf, der nichts tut.
 */
export function listGroupMembers(db: DB, groupId: number): string[] {
  return db
    .select({ userId: userGroups.userId })
    .from(userGroups)
    .where(eq(userGroups.groupId, groupId))
    .all()
    .map((r) => r.userId);
}

export function listGroups(db: DB): GroupRow[] {
  return db.select().from(groups).all();
}
export function getGroup(db: DB, id: number): GroupRow | undefined {
  return db.select().from(groups).where(eq(groups.id, id)).get();
}
export function getGroupBySlug(db: DB, slug: string): GroupRow | undefined {
  return db.select().from(groups).where(eq(groups.slug, slug)).get();
}
export function insertGroup(
  db: DB,
  v: { name: string; slug: string; secret: string; closeAfterHours: number | null; createdAt: Date },
): GroupRow {
  return db.insert(groups).values(v).returning().get();
}
export function updateGroup(
  db: DB,
  id: number,
  patch: Partial<{ name: string; slug: string; closeAfterHours: number | null }>,
): void {
  db.update(groups).set(patch).where(eq(groups.id, id)).run();
}
export function setGroupSecret(db: DB, id: number, secret: string): void {
  db.update(groups).set({ secret }).where(eq(groups.id, id)).run();
}
export function deleteGroup(db: DB, id: number): void {
  db.delete(groups).where(eq(groups.id, id)).run();
}

/**
 * Neuester Abend zuerst. Ohne `ORDER BY` war die Ordnung die Einfüge-/Rowid-
 * Reihenfolge: ein NACHGETRAGENER älterer Abend landete still am falschen Ende,
 * und jeder Aufrufer, der sich auf die Abfrage verlässt, zeigte eine falsch
 * sortierte Tabelle ohne Fehlermeldung.
 */
export function listEvenings(db: DB, groupId: number): EveningRow[] {
  return db
    .select()
    .from(evenings)
    .where(eq(evenings.groupId, groupId))
    .orderBy(desc(evenings.date))
    .all();
}
export function getEvening(db: DB, id: number): EveningRow | undefined {
  return db.select().from(evenings).where(eq(evenings.id, id)).get();
}
export function insertEvening(
  db: DB,
  v: { groupId: number; date: Date; topic: string | null; notes: string | null; participantCount: number | null; createdAt: Date; status?: EveningStatus },
): EveningRow {
  return db.insert(evenings).values(v).returning().get();
}
export function setEveningStatus(db: DB, id: number, status: EveningStatus): void {
  db.update(evenings).set({ status }).where(eq(evenings.id, id)).run();
}

/**
 * EINE SERIE IN EINER TRANSAKTION — und sie überspringt, was schon dasteht.
 *
 * Die Termine rechnet `_lib/serie.ts` aus; hier kommt die fertige Liste an. Zwei
 * Dinge entscheidet diese Funktion, und beide nur hier:
 *
 * 1. **Ein Datum, an dem die Gruppe schon einen Abend hat, wird ausgelassen.**
 *    Eine Jahresplanung wird zweimal abgeschickt (der Browser lädt neu, jemand
 *    plant im Februar nach) — ohne diese Regel stünde jeder Abend doppelt im
 *    Verlauf, und zwei Auswertungen desselben Dienstabends sind nicht wieder
 *    zusammenzuführen. Übersprungen wird auch ein bereits GELAUFENER Abend:
 *    dass an jenem Tag schon Feedback erhoben wurde, ist der stärkere Befund.
 *
 *    ⚠️ VERGLICHEN WIRD DER KALENDERTAG IN `Europe/Berlin`, nicht der
 *    Zeitstempel und nicht der UTC-Tag — beides gemessen, nicht
 *    vorsichtshalber. `evenings.date` SOLL Mitternacht UTC tragen, aber der
 *    IMPORT erzwingt das nicht: `toNewEvening` (`scripts/import/feedback.ts`)
 *    reicht den Alt-Zeitstempel durch, und die Fixture in
 *    `scripts/import/feedback.test.ts` führt so einen Abend
 *    (`2026-04-16 09:24:31`). Mit `getTime()` verglichen, hätte ein geplanter
 *    Termin desselben Tages ihn nicht getroffen. Und mit dem UTC-Tag
 *    verglichen, fiele ein Abend aus der frühen Nacht auseinander:
 *    `2026-04-16 00:30 +0200` steht als `2026-04-15T22:30Z` in der Datenbank —
 *    in UTC der 15., auf jedem Bildschirm der Suite der 16. Die Entdopplung
 *    liefe dann gegen einen Tag, den niemand sieht. `kalendertagInZone`
 *    (`_lib/lifecycle.ts`) ist dieselbe Umrechnung, die auch die Vorschau im
 *    Planungsdialog benutzt.
 * 2. **Alles oder nichts.** Eine halb angelegte Serie wäre schlimmer als keine —
 *    niemand sieht einer Liste an, wo sie abgebrochen ist.
 *
 * `uebersprungen` kommt zurück, damit ein Aufrufer die Auslassung ÜBERHAUPT
 * bemerken kann — heute liest es der Test, der sie festhält. Die OBERFLÄCHE
 * braucht es nicht: sie rechnet dieselbe Liste vor dem Absenden mit
 * `serienTermine` aus und zeigt die belegten Tage dort an (`_ui/KommendeAbende.tsx`,
 * `PlanenDialog`). Eine Meldung hinterher wäre die schlechtere Auskunft.
 */
export function planEvenings(
  db: DB,
  input: { groupId: number; dates: Date[]; topic: string | null; now: Date },
): { angelegt: EveningRow[]; uebersprungen: number } {
  return db.transaction((tx) => {
    const belegt = new Set(
      tx
        .select({ date: evenings.date })
        .from(evenings)
        .where(eq(evenings.groupId, input.groupId))
        .all()
        .map((r) => kalendertagInZone(r.date)),
    );
    const angelegt: EveningRow[] = [];
    let uebersprungen = 0;
    for (const date of input.dates) {
      const tag = kalendertagInZone(date);
      if (belegt.has(tag)) {
        uebersprungen += 1;
        continue;
      }
      // Innerhalb EINES Aufrufs doppelte Termine zählen ebenso: `serienTermine`
      // liefert keine, aber diese Funktion verlässt sich nicht darauf.
      belegt.add(tag);
      angelegt.push(
        tx
          .insert(evenings)
          .values({
            groupId: input.groupId,
            date,
            topic: input.topic,
            notes: null,
            participantCount: null,
            status: "planned",
            createdAt: input.now,
          })
          .returning()
          .get(),
      );
    }
    return { angelegt, uebersprungen };
  });
}
export function updateEvening(
  db: DB,
  id: number,
  patch: Partial<{ date: Date; topic: string | null; notes: string | null; participantCount: number | null; status: EveningStatus }>,
): void {
  db.update(evenings).set(patch).where(eq(evenings.id, id)).run();
}
export function deleteEvening(db: DB, id: number): void {
  db.delete(evenings).where(eq(evenings.id, id)).run();
}

export function getSurveyByEvening(db: DB, eveningId: number): SurveyRow | undefined {
  return db.select().from(surveys).where(eq(surveys.eveningId, eveningId)).get();
}
export function getSurvey(db: DB, id: number): SurveyRow | undefined {
  return db.select().from(surveys).where(eq(surveys.id, id)).get();
}
export function insertSurvey(
  db: DB,
  v: { eveningId: number; questions: string; closeAfterHours: number | null; createdAt: Date },
): SurveyRow {
  return db.insert(surveys).values({ ...v, status: "draft" }).returning().get();
}
export function setSurveyStatus(
  db: DB,
  id: number,
  status: SurveyStatus,
  patch: Partial<{ activatedAt: Date | null; closesAt: Date | null; closedAt: Date | null }> = {},
): void {
  db.update(surveys).set({ status, ...patch }).where(eq(surveys.id, id)).run();
}

/**
 * DIE INVARIANTE „HÖCHSTENS EINE AKTIVE UMFRAGE JE GRUPPE" — an EINER Stelle.
 *
 * Sie ist nicht verhandelbar, und der Grund steht nicht in der Datenbank,
 * sondern auf dem Papier: der öffentliche Zugang hängt an der GRUPPE
 * (`/f/{slug}-{secret}`), nicht am Abend. `activeSurveyForGroup` löst ihn per
 * `.get()` auf — bei zwei aktiven Umfragen liefert das stumm eine beliebige,
 * und der gedruckte QR-Code im Gerätehaus zeigte auf die falsche Erhebung.
 *
 * ⚠️ EIN DATENBANKSEITIGER RIEGEL IST NICHT MÖGLICH: `surveys` trägt kein
 * `group_id`, der Gruppenbezug hängt an `evenings`. Die Invariante lebt deshalb
 * in Code — und damit in GENAU DIESER Funktion. Vorher stand ihr Rezept in zwei
 * Fassungen nebeneinander (einmal als Schleife, einmal als `inArray`), und die
 * dritte Aufrufstelle („einen geplanten Abend freigeben") hätte eine vierte
 * daraus gemacht. Wer sie nachbaut, hat sie zweimal — und die zweite ist die
 * ungetestete.
 *
 * `ausser` nimmt die Umfrage aus, die gerade aktiv WERDEN soll; beim Anlegen
 * einer neuen gibt es sie noch nicht, dort steht `null`.
 */
function schliesseAktiveDerGruppe(
  tx: DB,
  groupId: number,
  now: Date,
  ausser: number | null,
): void {
  const groupEveningIds = tx
    .select({ id: evenings.id })
    .from(evenings)
    .where(eq(evenings.groupId, groupId))
    .all()
    .map((r) => r.id);
  // Ohne diesen Ausstieg liefe ein leeres `IN ()` in die Abfrage.
  if (groupEveningIds.length === 0) return;
  tx.update(surveys)
    .set({ status: "closed", closedAt: now })
    .where(
      and(
        eq(surveys.status, "active"),
        inArray(surveys.eveningId, groupEveningIds),
        ...(ausser === null ? [] : [ne(surveys.id, ausser)]),
      ),
    )
    .run();
}

/**
 * Aktiviert eine Umfrage und schließt in derselben Transaktion alle anderen
 * aktiven Umfragen derselben Gruppe (Invariante „max. 1 aktiv pro Gruppe",
 * store.go:99-108 der Alt-Anwendung). Gruppenbezug via evening.group_id.
 */
export function activateSurvey(db: DB, surveyId: number, closesAt: Date, now: Date): void {
  db.transaction((tx) => {
    const target = tx.select().from(surveys).where(eq(surveys.id, surveyId)).get();
    if (!target) throw new Error("survey not found");
    const eve = tx.select().from(evenings).where(eq(evenings.id, target.eveningId)).get();
    if (!eve) throw new Error("evening not found");
    schliesseAktiveDerGruppe(tx, eve.groupId, now, surveyId);
    tx.update(surveys)
      .set({ status: "active", activatedAt: now, closesAt, closedAt: null })
      .where(eq(surveys.id, surveyId))
      .run();
  });
}

/**
 * EINEN GEPLANTEN ABEND FREIGEBEN — der dritte Weg in denselben Zustand.
 *
 * Er unterscheidet sich von `createAndStartSurvey` nur darin, dass der Abend
 * schon dasteht, und von `activateSurvey` darin, dass die Umfrage noch nicht
 * existiert. Beides wird hier erledigt, und zwar in EINER Transaktion: ein
 * Abend, der auf `held` steht, aber keine Umfrage bekommen hat, wäre von einem
 * nachgetragenen Abend nicht mehr zu unterscheiden.
 *
 * Die Frist ankert am ABENDDATUM (`computeClosesAt`), nicht am Klick — genau
 * wie überall sonst. Bei einem vorab geplanten Abend ist das der ganze Punkt:
 * freigegeben wird um 19:30, geschlossen wird nach dem Abend.
 *
 * Trägt der Abend wider Erwarten schon eine Umfrage (Altbestands-Entwurf an
 * einem von Hand auf `planned` gesetzten Abend), wird SIE aktiviert statt einer
 * zweiten — `idx_surveys_evening` ist UNIQUE, ein blindes `insert` wäre ein
 * Laufzeitfehler mitten in der Freigabe.
 */
export function releaseSurveyForEvening(
  db: DB,
  input: { eveningId: number; closeAfterHours: number; now: Date },
): SurveyRow {
  return db.transaction((tx) => {
    const eve = tx.select().from(evenings).where(eq(evenings.id, input.eveningId)).get();
    if (!eve) throw new Error("evening not found");
    const vorhanden = tx.select().from(surveys).where(eq(surveys.eveningId, eve.id)).get();
    const closesAt = computeClosesAt(eve.date, input.closeAfterHours);

    // Reihenfolge wie in `createAndStartSurvey`: erst die Geschwister schließen.
    schliesseAktiveDerGruppe(tx, eve.groupId, input.now, vorhanden?.id ?? null);

    const survey = vorhanden
      ? tx
          .update(surveys)
          .set({ status: "active", activatedAt: input.now, closesAt, closedAt: null })
          .where(eq(surveys.id, vorhanden.id))
          .returning()
          .get()
      : tx
          .insert(surveys)
          .values({
            eveningId: eve.id,
            status: "active",
            questions: JSON.stringify(STANDARD_QUESTIONS),
            closeAfterHours: input.closeAfterHours,
            activatedAt: input.now,
            closesAt,
            closedAt: null,
            createdAt: input.now,
          })
          .returning()
          .get();

    tx.update(evenings).set({ status: "held" }).where(eq(evenings.id, eve.id)).run();
    return survey;
  });
}

/**
 * Anlegen IST Starten: Abend und aktive Umfrage entstehen in EINER Transaktion.
 * Schließt dabei alle aktiven Umfragen derselben Gruppe — die Invariante und
 * ihre Begründung stehen bei `schliesseAktiveDerGruppe`, nicht hier und nicht
 * ein zweites Mal.
 *
 * Der Abend entsteht auf `held`: „Feedback starten" heißt, dass der Dienstabend
 * JETZT läuft. Ein im Voraus angesetzter Abend kommt über `planEvenings`.
 */
export function createAndStartSurvey(
  db: DB,
  input: {
    groupId: number;
    date: Date;
    topic: string | null;
    notes: string | null;
    participants: number | null;
    closeAfterHours: number;
    now: Date;
  },
): { eveningId: number; surveyId: number } {
  return db.transaction((tx) => {
    const eve = tx
      .insert(evenings)
      .values({
        groupId: input.groupId,
        date: input.date,
        topic: input.topic,
        notes: input.notes,
        participantCount: input.participants,
        status: "held",
        createdAt: input.now,
      })
      .returning()
      .get();
    // Reihenfolge ist tragend: erst die Geschwister schließen, dann die neue
    // Umfrage einfügen — sonst schließt dieser Schritt sie gleich mit.
    // Nur `active` wird angefasst; `draft`/`archived` aus dem Altbestand bleiben.
    schliesseAktiveDerGruppe(tx, input.groupId, input.now, null);
    const survey = tx
      .insert(surveys)
      .values({
        eveningId: eve.id,
        status: "active",
        questions: JSON.stringify(STANDARD_QUESTIONS),
        closeAfterHours: input.closeAfterHours,
        activatedAt: input.now,
        closesAt: computeClosesAt(input.date, input.closeAfterHours),
        closedAt: null,
        createdAt: input.now,
      })
      .returning()
      .get();
    return { eveningId: eve.id, surveyId: survey.id };
  });
}

/**
 * DIE JÜNGSTE UMFRAGE DER GRUPPE — der Abend, an dem zuletzt erhoben wurde.
 *
 * ⚠️ NICHT „der jüngste Abend, und dann dessen Umfrage". Genau so stand es im
 * öffentlichen Pfad, und seit es vorausgeplante Abende gibt, war es falsch: der
 * jüngste Abend einer Gruppe liegt dann in der ZUKUNFT und trägt keine
 * Umfrage. Der Teilnehmer, der eben auf einen gerade abgelaufenen Bogen
 * abgesendet hat, bekam dadurch „Zurzeit läuft keine Umfrage" statt des
 * beendeten Bogens, den er in der Hand hatte — die stille Wirkung, gegen die
 * jener Weg gebaut ist.
 *
 * Der JOIN erledigt beides in einem Zug und ist zugleich gegen den abgesagten
 * Abend robust, der ebenfalls nie eine Umfrage trägt: gefragt ist nicht „welcher
 * Status?", sondern „wo wurde zuletzt erhoben?".
 *
 * ⚠️ ZWEITES SORTIERKRITERIUM, WEIL DAS ERSTE NICHT EINDEUTIG IST. Zwei Abende
 * am selben Tag sind selten, aber möglich: `planEvenings` entdoppelt nur den
 * Planungsweg, `createAndStartSurvey` prüft den Tag überhaupt nicht. Ohne
 * `surveys.id` läge die Entscheidung, welcher der beiden Bögen dem Teilnehmer
 * gezeigt wird, bei der Zeilenreihenfolge von SQLite — stumm und von Lauf zu
 * Lauf verschieden. Die jüngere Umfrage gewinnt; das ist dieselbe Regel, nach
 * der das Cockpit bei mehreren aktiven die jüngste Aktivierung führt.
 */
export function latestSurveyForGroup(
  db: DB,
  groupId: number,
): { survey: SurveyRow; evening: EveningRow } | undefined {
  return (
    db
      .select({ survey: surveys, evening: evenings })
      .from(surveys)
      .innerJoin(evenings, eq(surveys.eveningId, evenings.id))
      .where(eq(evenings.groupId, groupId))
      .orderBy(desc(evenings.date), desc(surveys.id))
      .get() ?? undefined
  );
}

export function activeSurveyForGroup(
  db: DB,
  groupId: number,
): { survey: SurveyRow; evening: EveningRow } | undefined {
  const rows = db
    .select({ survey: surveys, evening: evenings })
    .from(surveys)
    .innerJoin(evenings, eq(surveys.eveningId, evenings.id))
    .where(and(eq(evenings.groupId, groupId), eq(surveys.status, "active")))
    .get();
  return rows ?? undefined;
}

/**
 * Bewusst ohne `ORDER BY`: die Ausgabeordnung ist keine Zusage dieser Funktion.
 * Wer Antworten Menschen zeigt (Auswertung, CSV-Export), mischt sie über
 * `shuffleStable` (aggregation.ts) durch — Entwurf 3.9.
 */
export function listResponses(db: DB, surveyId: number): ResponseRow[] {
  return db.select().from(responses).where(eq(responses.surveyId, surveyId)).all();
}
/**
 * `at` ist NICHT der Abgabezeitpunkt: der öffentliche Pfad übergibt Mitternacht
 * UTC des Abenddatums, damit die Zeile keine Uhrzeit trägt (Entwurf 3.9,
 * Siegeltext "keine Uhrzeit"). Die Rundung bleibt beim Aufrufer, weil der
 * Import (scripts/import/feedback.ts) die sekundengenauen Alt-Zeitstempel
 * unverändert behalten muss (Parität).
 */
export function insertResponse(
  db: DB,
  surveyId: number,
  answers: Record<string, unknown>,
  at: Date,
): void {
  db.insert(responses).values({ surveyId, answers: JSON.stringify(answers), submittedAt: at }).run();
}
