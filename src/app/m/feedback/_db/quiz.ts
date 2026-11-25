// LIVE-QUIZ: alle Abfragen und Schreibwege. Reine Datenbankschicht — kein Push, keine Sitzung.
// `jetzt` kommt immer als Parameter (Serverzeit des Aufrufers); `schritt_seit` und `beendet_at`
// sind Millisekunden.
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import {
  evenings,
  quizze,
  quizRunden,
  quizTeilnahmen,
  quizAntworten,
  type QuizRow,
  type QuizRundeRow,
} from "./schema";
import { abendAmTag, TagBelegt } from "./queries";
import { kalendertagInZone } from "@/app/m/feedback/_lib/lifecycle";
import { neuerBeitrittCode, neuesSecret, tokenHash } from "@/app/m/feedback/_lib/quiz/codes";
import { pruefeFragen, type QuizFrage, type QuizModus } from "@/app/m/feedback/_lib/quiz/fragen";
import { phaseMitSperre, schrittAnzahl } from "@/app/m/feedback/_lib/quiz/ablauf";
import { istRichtig, punkte } from "@/app/m/feedback/_lib/quiz/punkte";
import type { RundenDaten } from "@/app/m/feedback/_lib/quiz/sichten";
import { MAX_TEILNAHMEN_JE_RUNDE } from "@/app/m/feedback/_lib/quiz/grenzen";

type DB = BetterSQLite3Database<typeof schema>;

/** Auto-Ende: 6 h nach dem letzten Schritt (oder am Ende des Kalendertags, s. `beendeAbgelaufene`). */
const AUTO_ENDE_MS = 6 * 60 * 60 * 1000;
const CODE_VERSUCHE = 20;
const SPITZNAME_MAX = 20;
const SPITZNAME_MIN = 2;

/** Die Vorlage trägt Fragen, die `pruefeFragen` nicht besteht. `fehler` sagt, welche. */
export class QuizFragenUngueltig extends Error {
  constructor(readonly fehler: string[]) {
    super(`Ungültige Quizfragen: ${fehler.join("; ")}`);
    this.name = "QuizFragenUngueltig";
  }
}

/** Eine leere Liste ist ein Entwurf und erlaubt; starten lässt er sich nicht. */
function pruefeVorlage(fragen: QuizFrage[]): string {
  if (fragen.length > 0) {
    const p = pruefeFragen(fragen);
    if (!p.ok) throw new QuizFragenUngueltig(p.fehler);
    return JSON.stringify(p.fragen);
  }
  return "[]";
}

/** Abenddatum von heute: Mitternacht UTC des Kalendertags in der Suite-Zone. */
function heutigesAbenddatum(jetzt: Date): Date {
  return new Date(kalendertagInZone(jetzt) + "T00:00:00Z");
}

/**
 * Der Kalendertag eines Abends, so wie `abendAmTag` ihn sieht (`kalendertagInZone`). Verglichen
 * wird immer gegen `tagDesAbends(heutigesAbenddatum(jetzt))`, also dieselbe Umrechnung auf
 * beiden Seiten: so bleibt ein heute angelegter Abend (Mitternacht UTC) auch in einer Zone
 * westlich von UTC „heute", und ein importierter Abend mit Zeitanteil zählt wie überall.
 */
function tagDesAbends(datum: Date): string {
  return kalendertagInZone(datum);
}

// ── Vorlagen ────────────────────────────────────────────────────────────────

export function legeQuizAn(
  db: DB,
  v: { groupId: number; titel: string; modus: QuizModus; fragen: QuizFrage[]; jetzt: Date },
): QuizRow {
  return db
    .insert(quizze)
    .values({
      groupId: v.groupId,
      titel: v.titel,
      modus: v.modus,
      fragen: pruefeVorlage(v.fragen),
      moderationSecret: neuesSecret(),
      createdAt: v.jetzt,
      updatedAt: v.jetzt,
    })
    .returning()
    .get();
}

/** Ändert nur die Vorlage. Laufende Runden behalten ihren Schnappschuss (Review Focus 5). */
export function aendereQuiz(
  db: DB,
  id: number,
  patch: { titel?: string; modus?: QuizModus; fragen?: QuizFrage[] },
  jetzt: Date,
): QuizRow | undefined {
  const set: Partial<typeof quizze.$inferInsert> = { updatedAt: jetzt };
  if (patch.titel !== undefined) set.titel = patch.titel;
  if (patch.modus !== undefined) set.modus = patch.modus;
  if (patch.fragen !== undefined) set.fragen = pruefeVorlage(patch.fragen);
  return db.update(quizze).set(set).where(eq(quizze.id, id)).returning().get();
}

/** Neues Moderations-Secret; die alte Beamer-Adresse steuert danach nichts mehr. */
export function rotiereSecret(db: DB, id: number): string {
  const secret = neuesSecret();
  db.update(quizze).set({ moderationSecret: secret }).where(eq(quizze.id, id)).run();
  return secret;
}

export function listeQuizze(db: DB, groupId: number): QuizRow[] {
  return db.select().from(quizze).where(eq(quizze.groupId, groupId)).orderBy(asc(quizze.titel), asc(quizze.id)).all();
}

/** Für die Verwaltung: die Gruppe des Quiz kommt aus dieser Zeile, nie aus der URL (IDOR). */
export function quizPerId(db: DB, id: number): QuizRow | undefined {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  return db.select().from(quizze).where(eq(quizze.id, id)).get();
}

export function quizPerSecret(db: DB, secret: string): QuizRow | undefined {
  return db.select().from(quizze).where(eq(quizze.moderationSecret, secret)).get();
}

/** Vergangene Runden bleiben (`quiz_id` wird NULL): die Auswertung lebt vom Schnappschuss. */
export function loescheQuiz(db: DB, id: number): void {
  db.delete(quizze).where(eq(quizze.id, id)).run();
}

// ── Runden ──────────────────────────────────────────────────────────────────

function holeRunde(db: DB, rundeId: number): QuizRundeRow | undefined {
  return db.select().from(quizRunden).where(eq(quizRunden.id, rundeId)).get();
}

/** Beendet Runden: `beendet_at` setzen (nur beim ersten Mal) und alle `token_hash` löschen. */
function beende(db: DB, ids: number[], jetzt: Date): void {
  if (ids.length === 0) return;
  db.update(quizRunden)
    .set({ beendetAt: jetzt.getTime() })
    .where(and(inArray(quizRunden.id, ids), isNull(quizRunden.beendetAt)))
    .run();
  // Das Anonymitätsversprechen des Lagebilds: nach dem Ende verbindet nichts mehr Antworten
  // mit einem Gerät.
  db.update(quizTeilnahmen).set({ tokenHash: null }).where(inArray(quizTeilnahmen.rundeId, ids)).run();
}

/**
 * AUTO-ENDE ohne Hintergrunddienst: jeder Quizweg holt es nach. Eine offene Runde endet, wenn
 * der Kalendertag ihres Abends (`tagDesAbends`) vor dem heutigen liegt (Suite-Zone) oder der
 * letzte Schritt mindestens 6 h her ist — was früher kommt.
 *
 * Verlässt sich darauf, dass eine Runde nur am heutigen Abend entsteht (`starteOderHoleRunde`):
 * eine Runde an einem künftigen Abend gibt es nicht, und an einem vergangenen endet sie hier.
 */
export function beendeAbgelaufene(db: DB, jetzt: Date): number[] {
  return db.transaction((tx) => {
    const heute = tagDesAbends(heutigesAbenddatum(jetzt));
    const ids = tx
      .select({ id: quizRunden.id, schrittSeit: quizRunden.schrittSeit, datum: evenings.date })
      .from(quizRunden)
      .innerJoin(evenings, eq(evenings.id, quizRunden.eveningId))
      .where(isNull(quizRunden.beendetAt))
      .all()
      .filter((r) => tagDesAbends(r.datum) < heute || jetzt.getTime() - r.schrittSeit >= AUTO_ENDE_MS)
      .map((r) => r.id)
      .sort((a, b) => a - b);
    beende(tx, ids, jetzt);
    return ids;
  });
}

/** Ein Code, den keine offene Runde trägt. Wirft nach `CODE_VERSUCHE` Fehlgriffen. */
function freierCode(db: DB): string {
  for (let i = 0; i < CODE_VERSUCHE; i++) {
    const code = neuerBeitrittCode();
    const belegt = db
      .select({ id: quizRunden.id })
      .from(quizRunden)
      .where(and(eq(quizRunden.beitrittCode, code), isNull(quizRunden.beendetAt)))
      .get();
    if (!belegt) return code;
  }
  throw new Error("Kein freier Beitrittscode gefunden");
}

/**
 * SCHRITT 0 SENDEN = RUNDE STARTEN ODER WIEDER AUFNEHMEN, in einer Transaktion.
 *
 * Zwei Beamer-Tabs mit demselben Secret (Slidev-Präsentermodus) senden beide Schritt 0: der
 * zweite Aufruf findet die offene Runde von heute und gibt sie zurück (Review Focus 1). SQLite
 * serialisiert Schreibzugriffe, zwei gleichzeitige Aufrufe legen also nicht beide an.
 *
 * Der Abend hält die Tagesregel (`abendAmTag`, DRK-429) wie „Umfrage starten": ein geplanter
 * von heute wird übernommen und auf `held` gesetzt, ein abgesagter wirft `TagBelegt`, ein
 * gelaufener wird benutzt. Fehlt er, entsteht er auf `held`.
 */
export function starteOderHoleRunde(db: DB, quiz: QuizRow, jetzt: Date): QuizRundeRow {
  return db.transaction((tx) => {
    beendeAbgelaufene(tx, jetzt);
    const vorlage = tx.select().from(quizze).where(eq(quizze.id, quiz.id)).get();
    if (!vorlage) throw new Error(`Quiz ${quiz.id} gibt es nicht`);

    const datum = heutigesAbenddatum(jetzt);
    const heute = tagDesAbends(datum);
    const offen = tx
      .select({ runde: quizRunden, datum: evenings.date })
      .from(quizRunden)
      .innerJoin(evenings, eq(evenings.id, quizRunden.eveningId))
      .where(and(eq(quizRunden.quizId, vorlage.id), isNull(quizRunden.beendetAt)))
      .orderBy(desc(quizRunden.id))
      .all()
      .find((r) => tagDesAbends(r.datum) === heute);
    if (offen) return offen.runde;

    const pruefung = pruefeFragen(JSON.parse(vorlage.fragen));
    if (!pruefung.ok) throw new QuizFragenUngueltig(pruefung.fehler);

    let eveningId: number;
    const belegt = abendAmTag(tx, vorlage.groupId, datum);
    if (belegt?.status === "cancelled") throw new TagBelegt(belegt);
    if (belegt) {
      if (belegt.status === "planned") {
        tx.update(evenings).set({ status: "held" }).where(eq(evenings.id, belegt.id)).run();
      }
      eveningId = belegt.id;
    } else {
      eveningId = tx
        .insert(evenings)
        .values({
          groupId: vorlage.groupId,
          date: datum,
          topic: null,
          notes: null,
          participantCount: null,
          status: "held",
          createdAt: jetzt,
        })
        .returning()
        .get().id;
    }

    return tx
      .insert(quizRunden)
      .values({
        quizId: vorlage.id,
        eveningId,
        beitrittCode: freierCode(tx),
        modus: vorlage.modus,
        fragen: JSON.stringify(pruefung.fragen),
        schritt: 0,
        schrittSeit: jetzt.getTime(),
        hoechsterSchritt: 0,
        hoechsterSeit: jetzt.getTime(),
        beendetAt: null,
        createdAt: jetzt,
      })
      .returning()
      .get();
  });
}

/**
 * „GEHE ZU SCHRITT n" — absolut und idempotent. Derselbe Schritt ändert nichts, auch nicht
 * `schritt_seit` (sonst liefe die Uhr einer Frage bei jedem doppelten Klick neu an).
 *
 * ZURÜCKBLÄTTERN ÖFFNET KEINE FRAGE WIEDER: `hoechster_schritt` merkt sich den weitesten je
 * gezeigten Schritt, und Antworten nimmt eine Frage nur auf ihm an (`phaseMitSperre`). Das gilt
 * mit und ohne `zeit_s`, auch für Lobby → vor auf eine schon passierte Frage. `hoechster_seit`
 * hält fest, wann der weiteste Schritt zuerst erreicht wurde; Timer und Antwortzeit der offenen
 * Frage zählen ab dort, zurück und wieder vor verlängert also nichts.
 *
 * Eine beendete Runde bleibt, wie sie ist.
 */
export function setzeSchritt(db: DB, rundeId: number, schritt: number, jetzt: Date): QuizRundeRow {
  return db.transaction((tx) => {
    const runde = holeRunde(tx, rundeId);
    if (!runde) throw new Error(`Runde ${rundeId} gibt es nicht`);
    if (runde.beendetAt !== null) return runde;
    const fragen = JSON.parse(runde.fragen) as QuizFrage[];
    const letzter = schrittAnzahl(fragen.length, runde.modus) - 1;
    const ziel = Math.min(letzter, Math.max(0, Number.isFinite(schritt) ? Math.trunc(schritt) : 0));
    if (ziel === runde.schritt) return runde;

    return tx
      .update(quizRunden)
      .set({
        schritt: ziel,
        schrittSeit: jetzt.getTime(),
        // Nur ein NEUER weitester Schritt setzt die Uhr der offenen Frage (`phaseMitSperre`).
        ...(ziel > runde.hoechsterSchritt ? { hoechsterSchritt: ziel, hoechsterSeit: jetzt.getTime() } : {}),
      })
      .where(eq(quizRunden.id, rundeId))
      .returning()
      .get();
  });
}

/**
 * DIE RUNDE, DIE DER BEAMER HEUTE ZEIGT: die jüngste Runde dieses Quiz am heutigen Abend, offen
 * oder schon beendet (dann steht auf dem Beamer „beendet", und der nächste Klick legt eine neue
 * an, §5.3). Eine offene ist immer die jüngste, denn eine neue entsteht nur ohne offene
 * (`starteOderHoleRunde`). Reiner Lesezugriff: das Auto-Ende holt der Aufrufer nach.
 */
export function heutigeRunde(db: DB, quizId: number, jetzt: Date): QuizRundeRow | undefined {
  const heute = tagDesAbends(heutigesAbenddatum(jetzt));
  return db
    .select({ runde: quizRunden, datum: evenings.date })
    .from(quizRunden)
    .innerJoin(evenings, eq(evenings.id, quizRunden.eveningId))
    .where(eq(quizRunden.quizId, quizId))
    .orderBy(desc(quizRunden.id))
    .all()
    .find((r) => tagDesAbends(r.datum) === heute)?.runde;
}

/** Endgültig: `beendet_at`, alle `token_hash` NULL, der Beitrittscode gilt nicht mehr. */
export function beendeRunde(db: DB, rundeId: number, jetzt: Date): void {
  db.transaction((tx) => beende(tx, [rundeId], jetzt));
}

/** Die offene Runde zu einem Beitrittscode (Groß-/Kleinschreibung egal), nach dem Auto-Ende. */
export function offeneRundePerCode(db: DB, code: string, jetzt: Date): QuizRundeRow | undefined {
  beendeAbgelaufene(db, jetzt);
  return db
    .select()
    .from(quizRunden)
    .where(and(eq(quizRunden.beitrittCode, code.trim().toUpperCase()), isNull(quizRunden.beendetAt)))
    .get();
}

/**
 * Die Teilnahme zum Cookie-Wert in DIESER Runde, sonst `null`. Nach dem Ende ist `token_hash`
 * NULL, ein altes Cookie findet dann nichts mehr.
 */
export function teilnahmePerToken(db: DB, rundeId: number, token: string): number | null {
  const t = db
    .select({ id: quizTeilnahmen.id })
    .from(quizTeilnahmen)
    .where(and(eq(quizTeilnahmen.rundeId, rundeId), eq(quizTeilnahmen.tokenHash, tokenHash(token))))
    .get();
  return t?.id ?? null;
}

// ── Teilnahme und Antworten ─────────────────────────────────────────────────

/** Getrimmt, auf 20 Zeichen (Codepunkte) gekürzt; `null`, wenn kürzer als 2. */
function saubererSpitzname(roh: string | null): string | null {
  const name = Array.from((roh ?? "").trim()).slice(0, SPITZNAME_MAX).join("").trim();
  return Array.from(name).length >= SPITZNAME_MIN ? name : null;
}

/**
 * BEITRITT. Ein schon bekanntes Token bekommt seine Teilnahme zurück — ein Handy, das kurz das
 * WLAN verliert oder neu lädt, tritt nicht ein zweites Mal bei (Review Focus 2). Ein später
 * Beitritt geht jederzeit, solange die Runde läuft; verpasste Fragen haben keine Antwort und
 * damit 0 Punkte (Review Focus 3).
 *
 * Im Lagebild wird der Spitzname verworfen (Anonymität). Im Wettbewerb ist er Pflicht und in
 * der Runde eindeutig, ohne Rücksicht auf Groß-/Kleinschreibung („Max" und „max" sähe auf der
 * Leinwand niemand auseinander).
 */
export function tritteBei(
  db: DB,
  runde: QuizRundeRow,
  v: { token: string; spitzname: string | null },
): { teilnahmeId: number } | { fehler: "spitzname_fehlt" | "spitzname_vergeben" | "beendet" | "voll" } {
  return db.transaction((tx) => {
    const aktuell = holeRunde(tx, runde.id);
    if (!aktuell || aktuell.beendetAt !== null) return { fehler: "beendet" as const };
    const hash = tokenHash(v.token);
    const vorhanden = tx
      .select({ id: quizTeilnahmen.id })
      .from(quizTeilnahmen)
      .where(and(eq(quizTeilnahmen.rundeId, aktuell.id), eq(quizTeilnahmen.tokenHash, hash)))
      .get();
    if (vorhanden) return { teilnahmeId: vorhanden.id };
    const anzahl = tx.select({ id: quizTeilnahmen.id }).from(quizTeilnahmen).where(eq(quizTeilnahmen.rundeId, aktuell.id)).all().length;
    if (anzahl >= MAX_TEILNAHMEN_JE_RUNDE) return { fehler: "voll" as const };

    let spitzname: string | null = null;
    if (aktuell.modus === "wettbewerb") {
      spitzname = saubererSpitzname(v.spitzname);
      if (spitzname === null) return { fehler: "spitzname_fehlt" as const };
      const klein = spitzname.toLocaleLowerCase("de");
      const vergeben = tx
        .select({ spitzname: quizTeilnahmen.spitzname })
        .from(quizTeilnahmen)
        .where(eq(quizTeilnahmen.rundeId, aktuell.id))
        .all()
        .some((t) => t.spitzname?.toLocaleLowerCase("de") === klein);
      if (vergeben) return { fehler: "spitzname_vergeben" as const };
    }
    const neu = tx
      .insert(quizTeilnahmen)
      .values({ rundeId: aktuell.id, spitzname, tokenHash: hash })
      .returning({ id: quizTeilnahmen.id })
      .get();
    return { teilnahmeId: neu.id };
  });
}

function gueltigeAuswahl(frage: QuizFrage, gewaehlt: unknown): gewaehlt is number[] {
  if (!Array.isArray(gewaehlt) || gewaehlt.length === 0) return false;
  if (!gewaehlt.every((i) => Number.isInteger(i) && i >= 0 && i < frage.optionen.length)) return false;
  if (new Set(gewaehlt).size !== gewaehlt.length) return false;
  return frage.typ === "mehrfach" || gewaehlt.length === 1;
}

/**
 * EINE ANTWORT, ENDGÜLTIG. Angenommen nur, solange genau diese Frage offen ist — maßgeblich ist
 * die Serverzeit `jetzt`, nicht die des Handys. Eine Antwort, die nach Ablauf von `zeit_s`
 * ankommt, ist `"geschlossen"` (Review Focus 4), ebenso jede in einer beendeten Runde.
 *
 * Die Antwortzeit zählt nur im Wettbewerb und wird auf ≥ 0 geklemmt; im Lagebild bleibt sie
 * NULL (Anonymität: keine Zeitstempel je Person).
 */
export function antworte(
  db: DB,
  runde: QuizRundeRow,
  teilnahmeId: number,
  frageIndex: number,
  gewaehlt: number[],
  jetzt: Date,
): "ok" | "geschlossen" | "doppelt" | "ungueltig" {
  return db.transaction((tx) => {
    const aktuell = holeRunde(tx, runde.id);
    if (!aktuell) return "ungueltig";
    const teilnahme = tx
      .select({ id: quizTeilnahmen.id })
      .from(quizTeilnahmen)
      .where(and(eq(quizTeilnahmen.id, teilnahmeId), eq(quizTeilnahmen.rundeId, aktuell.id)))
      .get();
    const fragen = JSON.parse(aktuell.fragen) as QuizFrage[];
    if (!teilnahme || !Number.isInteger(frageIndex) || frageIndex < 0 || frageIndex >= fragen.length) {
      return "ungueltig";
    }
    if (aktuell.beendetAt !== null) return "geschlossen";
    const phase = phaseMitSperre(aktuell, fragen, aktuell.modus, jetzt.getTime());
    if (phase.art !== "frage" || phase.index !== frageIndex || !phase.offen) return "geschlossen";

    const frage = fragen[frageIndex];
    if (!gueltigeAuswahl(frage, gewaehlt)) return "ungueltig";
    const schon = tx
      .select({ id: quizAntworten.teilnahmeId })
      .from(quizAntworten)
      .where(and(eq(quizAntworten.teilnahmeId, teilnahme.id), eq(quizAntworten.frageIndex, frageIndex)))
      .get();
    if (schon) return "doppelt";

    const antwortzeitMs =
      // Ab dem ersten Zeigen der Frage (`hoechster_seit`): offen ist sie nur auf dem weitesten Schritt.
      aktuell.modus === "wettbewerb" ? Math.max(0, jetzt.getTime() - aktuell.hoechsterSeit) : null;
    const p = punkte(frage, gewaehlt, antwortzeitMs);
    tx.insert(quizAntworten)
      .values({
        teilnahmeId: teilnahme.id,
        frageIndex,
        antwort: JSON.stringify([...gewaehlt].sort((a, b) => a - b)),
        richtig: istRichtig(frage, gewaehlt) ? 1 : 0,
        punkte: p,
        antwortzeitMs,
      })
      .run();
    return "ok";
  });
}

/** In einer Transaktion gelesen: Runde, Teilnahmen und Antworten passen zueinander. */
export function rundenDaten(db: DB, rundeId: number): RundenDaten {
  return db.transaction((tx) => leseRundenDaten(tx, rundeId));
}

/** Alle Runden eines Abends, älteste zuerst (Auswertung, Cockpit-Verweis). */
export function rundenDesAbends(db: DB, eveningId: number): QuizRundeRow[] {
  return db
    .select()
    .from(quizRunden)
    .where(eq(quizRunden.eveningId, eveningId))
    .orderBy(asc(quizRunden.createdAt), asc(quizRunden.id))
    .all();
}

/** Ohne Vorlage (gelöscht) zeigt die Runde diesen Titel; ihr Schnappschuss lebt weiter. */
const ERSATZTITEL = "Quiz";

/**
 * Daten und Titel einer Runde in einer Transaktion, `null` für eine Runde, die es nicht (mehr)
 * gibt — der Strom endet dann, statt zu werfen. Quelle des Stands in `_lib/quiz/stand.ts`.
 */
export function rundenStand(db: DB, rundeId: number): { daten: RundenDaten; titel: string } | null {
  return db.transaction((tx) => {
    const runde = holeRunde(tx, rundeId);
    if (!runde) return null;
    const titel =
      runde.quizId === null
        ? undefined
        : tx.select({ titel: quizze.titel }).from(quizze).where(eq(quizze.id, runde.quizId)).get()?.titel;
    return { daten: leseRundenDaten(tx, rundeId), titel: titel ?? ERSATZTITEL };
  });
}

function leseRundenDaten(db: DB, rundeId: number): RundenDaten {
  const runde = holeRunde(db, rundeId);
  if (!runde) throw new Error(`Runde ${rundeId} gibt es nicht`);
  const teilnahmen = db
    .select()
    .from(quizTeilnahmen)
    .where(eq(quizTeilnahmen.rundeId, rundeId))
    .orderBy(asc(quizTeilnahmen.id))
    .all();
  const antworten = db
    .select({ a: quizAntworten })
    .from(quizAntworten)
    .innerJoin(quizTeilnahmen, eq(quizTeilnahmen.id, quizAntworten.teilnahmeId))
    .where(eq(quizTeilnahmen.rundeId, rundeId))
    .orderBy(asc(quizAntworten.teilnahmeId), asc(quizAntworten.frageIndex))
    .all()
    .map((r) => r.a);
  return { runde, teilnahmen, antworten };
}
