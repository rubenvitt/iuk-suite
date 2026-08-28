import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { UavDb } from "../_db/client";
import { executions, participants, taskStatus, tasks } from "../_db/schema";
import { loginCodeErzeugen } from "./code";
import type {
  ExecutionDTO,
  ParticipantDetailDTO,
  ParticipantDTO,
  ParticipantProgressDTO,
  ProgressSnapshot,
  SyncRequest,
  TaskDTO,
  TaskProgressDTO,
  TaskStatusDTO,
  Teil,
  TeilStatDTO,
} from "./typen";

// Port von uav-praxis/server/db/repo.ts — `getDb()` wird überall durch den
// Parameter `db` ersetzt, `adminUpserten` entfällt (kein Admin-Import hier).

/** Fehler-Marker für „nicht gefunden" (Routes mappen auf 404). */
export class NotFound extends Error {
  readonly code = "not_found";
  constructor(message = "Nicht gefunden") {
    super(message);
    this.name = "NotFound";
  }
}

const jetzt = () => new Date().toISOString();

// ── JSON-Helfer ─────────────────────────────────────────────────────────────

function parseStringArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function jsonArray(value: string[] | undefined): string {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

// ── Mapping Row → DTO ───────────────────────────────────────────────────────

function mapTask(r: typeof tasks.$inferSelect): TaskDTO {
  return {
    id: r.id,
    teil: r.teil as Teil,
    nummer: r.nummer,
    titel: r.titel,
    lernziel: r.lernziel,
    schritte: parseStringArray(r.schritte),
    durchfuehrungshinweise: parseStringArray(r.durchfuehrungshinweise),
    sicherheitshinweise: parseStringArray(r.sicherheitshinweise),
    zielanzahlDefault: r.zielanzahlDefault,
    sortOrder: r.sortOrder,
    aktiv: r.aktiv === 1,
    bildUrl: r.bild,
  };
}

function mapParticipant(r: typeof participants.$inferSelect): ParticipantDTO {
  return {
    id: r.id,
    name: r.name,
    loginCode: r.loginCode,
    aktiv: r.aktiv === 1,
    beginn: r.beginn,
    lastSeen: r.lastSeen,
  };
}

function mapExecution(r: typeof executions.$inferSelect): ExecutionDTO {
  return {
    id: r.id,
    taskId: r.taskId,
    datum: r.datum,
    drohnensteuerer: r.drohnensteuerer,
    luftraumbeobachter: r.luftraumbeobachter,
    deletedAt: r.deletedAt,
  };
}

function mapTaskStatus(r: typeof taskStatus.$inferSelect): TaskStatusDTO {
  return {
    taskId: r.taskId,
    zielanzahl: r.zielanzahl,
    nichtAnwendbar: r.nichtAnwendbar === 1,
    updatedAt: r.updatedAt,
  };
}

// ── Tasks (Katalog) ──────────────────────────────────────────────────────

export function alleTasks(db: UavDb, inklusiveInaktiv = false): TaskDTO[] {
  const rows = inklusiveInaktiv
    ? db.select().from(tasks).orderBy(tasks.sortOrder, tasks.nummer).all()
    : db.select().from(tasks).where(eq(tasks.aktiv, 1)).orderBy(tasks.sortOrder, tasks.nummer).all();
  return rows.map(mapTask);
}

export function taskById(db: UavDb, id: string): TaskDTO | null {
  const r = db.select().from(tasks).where(eq(tasks.id, id)).get();
  return r ? mapTask(r) : null;
}

export function taskAnlegen(
  db: UavDb,
  task: Omit<TaskDTO, "id" | "sortOrder"> & { id?: string; sortOrder?: number },
): TaskDTO {
  const id = task.id ?? randomUUID();
  const maxSort = db.select({ m: sql<number>`COALESCE(MAX(${tasks.sortOrder}), -1)` }).from(tasks).get()!.m;
  const sortOrder = task.sortOrder ?? maxSort + 1;
  db.insert(tasks).values({
    id,
    teil: task.teil,
    nummer: task.nummer,
    titel: task.titel,
    lernziel: task.lernziel ?? "",
    schritte: jsonArray(task.schritte),
    durchfuehrungshinweise: jsonArray(task.durchfuehrungshinweise),
    sicherheitshinweise: jsonArray(task.sicherheitshinweise),
    zielanzahlDefault: task.zielanzahlDefault ?? 1,
    sortOrder,
    aktiv: task.aktiv === false ? 0 : 1,
    bild: task.bildUrl ?? null,
    updatedAt: jetzt(),
  }).run();
  return taskById(db, id)!;
}

export function taskAendern(db: UavDb, id: string, patch: Partial<TaskDTO>): TaskDTO {
  const vorhanden = taskById(db, id);
  if (!vorhanden) throw new NotFound("Aufgabe nicht gefunden");
  const next: TaskDTO = { ...vorhanden, ...patch, id };
  db.update(tasks).set({
    teil: next.teil,
    nummer: next.nummer,
    titel: next.titel,
    lernziel: next.lernziel ?? "",
    schritte: jsonArray(next.schritte),
    durchfuehrungshinweise: jsonArray(next.durchfuehrungshinweise),
    sicherheitshinweise: jsonArray(next.sicherheitshinweise),
    zielanzahlDefault: next.zielanzahlDefault ?? 1,
    sortOrder: next.sortOrder ?? 0,
    aktiv: next.aktiv === false ? 0 : 1,
    bild: next.bildUrl ?? null,
    updatedAt: jetzt(),
  }).where(eq(tasks.id, id)).run();
  return taskById(db, id)!;
}

export function taskLoeschen(db: UavDb, id: string): void {
  const info = db.delete(tasks).where(eq(tasks.id, id)).run();
  if (info.changes === 0) throw new NotFound("Aufgabe nicht gefunden");
}

export function tasksNeuSortieren(db: UavDb, ids: string[]): void {
  const ts = jetzt();
  db.transaction((tx) => {
    ids.forEach((id, index) => {
      tx.update(tasks).set({ sortOrder: index, updatedAt: ts }).where(eq(tasks.id, id)).run();
    });
  });
}

// ── Teilnehmer ───────────────────────────────────────────────────────────

export function alleTeilnehmer(db: UavDb): ParticipantDTO[] {
  const rows = db.select().from(participants).orderBy(sql`${participants.aktiv} DESC`, participants.name).all();
  return rows.map(mapParticipant);
}

export function teilnehmerById(db: UavDb, id: string): ParticipantDTO | null {
  const r = db.select().from(participants).where(eq(participants.id, id)).get();
  return r ? mapParticipant(r) : null;
}

export function teilnehmerAnlegen(db: UavDb, name: string, beginn: string | null = null): ParticipantDTO {
  const id = randomUUID();
  const code = eindeutigenCodeErzeugen(db);
  db.insert(participants).values({
    id, name, loginCode: code, aktiv: 1, beginn, createdAt: jetzt(),
  }).run();
  return teilnehmerById(db, id)!;
}

export function teilnehmerAendern(
  db: UavDb,
  id: string,
  patch: Partial<ParticipantDTO> & { codeNeu?: boolean },
): ParticipantDTO {
  const vorhanden = teilnehmerById(db, id);
  if (!vorhanden) throw new NotFound("Teilnehmer nicht gefunden");
  const loginCode = patch.codeNeu ? eindeutigenCodeErzeugen(db) : vorhanden.loginCode;
  const next = { ...vorhanden, ...patch, loginCode };
  db.update(participants).set({
    name: next.name,
    aktiv: next.aktiv === false ? 0 : 1,
    beginn: next.beginn ?? null,
    loginCode: next.loginCode,
  }).where(eq(participants.id, id)).run();
  return teilnehmerById(db, id)!;
}

export function teilnehmerLoeschen(db: UavDb, id: string): void {
  const info = db.delete(participants).where(eq(participants.id, id)).run();
  if (info.changes === 0) throw new NotFound("Teilnehmer nicht gefunden");
}

/** Sucht einen aktiven Teilnehmer per (bereits normalisiertem) Login-Code. */
export function teilnehmerPerCode(db: UavDb, code: string): ParticipantDTO | null {
  const r = db.select().from(participants).where(and(eq(participants.loginCode, code), eq(participants.aktiv, 1))).get();
  return r ? mapParticipant(r) : null;
}

/** Setzt last_seen des Teilnehmers auf jetzt. */
export function teilnehmerGesehen(db: UavDb, id: string): void {
  db.update(participants).set({ lastSeen: jetzt() }).where(eq(participants.id, id)).run();
}

/** Erzeugt einen kollisionsfreien Login-Code (Prüfung gegen DB). */
export function eindeutigenCodeErzeugen(db: UavDb): string {
  for (let i = 0; i < 50; i++) {
    const code = loginCodeErzeugen();
    const exists = db.select({ x: sql`1` }).from(participants).where(eq(participants.loginCode, code)).get();
    if (!exists) return code;
  }
  throw new Error("Konnte keinen eindeutigen Login-Code erzeugen");
}

// ── Fortschritt / Sync ───────────────────────────────────────────────────

export function fortschritt(db: UavDb, participantId: string): ProgressSnapshot {
  const execRows = db.select().from(executions).where(eq(executions.participantId, participantId)).all().map(mapExecution);
  const statusRows = db.select().from(taskStatus).where(eq(taskStatus.participantId, participantId)).all().map(mapTaskStatus);
  return { executions: execRows, taskStatus: statusRows, serverTime: jetzt() };
}

/**
 * Wendet die Mutationen idempotent an (Execution-PK = client-UUID;
 * Tombstones via deletedAt; TaskStatus last-write-wins per updatedAt) und
 * liefert den autoritativen Snapshot. participantId stammt IMMER aus dem
 * Aufruf, nie aus dem Request-Body.
 */
export function sync(db: UavDb, participantId: string, req: SyncRequest): ProgressSnapshot {
  const ts = jetzt();
  db.transaction((tx) => {
    for (const e of req.executions) {
      tx.insert(executions).values({
        id: e.id,
        participantId,
        taskId: e.taskId,
        datum: e.datum,
        drohnensteuerer: e.drohnensteuerer ?? "",
        luftraumbeobachter: e.luftraumbeobachter ?? "",
        createdAt: ts,
        deletedAt: e.deletedAt ?? null,
      }).onConflictDoUpdate({
        target: executions.id,
        set: {
          taskId: sql`excluded.task_id`,
          datum: sql`excluded.datum`,
          drohnensteuerer: sql`excluded.drohnensteuerer`,
          luftraumbeobachter: sql`excluded.luftraumbeobachter`,
          deletedAt: sql`excluded.deleted_at`,
        },
      }).run();
    }
    for (const s of req.taskStatus) {
      tx.insert(taskStatus).values({
        participantId,
        taskId: s.taskId,
        zielanzahl: s.zielanzahl ?? null,
        nichtAnwendbar: s.nichtAnwendbar ? 1 : 0,
        updatedAt: s.updatedAt,
      }).onConflictDoUpdate({
        target: [taskStatus.participantId, taskStatus.taskId],
        set: {
          zielanzahl: sql`excluded.zielanzahl`,
          nichtAnwendbar: sql`excluded.nicht_anwendbar`,
          updatedAt: sql`excluded.updated_at`,
        },
        setWhere: sql`excluded.updated_at > ${taskStatus.updatedAt}`,
      }).run();
    }
  });
  return fortschritt(db, participantId);
}

/** Überblick über alle Teilnehmer (erledigt/gesamt/quote je Teilnehmer). */
export function teilnehmerUebersicht(db: UavDb): ParticipantProgressDTO[] {
  return alleTeilnehmer(db).map((p) => ({
    participant: p,
    ...aggregat(teilnehmerAufgaben(db, p.id)),
  }));
}

/**
 * Vollständige Detail-Auswertung eines Teilnehmers: Gesamtquote, Quoten je
 * Teil (1–3) und die Aufschlüsselung pro Aufgabe sowie die letzte Aktivität.
 */
export function teilnehmerDetail(db: UavDb, id: string): ParticipantDetailDTO {
  const participant = teilnehmerById(db, id);
  if (!participant) throw new NotFound("Teilnehmer nicht gefunden");

  const aufgaben = teilnehmerAufgaben(db, id);
  const teilNummern: Teil[] = [1, 2, 3];
  const teile: TeilStatDTO[] = teilNummern
    .map((teil) => {
      const anwendbar = aufgaben.filter((a) => a.teil === teil && !a.nichtAnwendbar);
      const gesamt = anwendbar.length;
      const erledigt = anwendbar.filter((a) => a.erledigt).length;
      return { teil, erledigt, gesamt, quote: gesamt > 0 ? erledigt / gesamt : 0 };
    })
    .filter((s) => s.gesamt > 0);

  const letzteExec = db.select({ m: sql<string | null>`MAX(${executions.createdAt})` }).from(executions)
    .where(and(eq(executions.participantId, id), sql`${executions.deletedAt} IS NULL`)).get();
  const kandidaten = [participant.lastSeen, letzteExec?.m ?? null].filter((x): x is string => x != null);
  const letzteAktivitaet = kandidaten.length ? kandidaten.sort().at(-1)! : null;

  return { participant, ...aggregat(aufgaben), teile, aufgaben, letzteAktivitaet };
}

/**
 * Aufgaben-Aufschlüsselung eines Teilnehmers über den aktiven Katalog: effektive
 * Zielanzahl = task_status.zielanzahl ?? tasks.zielanzahl_default (min. 1);
 * erledigt, wenn die Anzahl nicht-gelöschter Durchführungen ≥ Zielanzahl und
 * die Aufgabe anwendbar ist.
 */
function teilnehmerAufgaben(db: UavDb, participantId: string): TaskProgressDTO[] {
  const alleAktiven = alleTasks(db, false);

  const execRows = db.select({
    taskId: executions.taskId,
    anzahl: sql<number>`COUNT(*)`,
    letzte: sql<string | null>`MAX(${executions.datum})`,
  }).from(executions)
    .where(and(eq(executions.participantId, participantId), sql`${executions.deletedAt} IS NULL`))
    .groupBy(executions.taskId).all();
  const execMap = new Map(execRows.map((r) => [r.taskId, r]));

  const statusRows = db.select({
    taskId: taskStatus.taskId,
    zielanzahl: taskStatus.zielanzahl,
    nichtAnwendbar: taskStatus.nichtAnwendbar,
  }).from(taskStatus).where(eq(taskStatus.participantId, participantId)).all();
  const statusMap = new Map(statusRows.map((r) => [r.taskId, r]));

  return alleAktiven.map((t) => {
    const ex = execMap.get(t.id);
    const st = statusMap.get(t.id);
    const anzahl = ex?.anzahl ?? 0;
    const nichtAnwendbar = st?.nichtAnwendbar === 1;
    const ziel = Math.max(1, st?.zielanzahl ?? t.zielanzahlDefault);
    return {
      taskId: t.id,
      teil: t.teil,
      nummer: t.nummer,
      titel: t.titel,
      anzahl,
      ziel,
      erledigt: !nichtAnwendbar && anzahl >= ziel,
      nichtAnwendbar,
      letzteDurchfuehrung: ex?.letzte ?? null,
    };
  });
}

/** Aggregiert eine Aufgabenliste zu erledigt/gesamt/quote (nicht anwendbare zählen nicht). */
function aggregat(aufgaben: TaskProgressDTO[]): { erledigt: number; gesamt: number; quote: number } {
  const anwendbar = aufgaben.filter((a) => !a.nichtAnwendbar);
  const gesamt = anwendbar.length;
  const erledigt = anwendbar.filter((a) => a.erledigt).length;
  return { erledigt, gesamt, quote: gesamt > 0 ? erledigt / gesamt : 0 };
}
