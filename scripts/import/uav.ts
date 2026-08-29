/**
 * Import uav-praxis (Alt-SQLite) -> Suite-Modul `uav`.
 *
 * Aufruf: tsx scripts/import/uav.ts <pfad-zur-alt-app.db>   (DATA_DIR steuert das Ziel)
 *
 * Muster wie scripts/import/radio.ts: `lieseQuelle` liest die Quelltabellen namentlich,
 * `importUav` schreibt sie idempotent (Upsert per PK), `paritaetUav` vergleicht
 * Vollzeilen je Tabelle über scripts/import/parity.ts, `schreibeUndPruefe` bündelt
 * beides testbar (nimmt ein fertiges `UavDb`, nicht `getModuleDb()`), und
 * `runUavImport` verdrahtet CLI/`migrateAllModules()`/`getDb()` außenherum.
 */

import Database from "better-sqlite3";
import * as schema from "@/app/m/uav/_db/schema";
import { getDb } from "@/app/m/uav/_db/client";
import type { UavDb } from "@/app/m/uav/_db/client";
import { migrateAllModules } from "@/core/bootstrap";
import { checkParity, assertParity, type ParityReport } from "./parity";

// ── Quellzeilen (Alt-Schema, wörtlich aus scripts/import/fixtures/uav-alt-schema.sql) ──
//
// ⚠️ Feldnamen sind die SQL-Spaltennamen der Quelle (snake_case), nicht die camelCase-
// Namen des Ziels — wie in radio.ts begründet: jeder Zugriff geht über den Namen, kein
// Spread aus der Quellzeile.

export interface AltTeilnehmer {
  id: string;
  name: string;
  login_code: string;
  aktiv: number;
  beginn: string | null;
  created_at: string;
  last_seen: string | null;
}

export interface AltAufgabe {
  id: string;
  teil: number;
  nummer: string;
  titel: string;
  lernziel: string;
  schritte: string;
  durchfuehrungshinweise: string;
  sicherheitshinweise: string;
  zielanzahl_default: number;
  sort_order: number;
  aktiv: number;
  bild: string | null;
  updated_at: string;
}

export interface AltDurchfuehrung {
  id: string;
  participant_id: string;
  task_id: string;
  datum: string;
  drohnensteuerer: string;
  luftraumbeobachter: string;
  created_at: string;
  deleted_at: string | null;
}

export interface AltAufgabenStatus {
  participant_id: string;
  task_id: string;
  zielanzahl: number | null;
  nicht_anwendbar: number;
  updated_at: string;
}

export interface AltSitzung {
  token: string;
  kind: string;
  subject_id: string;
  created_at: string;
  expires_at: string;
}

export interface UavQuelle {
  participants: AltTeilnehmer[];
  tasks: AltAufgabe[];
  executions: AltDurchfuehrung[];
  taskStatus: AltAufgabenStatus[];
  sessions: AltSitzung[];
}

/** Die fünf Quellabfragen — jede nennt ihre Spalten (radio.ts:185-205 begründet, warum). */
export function lieseQuelle(quellDb: Database.Database): UavQuelle {
  return {
    participants: quellDb
      .prepare("SELECT id, name, login_code, aktiv, beginn, created_at, last_seen FROM participants")
      .all() as AltTeilnehmer[],

    tasks: quellDb
      .prepare(
        `SELECT id, teil, nummer, titel, lernziel, schritte, durchfuehrungshinweise,
                sicherheitshinweise, zielanzahl_default, sort_order, aktiv, bild, updated_at
           FROM tasks`,
      )
      .all() as AltAufgabe[],

    executions: quellDb
      .prepare(
        `SELECT id, participant_id, task_id, datum, drohnensteuerer, luftraumbeobachter,
                created_at, deleted_at
           FROM executions`,
      )
      .all() as AltDurchfuehrung[],

    taskStatus: quellDb
      .prepare("SELECT participant_id, task_id, zielanzahl, nicht_anwendbar, updated_at FROM task_status")
      .all() as AltAufgabenStatus[],

    sessions: quellDb
      .prepare("SELECT token, kind, subject_id, created_at, expires_at FROM sessions")
      .all() as AltSitzung[],
  };
}

const ILLUSTRATIONS_PRAEFIX = "/illustrations/";

/** `/illustrations/<x>` → `/m/uav/illustrations/<x>` — NUR bei genau diesem Präfix. */
export function bildUmschreiben(bild: string | null): string | null {
  if (bild && bild.startsWith(ILLUSTRATIONS_PRAEFIX)) return `/m/uav${bild}`;
  return bild ?? null;
}

/** Reduziert einen Illustrationspfad auf den Dateinamen — für die Parität (Präfix ist parity-blind). */
export function bildDateiname(bild: string | null): string | null {
  if (!bild) return null;
  const teile = bild.split("/");
  return teile[teile.length - 1];
}

/** `sessions`: nur `kind='participant'` UND noch nicht abgelaufen (ISO-Text, lexikographisch). */
export function istImportierbareSitzung(z: AltSitzung, jetzt: Date): boolean {
  return z.kind === "participant" && z.expires_at > jetzt.toISOString();
}

export function importierbareSitzungen(rows: AltSitzung[], jetzt: Date): AltSitzung[] {
  return rows.filter((z) => istImportierbareSitzung(z, jetzt));
}

// ── Mapping Quellzeile → Zielspalten (camelCase) ────────────────────────────────────

export function toNeuerTeilnehmer(z: AltTeilnehmer): schema.ParticipantRow {
  return {
    id: z.id,
    name: z.name,
    loginCode: z.login_code,
    aktiv: z.aktiv,
    beginn: z.beginn ?? null,
    createdAt: z.created_at,
    lastSeen: z.last_seen ?? null,
  };
}

export function toNeueAufgabe(z: AltAufgabe): schema.TaskRow {
  return {
    id: z.id,
    teil: z.teil,
    nummer: z.nummer,
    titel: z.titel,
    lernziel: z.lernziel,
    schritte: z.schritte,
    durchfuehrungshinweise: z.durchfuehrungshinweise,
    sicherheitshinweise: z.sicherheitshinweise,
    zielanzahlDefault: z.zielanzahl_default,
    sortOrder: z.sort_order,
    aktiv: z.aktiv,
    bild: bildUmschreiben(z.bild),
    updatedAt: z.updated_at,
  };
}

export function toNeueDurchfuehrung(z: AltDurchfuehrung): schema.ExecutionRow {
  return {
    id: z.id,
    participantId: z.participant_id,
    taskId: z.task_id,
    datum: z.datum,
    drohnensteuerer: z.drohnensteuerer,
    luftraumbeobachter: z.luftraumbeobachter,
    createdAt: z.created_at,
    deletedAt: z.deleted_at ?? null,
  };
}

export function toNeuerAufgabenStatus(z: AltAufgabenStatus): schema.TaskStatusRow {
  return {
    participantId: z.participant_id,
    taskId: z.task_id,
    zielanzahl: z.zielanzahl ?? null,
    nichtAnwendbar: z.nicht_anwendbar,
    updatedAt: z.updated_at,
  };
}

export function toNeueSitzung(z: AltSitzung): schema.SessionRow {
  return {
    token: z.token,
    kind: z.kind,
    subjectId: z.subject_id,
    createdAt: z.created_at,
    expiresAt: z.expires_at,
  };
}

export interface ImportErgebnis {
  participants: number;
  tasks: number;
  executions: number;
  taskStatus: number;
  sessions: number;
  sessionsUebersprungen: number;
}

/**
 * Upsert per PK, alle Spalten. Einfügereihenfolge: `participants` zuerst — `executions`
 * und `task_status` tragen eine FK auf `participants.id` (ON DELETE CASCADE, Schema §),
 * und `getModuleDb()`/`openModuleDatabase()` fahren `foreign_keys = ON` (src/core/db/index.ts).
 * `sessions` trägt keine FK-Kante (subjectId ist unbewacht) und kann daher zuletzt stehen.
 * EINE Transaktion über alle fünf Tabellen, wie radio.ts:627-632.
 */
export function importUav(quelle: Database.Database, ziel: UavDb, jetzt: Date = new Date()): ImportErgebnis {
  const q = lieseQuelle(quelle);
  const importierbareSessions = importierbareSitzungen(q.sessions, jetzt);
  const sessionsUebersprungen = q.sessions.length - importierbareSessions.length;

  ziel.transaction((tx) => {
    for (const z of q.participants) {
      const v = toNeuerTeilnehmer(z);
      tx.insert(schema.participants).values(v).onConflictDoUpdate({ target: schema.participants.id, set: v }).run();
    }
    for (const z of q.tasks) {
      const v = toNeueAufgabe(z);
      tx.insert(schema.tasks).values(v).onConflictDoUpdate({ target: schema.tasks.id, set: v }).run();
    }
    for (const z of q.executions) {
      const v = toNeueDurchfuehrung(z);
      tx.insert(schema.executions).values(v).onConflictDoUpdate({ target: schema.executions.id, set: v }).run();
    }
    for (const z of q.taskStatus) {
      const v = toNeuerAufgabenStatus(z);
      tx.insert(schema.taskStatus)
        .values(v)
        .onConflictDoUpdate({ target: [schema.taskStatus.participantId, schema.taskStatus.taskId], set: v })
        .run();
    }
    for (const z of importierbareSessions) {
      const v = toNeueSitzung(z);
      tx.insert(schema.sessions).values(v).onConflictDoUpdate({ target: schema.sessions.token, set: v }).run();
    }
  });

  return {
    participants: q.participants.length,
    tasks: q.tasks.length,
    executions: q.executions.length,
    taskStatus: q.taskStatus.length,
    sessions: importierbareSessions.length,
    sessionsUebersprungen,
  };
}

// ── Paritätssichten — je Tabelle ALLE Spalten, beide Arme über dieselbe Funktion. ──────

export function paritaetsSichtTeilnehmer(r: schema.ParticipantRow) {
  return {
    id: r.id,
    name: r.name,
    loginCode: r.loginCode,
    aktiv: r.aktiv,
    beginn: r.beginn ?? null,
    createdAt: r.createdAt,
    lastSeen: r.lastSeen ?? null,
  };
}

/** `bild` geht als DATEINAME ein, nicht als Pfad — die Präfix-Umschreibung ist parity-blind. */
export function paritaetsSichtAufgabe(r: schema.TaskRow) {
  return {
    id: r.id,
    teil: r.teil,
    nummer: r.nummer,
    titel: r.titel,
    lernziel: r.lernziel,
    schritte: r.schritte,
    durchfuehrungshinweise: r.durchfuehrungshinweise,
    sicherheitshinweise: r.sicherheitshinweise,
    zielanzahlDefault: r.zielanzahlDefault,
    sortOrder: r.sortOrder,
    aktiv: r.aktiv,
    bild: bildDateiname(r.bild ?? null),
    updatedAt: r.updatedAt,
  };
}

export function paritaetsSichtDurchfuehrung(r: schema.ExecutionRow) {
  return {
    id: r.id,
    participantId: r.participantId,
    taskId: r.taskId,
    datum: r.datum,
    drohnensteuerer: r.drohnensteuerer,
    luftraumbeobachter: r.luftraumbeobachter,
    createdAt: r.createdAt,
    deletedAt: r.deletedAt ?? null,
  };
}

export function paritaetsSichtAufgabenStatus(r: schema.TaskStatusRow) {
  return {
    participantId: r.participantId,
    taskId: r.taskId,
    zielanzahl: r.zielanzahl ?? null,
    nichtAnwendbar: r.nichtAnwendbar,
    updatedAt: r.updatedAt,
  };
}

export function paritaetsSichtSitzung(r: schema.SessionRow) {
  return {
    token: r.token,
    kind: r.kind,
    subjectId: r.subjectId,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  };
}

/**
 * Vollzeilen-Parität je Tabelle (fünf `ParityReport`s, Reihenfolge = Einfügereihenfolge)
 * PLUS eine unabhängige Zusatzprüfung: `Set(login_code)` muss auf beiden Seiten gleich
 * sein. Die Zusatzprüfung ist keine gewöhnliche `ParityReport` — sie wirft direkt, weil
 * der Login-Code der EINZIGE Zugangsweg eines Teilnehmers ist (Dauer-Code/Magic-Link):
 * ein fehlender Code ist ein Zugangsverlust, kein gewöhnlicher Feldunterschied, auch
 * wenn die volle Teilnehmer-Zeile aus anderem Grund schon rot wäre.
 *
 * ⚠️ `sessions`, `executions` UND `task_status` vergleichen den Zielarm NUR gegen die
 * importierten Schlüssel (Token bzw. `id` bzw. `participantId`+`taskId` der Quelle) —
 * nicht gegen alle Zielzeilen. Grund: sobald jemand sich gegen die importierte DB anmeldet
 * (neue `sessions`-Zeile) oder eine Durchführung/Erledigung erfasst (neue `executions`-/
 * `task_status`-Zeile, Client-UUID bzw. Upsert), existiert im Ziel eine echte, korrekte
 * Zeile, die die Quelle nie gesehen hat — ein voller Vergleich färbt einen erneuten Lauf
 * dann fälschlich rot (`missingInSource`), obwohl der Import stimmt. Die Schlüssel-
 * Einschränkung lässt genau diese Zeilen unangetastet und prüft trotzdem weiter, ob jede
 * IMPORTIERTE Zeile im Ziel unverändert und vollständig ankam (radio.ts:604-607-Muster,
 * hier verallgemeinert). `participants`/`tasks` bleiben VOLL verglichen: ein Re-Import
 * muss weiterhin merken, wenn eine importierte Zeile im Ziel fehlt oder verändert wurde
 * — dafür MUSS der Import gegen ein noch unbenutztes `DATA_DIR` laufen, siehe Runbook
 * §P/§C. (Eine später lokal angelegte Teilnehmer-/Aufgabenzeile bliebe bei vollem
 * Vergleich ein echter Befund — das ist gewollt, kein Fehlalarm wie oben.)
 */
export function paritaetUav(quelle: Database.Database, ziel: UavDb, jetzt: Date = new Date()): ParityReport[] {
  const q = lieseQuelle(quelle);
  const importierbareSessions = importierbareSitzungen(q.sessions, jetzt);

  const zielTeilnehmer = ziel.select().from(schema.participants).all();

  const quellExecutionIds = new Set(q.executions.map((z) => z.id));
  const zielExecutionenImportiert = ziel
    .select()
    .from(schema.executions)
    .all()
    .filter((r) => quellExecutionIds.has(r.id));

  const quellTaskStatusSchluessel = new Set(q.taskStatus.map((z) => `${z.participant_id} ${z.task_id}`));
  const zielTaskStatusImportiert = ziel
    .select()
    .from(schema.taskStatus)
    .all()
    .filter((r) => quellTaskStatusSchluessel.has(`${r.participantId} ${r.taskId}`));

  const quellSessionTokens = new Set(importierbareSessions.map((z) => z.token));
  const zielSessionsImportiert = ziel
    .select()
    .from(schema.sessions)
    .all()
    .filter((r) => quellSessionTokens.has(r.token));

  const reports: ParityReport[] = [
    checkParity(
      q.participants.map((z) => paritaetsSichtTeilnehmer(toNeuerTeilnehmer(z))),
      zielTeilnehmer.map(paritaetsSichtTeilnehmer),
    ),
    checkParity(
      q.tasks.map((z) => paritaetsSichtAufgabe(toNeueAufgabe(z))),
      ziel.select().from(schema.tasks).all().map(paritaetsSichtAufgabe),
    ),
    checkParity(
      q.executions.map((z) => paritaetsSichtDurchfuehrung(toNeueDurchfuehrung(z))),
      zielExecutionenImportiert.map(paritaetsSichtDurchfuehrung),
    ),
    checkParity(
      q.taskStatus.map((z) => paritaetsSichtAufgabenStatus(toNeuerAufgabenStatus(z))),
      zielTaskStatusImportiert.map(paritaetsSichtAufgabenStatus),
    ),
    checkParity(
      importierbareSessions.map((z) => paritaetsSichtSitzung(toNeueSitzung(z))),
      zielSessionsImportiert.map(paritaetsSichtSitzung),
    ),
  ];

  const quellCodes = new Set(q.participants.map((z) => z.login_code));
  const zielCodes = new Set(zielTeilnehmer.map((r) => r.loginCode));
  const codesGleich =
    quellCodes.size === zielCodes.size && [...quellCodes].every((c) => zielCodes.has(c));
  if (!codesGleich) {
    throw new Error(
      `Parity check FAILED: login_code-Menge weicht ab (Quelle=${quellCodes.size}, Ziel=${zielCodes.size}). ` +
        "Import ABORTED — no cutover.",
    );
  }

  return reports;
}

/**
 * Import + Parität, testbar OHNE `getModuleDb()`/`migrateAllModules()` (radio.ts:613-641
 * begründet die Trennung: `getModuleDb()`s Cache ist per Modulschlüssel gekeyt, nicht per
 * `DATA_DIR`, ein Vitest-Lauf führe sonst ein stale Handle).
 *
 * ⚠️ `assertParity` steht VOR jeder Erfolgsmeldung — die einzige Zeile zwischen einem
 * roten Paritätsbericht und einem still geloggten „Parität grün" mit Exit 0. Ein
 * geworfener Fehler heißt: das Ziel wurde bereits (idempotent) beschrieben — nicht
 * "nichts ist passiert" (radio.ts:634-637).
 */
export function schreibeUndPruefe(
  quelle: Database.Database,
  ziel: UavDb,
  jetzt: Date = new Date(),
): { ergebnis: ImportErgebnis; reports: ParityReport[] } {
  const ergebnis = importUav(quelle, ziel, jetzt);
  const reports = paritaetUav(quelle, ziel, jetzt); // wirft bei login_code-Abweichung direkt
  for (const report of reports) assertParity(report); // wirft bei jeder Zeilen-Abweichung
  return { ergebnis, reports };
}

/** Die Klammer über Quelle öffnen, migrieren, schreiben-und-prüfen, melden. */
export function runUavImport(quellPfad: string): void {
  migrateAllModules();

  const quellDb = new Database(quellPfad, { readonly: true });
  try {
    const ziel = getDb();
    const { ergebnis, reports } = schreibeUndPruefe(quellDb, ziel);
    console.log(
      `Quelle: participants=${ergebnis.participants} tasks=${ergebnis.tasks} ` +
        `executions=${ergebnis.executions} taskStatus=${ergebnis.taskStatus} ` +
        `sessions=${ergebnis.sessions} (übersprungen: ${ergebnis.sessionsUebersprungen})`,
    );
    const zeilen = reports.reduce((n, r) => n + r.sourceCount, 0);
    console.log(`uav-Import OK — ${zeilen} Zeilen, Parität grün.`);
  } finally {
    quellDb.close();
  }
}

// CLI: tsx scripts/import/uav.ts <pfad-zur-alt-app.db>   (DATA_DIR steuert das Ziel)
if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: tsx scripts/import/uav.ts <pfad-zur-alt-app.db>");
    process.exit(1);
  }
  try {
    runUavImport(src);
  } catch (err: unknown) {
    console.error(err);
    process.exit(1);
  }
}
