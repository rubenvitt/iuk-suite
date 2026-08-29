import type { ExecutionDTO, ProgressSnapshot, TaskDTO, TaskStatusDTO } from "../../_lib/typen";
import type { AufgabenFortschritt } from "./progress";

/**
 * Lokaler Cache (localStorage) für die offline-first Teilnehmer-App:
 *  - Katalog (zuletzt geladene Tasks vom Server; kein Offline-Seed — der Katalog
 *    kommt aus `/api/tasks` und liegt danach im Cache, Spec §2),
 *  - lokaler Fortschritt im bestehenden `AufgabenFortschritt`-Format (geteilt mit
 *    `useFortschritt` über denselben Key und dieselbe `AppState`-Form),
 *  - Mutations-Queue (Execution-Upserts/Tombstones + TaskStatus-Upserts, coalesced),
 *  - `lastSync` (serverTime des letzten erfolgreichen Pull).
 *
 * Die öffentliche API ist bewusst flach und synchron — sie wird sowohl von
 * `useFortschritt` (Schreib-Spiegelung in die Queue) als auch von der
 * `syncEngine` (Reconciliation) konsumiert.
 *
 * Storage-Keys sind die Alt-Keys der `uav-praxis`-SPA — bewusst UNVERÄNDERT,
 * damit ein Gerät, das die Alt-Anwendung offline im Einsatz hatte, seinen
 * lokalen Stand nach dem Umzug auf die Suite wiederfindet.
 */

// ── Storage-Keys ────────────────────────────────────────────────────────────
// Der Fortschritt teilt sich den Key/das Format mit `useFortschritt`, damit es
// genau EINEN Fortschritt-Store gibt (keine divergierende Parallel-Kopie).
export const FORTSCHRITT_KEY = "drk-drohnen-fortschritt";
const SCHEMA_VERSION = 1;
const KATALOG_KEY = "drk-drohnen-katalog";
const QUEUE_KEY = "drk-drohnen-sync-queue";
const LAST_SYNC_KEY = "drk-drohnen-last-sync";
const UEBERNOMMEN_KEY = "drk-drohnen-uebernommen";

// ── Fortschritt-AppState (identisch zu useFortschritt) ──────────────────────
export type FortschrittMap = Record<string, AufgabenFortschritt>;

export interface AppState {
  schemaVersion: number;
  fortschritt: FortschrittMap;
}

/** Ein noch nicht synchronisierter Mutationseintrag. */
export type QueueEintrag =
  | { art: "execution"; daten: ExecutionDTO }
  | { art: "taskStatus"; daten: TaskStatusDTO };

// ── Low-level localStorage-Zugriff (defensiv) ───────────────────────────────
function lesen<T>(key: string, fallback: T): T {
  try {
    const roh = localStorage.getItem(key);
    if (roh == null) return fallback;
    return JSON.parse(roh) as T;
  } catch {
    return fallback;
  }
}

function schreiben(key: string, wert: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(wert));
  } catch {
    // Storage nicht verfügbar/voll: stiller Fallback, In-Memory-Stand bleibt nutzbar.
  }
}

// ── Subscriptions (Fortschritt) ─────────────────────────────────────────────
// Die `syncEngine` schreibt den reconciled Fortschritt über `fortschrittSchreiben`.
// Ein gemounteter `useFortschritt` abonniert hier, um den neuen Stand sofort
// erneut zu lesen und sich neu zu rendern (sonst bliebe der useState-Stand alt).
type FortschrittListener = (state: AppState) => void;
const fortschrittListener = new Set<FortschrittListener>();

function fortschrittBenachrichtigen(state: AppState): void {
  for (const l of fortschrittListener) l(state);
}

function initialerAppState(): AppState {
  // Kein Fallback-Katalog mehr (Spec §2) — solange nichts vom Server geladen
  // wurde, ist der Fortschritt schlicht leer; `snapshotAnwenden`/`useKatalog`
  // füllen ihn, sobald der Katalog da ist.
  return { schemaVersion: SCHEMA_VERSION, fortschritt: {} };
}

export const localStore = {
  // ── Katalog ──────────────────────────────────────────────────────────────
  /** Liefert den zuletzt geladenen Katalog oder `null`, wenn keiner gecacht ist. */
  tasksLesen(): TaskDTO[] | null {
    return lesen<TaskDTO[] | null>(KATALOG_KEY, null);
  },

  tasksSchreiben(tasks: TaskDTO[]): void {
    schreiben(KATALOG_KEY, tasks);
  },

  /**
   * Effektiver Katalog für die UI: gecacht, sonst leer — der Katalog kommt
   * ausschließlich vom Server (`/api/tasks`), es gibt keinen mitgelieferten
   * Seed mehr (Spec §2).
   */
  katalog(): TaskDTO[] {
    const gecacht = this.tasksLesen();
    if (gecacht && gecacht.length > 0) return gecacht;
    return fallbackKatalog();
  },

  // ── Fortschritt (geteilt mit useFortschritt) ───────────────────────────────
  /** Liest den lokalen Fortschritt-AppState (defaultet auf leeren Stand). */
  fortschrittStateLesen(): AppState {
    return lesen<AppState>(FORTSCHRITT_KEY, initialerAppState());
  },

  /** Bequemer Zugriff nur auf die Fortschritt-Map. */
  fortschrittLesen(): FortschrittMap {
    return this.fortschrittStateLesen().fortschritt;
  },

  /**
   * Schreibt den Fortschritt-AppState und benachrichtigt Abonnenten
   * (genutzt von der `syncEngine` nach erfolgreichem Pull/Reconciliation).
   */
  fortschrittSchreiben(state: AppState): void {
    schreiben(FORTSCHRITT_KEY, state);
    fortschrittBenachrichtigen(state);
  },

  /** Abonniert Fortschritt-Änderungen (z. B. nach Sync). Liefert ein Unsubscribe. */
  fortschrittAbonnieren(listener: FortschrittListener): () => void {
    fortschrittListener.add(listener);
    return () => fortschrittListener.delete(listener);
  },

  // ── Mutations-Queue (coalesced) ───────────────────────────────────────────
  queueLesen(): QueueEintrag[] {
    return lesen<QueueEintrag[]>(QUEUE_KEY, []);
  },

  /**
   * Fügt eine Mutation der Queue hinzu und coalesced gleiche Schlüssel
   * (Execution → nach `id`, TaskStatus → nach `taskId`). Bei Kollision gewinnt
   * der jüngere Eintrag (last-write-wins; bei TaskStatus per `updatedAt`).
   */
  queueAnfuegen(eintrag: QueueEintrag): void {
    const queue = this.queueLesen();
    if (eintrag.art === "execution") {
      const idx = queue.findIndex(
        (q) => q.art === "execution" && q.daten.id === eintrag.daten.id,
      );
      if (idx >= 0) queue[idx] = eintrag;
      else queue.push(eintrag);
    } else {
      const idx = queue.findIndex(
        (q) => q.art === "taskStatus" && q.daten.taskId === eintrag.daten.taskId,
      );
      if (idx >= 0) {
        const bestehend = queue[idx] as { art: "taskStatus"; daten: TaskStatusDTO };
        // last-write-wins per updatedAt
        if (eintrag.daten.updatedAt >= bestehend.daten.updatedAt) queue[idx] = eintrag;
      } else {
        queue.push(eintrag);
      }
    }
    schreiben(QUEUE_KEY, queue);
  },

  /** Mehrere Mutationen coalesced anhängen (z. B. anonym → eingeloggt Übernahme). */
  queueAnfuegenMehrere(eintraege: QueueEintrag[]): void {
    for (const e of eintraege) this.queueAnfuegen(e);
  },

  /** Trennt die Queue in die für `/api/sync` benötigten Arrays auf. */
  queueAlsSyncMutationen(): { executions: ExecutionDTO[]; taskStatus: TaskStatusDTO[] } {
    const executions: ExecutionDTO[] = [];
    const taskStatus: TaskStatusDTO[] = [];
    for (const q of this.queueLesen()) {
      if (q.art === "execution") executions.push(q.daten);
      else taskStatus.push(q.daten);
    }
    return { executions, taskStatus };
  },

  /**
   * Entfernt die bestätigten (bereits gepushten) Einträge aus der Queue —
   * ABER nur, solange der aktuelle Queue-Eintrag mit dem gesendeten identisch
   * ist (gleicher Schlüssel UND gleiche Nutzdaten). Wurde derselbe Schlüssel
   * während des Syncs neu/jünger befüllt (Coalescing), bleibt er erhalten und
   * wird beim nächsten Sync gepusht (§9: nur *bestätigte* Einträge leeren).
   */
  queueBestaetigteEntfernen(gesendet: QueueEintrag[]): void {
    if (gesendet.length === 0) return;
    const bestaetigt = new Set(gesendet.map(queueSignatur));
    const verbleibend = this.queueLesen().filter((q) => !bestaetigt.has(queueSignatur(q)));
    schreiben(QUEUE_KEY, verbleibend);
  },

  queueLeeren(): void {
    schreiben(QUEUE_KEY, []);
  },

  // ── lastSync ───────────────────────────────────────────────────────────────
  lastSyncLesen(): string | null {
    return lesen<string | null>(LAST_SYNC_KEY, null);
  },

  lastSyncSchreiben(serverTime: string): void {
    schreiben(LAST_SYNC_KEY, serverTime);
  },

  // ── Anonym → eingeloggt: Übernahme-Marker (persistent, pro Teilnehmer) ─────
  // Verhindert, dass die einmalige Übernahme des lokalen Fortschritts bei jedem
  // Reload/Mount erneut feuert (sonst würde der gesamte lokale Stand wiederholt
  // als Mutation gequeued — §9: „einmalig" muss über Page-Sessions hinweg halten).
  uebernommenGesetzt(participantId: string): boolean {
    return lesen<string[]>(UEBERNOMMEN_KEY, []).includes(participantId);
  },

  uebernommenMarkieren(participantId: string): void {
    const liste = lesen<string[]>(UEBERNOMMEN_KEY, []);
    if (!liste.includes(participantId)) {
      liste.push(participantId);
      schreiben(UEBERNOMMEN_KEY, liste);
    }
  },

  // ── Reconciliation ─────────────────────────────────────────────────────────
  /**
   * Baut aus einem autoritativen Server-Snapshot den lokalen Fortschritt-AppState
   * neu auf (Server ist autoritativ) und schreibt ihn (inkl. Benachrichtigung).
   * Universum = aktueller Katalog; effektive Zielanzahl =
   * `taskStatus.zielanzahl ?? task.zielanzahlDefault`; gelöschte Executions
   * (Tombstones) zählen nicht.
   */
  snapshotAnwenden(
    snapshot: ProgressSnapshot,
    pending: { executions: ExecutionDTO[]; taskStatus: TaskStatusDTO[] } = {
      executions: [],
      taskStatus: [],
    },
  ): AppState {
    const katalog = this.katalog();
    const statusByTask = new Map<string, TaskStatusDTO>();
    for (const s of snapshot.taskStatus) statusByTask.set(s.taskId, s);

    // Executions je Task als id-indizierte Map (für späteres Overlay/Tombstone).
    const execByTaskMap = new Map<string, Map<string, ExecutionDTO>>();
    const execAufnehmen = (e: ExecutionDTO): void => {
      let map = execByTaskMap.get(e.taskId);
      if (!map) {
        map = new Map<string, ExecutionDTO>();
        execByTaskMap.set(e.taskId, map);
      }
      if (e.deletedAt) map.delete(e.id);
      else map.set(e.id, e);
    };
    for (const e of snapshot.executions) execAufnehmen(e);

    // Pending (noch unbestätigte, lokale) Mutationen ÜBER den Server-Snapshot
    // legen — echter Merge: lokale Änderungen gewinnen, damit eine während des
    // laufenden Syncs eingegangene Änderung nicht kurz aus der UI verschwindet (§9).
    for (const e of pending.executions) execAufnehmen(e);
    for (const s of pending.taskStatus) statusByTask.set(s.taskId, s);

    // Lokal-only Executions nachqueuen (Reviewer-Fund, Fix-Runde 1, Spec §3 #4):
    // eine Execution, die im lokalen Fortschritt steht, aber WEDER im Snapshot
    // NOCH in der Queue auftaucht, wurde nie gepusht — z. B. weil sie entstand,
    // bevor eine Teilnehmer-Identität bestätigt war, oder weil die Alt-App den
    // einmaligen Übernahme-Marker schon gesetzt hatte (die Übernahme lief dann
    // nie, und ohne diese Nachholung wäre der Eintrag beim Rebuild unten
    // ersatzlos verschwunden). Ein Tombstone für dieselbe id STEHT im Snapshot
    // (mit `deletedAt`) — die id gilt dann als bekannt, wird also nicht erneut
    // gequeut: ein Cross-Device-Löschen bleibt gelöscht, kein Resurrect.
    const lokalerFortschritt = this.fortschrittLesen();

    const bekannteIds = new Set<string>();
    for (const e of snapshot.executions) bekannteIds.add(e.id);
    for (const e of pending.executions) bekannteIds.add(e.id);
    for (const [taskId, f] of Object.entries(lokalerFortschritt)) {
      for (const d of f.durchfuehrungen) {
        if (bekannteIds.has(d.id)) continue;
        bekannteIds.add(d.id);
        const daten: ExecutionDTO = {
          id: d.id,
          taskId,
          datum: d.datum,
          drohnensteuerer: d.drohnensteuerer,
          luftraumbeobachter: d.luftraumbeobachter,
        };
        this.queueAnfuegen({ art: "execution", daten });
        execAufnehmen(daten);
      }
    }

    // Dieselbe Regel für TaskStatus: eine lokale Zielanzahl/„nicht anwendbar"
    // die vom Katalog-Default abweicht (`statusWeichtAb`-Logik, wie in der
    // Übernahme-Sweep in `useFortschritt`), aber für die es WEDER im Snapshot
    // NOCH in der Queue einen Eintrag zu dieser Aufgabe gibt, wurde ebenfalls
    // nie gepusht — sonst überschreibt der Rebuild unten sie stillschweigend
    // mit dem Katalog-Default. `taskIdBekannt` wird VOR dieser Ergänzung
    // eingefroren: ein taskId-Eintrag im Snapshot ODER in der Queue gilt als
    // bekannt (auch wenn sein Wert zufällig dem Default entspricht) und wird
    // nicht durch die lokale Abweichung überschrieben.
    const taskIdBekannt = new Set(statusByTask.keys());
    for (const t of katalog) {
      if (taskIdBekannt.has(t.id)) continue;
      const f = lokalerFortschritt[t.id];
      if (!f) continue;
      if (!f.nichtAnwendbar && f.zielanzahl === t.zielanzahlDefault) continue;
      const daten: TaskStatusDTO = {
        taskId: t.id,
        zielanzahl: f.zielanzahl,
        nichtAnwendbar: f.nichtAnwendbar,
        updatedAt: new Date().toISOString(),
      };
      this.queueAnfuegen({ art: "taskStatus", daten });
      statusByTask.set(t.id, daten);
    }

    const execByTask = new Map<string, ExecutionDTO[]>();
    for (const [taskId, map] of execByTaskMap) execByTask.set(taskId, [...map.values()]);

    const fortschritt: FortschrittMap = {};
    for (const t of katalog) {
      const st = statusByTask.get(t.id);
      const ziel = Math.max(1, st?.zielanzahl ?? t.zielanzahlDefault);
      const durchfuehrungen = (execByTask.get(t.id) ?? []).map((e) => ({
        id: e.id,
        datum: e.datum,
        drohnensteuerer: e.drohnensteuerer,
        luftraumbeobachter: e.luftraumbeobachter,
      }));
      fortschritt[t.id] = {
        zielanzahl: ziel,
        durchfuehrungen,
        nichtAnwendbar: st?.nichtAnwendbar ?? false,
      };
    }

    const state: AppState = { schemaVersion: SCHEMA_VERSION, fortschritt };
    this.fortschrittSchreiben(state);
    return state;
  },
};

// Stabile Signatur eines Queue-Eintrags (Schlüssel + vollständige Nutzdaten).
// Zwei Einträge gelten als identisch, wenn Art, Schlüssel und Inhalt gleich sind.
function queueSignatur(e: QueueEintrag): string {
  return `${e.art}:${JSON.stringify(e.daten)}`;
}

// Kein Offline-Fallback-Katalog mehr (Spec §2): der 17,9-KB-Seed der Alt-App
// (`src/data/tasks.ts`) wird nicht mitportiert — der Katalog kommt vom Server.
function fallbackKatalog(): TaskDTO[] {
  return [];
}
