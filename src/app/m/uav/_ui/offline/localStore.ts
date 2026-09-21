import type { Identity } from "../../_lib/sitzung";
import type { ExecutionDTO, ProgressSnapshot, TaskDTO, TaskStatusDTO } from "../../_lib/typen";
import type { AufgabenFortschritt } from "./progress";

/**
 * Lokaler Cache (localStorage) für die offline-first Teilnehmer-App.
 *
 * GERÄTEWEIT (niemandem zugeordnet):
 *  - Katalog (zuletzt geladene Tasks vom Server; kein Offline-Seed, Spec §2),
 *  - das zuletzt vom Server bestätigte Konto (`kontoLesen`) — nur die Weiche,
 *    welcher persönliche Speicher offline angezeigt wird.
 *
 * PERSÖNLICH, je Besitzer getrennt (`personenSpeicher(besitzer)`, DRK-286):
 *  - Fortschritt im `AufgabenFortschritt`-Format (geteilt mit `useFortschritt`),
 *  - Mutations-Queue (Execution-Upserts/Tombstones + TaskStatus-Upserts, coalesced),
 *  - `lastSync` (serverTime des letzten erfolgreichen Pull),
 *  - das zuletzt erfasste Team (Vorbelegung in `DurchfuehrungForm`).
 *
 * Besitzer ist die Teilnehmer-ID oder `ANONYM` — letzteres ist echte anonyme
 * Offline-Erfassung, solange noch kein Konto bestätigt wurde. Vor DRK-286 lag
 * all das unter geräteweiten Schlüsseln: nach dem Login von B zeigte die
 * Oberfläche As Fortschritt samt Namen und synchronisierte As Einträge unter B.
 *
 * Die Alt-Keys der `uav-praxis`-SPA (ohne Besitzer) werden nur noch GELESEN,
 * und zwar genau einmal: `kontoBestaetigt` übergibt sie an das erste Konto,
 * das der Server nach dem Update bestätigt (`altbestandUebernehmen`).
 */

// ── Storage-Keys ────────────────────────────────────────────────────────────
const SCHEMA_VERSION = 1;
const KATALOG_KEY = "drk-drohnen-katalog";
const KONTO_KEY = "drk-drohnen-konto";
/** sessionStorage-Cache der Identität in `TeilnehmerApp` (je Tab). */
export const IDENTITY_SESSION_KEY = "uav-identity";

const FORTSCHRITT_BASIS = "drk-drohnen-fortschritt";
const QUEUE_BASIS = "drk-drohnen-sync-queue";
const LAST_SYNC_BASIS = "drk-drohnen-last-sync";
const TEAM_BASIS = "df:letztes-team";
const ALTBESTAND_BASIS = "drk-drohnen-altbestand";
const PERSOENLICHE_BASEN = [FORTSCHRITT_BASIS, QUEUE_BASIS, LAST_SYNC_BASIS, TEAM_BASIS, ALTBESTAND_BASIS];

// Alt-Keys ohne Besitzer (uav-praxis und Suite vor DRK-286) — dieselben Namen
// wie die Basen, nur ohne `:<besitzer>`.
const ALT_KEYS = {
  fortschritt: FORTSCHRITT_BASIS,
  queue: QUEUE_BASIS,
  lastSync: LAST_SYNC_BASIS,
  uebernommen: "drk-drohnen-uebernommen",
  team: TEAM_BASIS,
};

/**
 * Besitzer der echten anonymen Erfassung. `~` kommt in keiner Teilnehmer-ID vor
 * (UUIDs, Seed-IDs aus `[a-z0-9-]`), eine Kollision ist also ausgeschlossen.
 */
export const ANONYM = "~anonym";

function schluessel(basis: string, besitzer: string): string {
  return `${basis}:${besitzer}`;
}

/** Schlüssel der Team-Vorbelegung eines Besitzers (für `useLocalStorage`). */
export function teamSchluessel(besitzer: string): string {
  return schluessel(TEAM_BASIS, besitzer);
}

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

/** Liefert `false`, wenn der Speicher nicht schreibbar war (voll/gesperrt). */
function schreiben(key: string, wert: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(wert));
    return true;
  } catch {
    // Storage nicht verfügbar/voll: stiller Fallback, In-Memory-Stand bleibt nutzbar.
    return false;
  }
}

function entfernen(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // nicht verfügbar — nichts zu tun
  }
}

function alleSchluessel(): string[] {
  try {
    const liste: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k != null) liste.push(k);
    }
    return liste;
  } catch {
    return [];
  }
}

// ── Subscriptions (Fortschritt, je Besitzer) ────────────────────────────────
// Die `syncEngine` schreibt den reconciled Fortschritt über `fortschrittSchreiben`.
// Ein gemounteter `useFortschritt` abonniert GENAU SEINEN Besitzer — eine
// verspätete Antwort aus As Sync erreicht nach dem Wechsel auf B also nur As
// Speicher, nie Bs Ansicht.
type FortschrittListener = (state: AppState) => void;
const fortschrittListener = new Map<string, Set<FortschrittListener>>();

function fortschrittBenachrichtigen(besitzer: string, state: AppState): void {
  for (const l of fortschrittListener.get(besitzer) ?? []) l(state);
}

function initialerAppState(): AppState {
  // Kein Fallback-Katalog mehr (Spec §2) — solange nichts vom Server geladen
  // wurde, ist der Fortschritt schlicht leer.
  return { schemaVersion: SCHEMA_VERSION, fortschritt: {} };
}

// Stabile Signatur eines Queue-Eintrags (Schlüssel + vollständige Nutzdaten).
function queueSignatur(e: QueueEintrag): string {
  return `${e.art}:${JSON.stringify(e.daten)}`;
}

function statusWeichtAb(f: AufgabenFortschritt | undefined, t: TaskDTO): f is AufgabenFortschritt {
  return !!f && (f.nichtAnwendbar || f.zielanzahl !== t.zielanzahlDefault);
}

// Kein Offline-Fallback-Katalog mehr (Spec §2) — der Katalog kommt vom Server.
function katalogLesen(): TaskDTO[] {
  const gecacht = lesen<TaskDTO[] | null>(KATALOG_KEY, null);
  return gecacht && gecacht.length > 0 ? gecacht : [];
}

function ohneIds(map: FortschrittMap, ids: Set<string>): { map: FortschrittMap; geaendert: boolean } {
  let geaendert = false;
  const neu: FortschrittMap = {};
  for (const [taskId, f] of Object.entries(map)) {
    const behalten = f.durchfuehrungen.filter((d) => !ids.has(d.id));
    if (behalten.length !== f.durchfuehrungen.length) geaendert = true;
    neu[taskId] = { ...f, durchfuehrungen: behalten };
  }
  return { map: neu, geaendert };
}

/**
 * Der persönliche Speicher EINES Besitzers. Alle Lese-/Schreibwege der
 * Teilnehmer-App gehen hierüber; die `syncEngine` hält den Besitzer eines
 * Sync-Laufs fest und schreibt dessen Antwort in genau diesen Speicher.
 */
export function personenSpeicher(besitzer: string) {
  const K = {
    fortschritt: schluessel(FORTSCHRITT_BASIS, besitzer),
    queue: schluessel(QUEUE_BASIS, besitzer),
    lastSync: schluessel(LAST_SYNC_BASIS, besitzer),
    altbestand: schluessel(ALTBESTAND_BASIS, besitzer),
  };

  return {
    besitzer,

    // ── Fortschritt ─────────────────────────────────────────────────────────
    fortschrittStateLesen(): AppState {
      return lesen<AppState>(K.fortschritt, initialerAppState());
    },

    fortschrittLesen(): FortschrittMap {
      return this.fortschrittStateLesen().fortschritt;
    },

    /** Schreibt OHNE Benachrichtigung (der eigene Hook setzt seinen State selbst). */
    fortschrittSpeichern(state: AppState): boolean {
      return schreiben(K.fortschritt, state);
    },

    /** Schreibt und benachrichtigt die Abonnenten DIESES Besitzers (Sync, Übernahme). */
    fortschrittSchreiben(state: AppState): void {
      schreiben(K.fortschritt, state);
      fortschrittBenachrichtigen(besitzer, state);
    },

    // ── Mutations-Queue (coalesced) ─────────────────────────────────────────
    queueLesen(): QueueEintrag[] {
      return lesen<QueueEintrag[]>(K.queue, []);
    },

    /**
     * Fügt eine Mutation der Queue hinzu und coalesced gleiche Schlüssel
     * (Execution → nach `id`, TaskStatus → nach `taskId`). Bei Kollision gewinnt
     * der jüngere Eintrag (last-write-wins; bei TaskStatus per `updatedAt`).
     */
    queueAnfuegen(eintrag: QueueEintrag): void {
      const queue = this.queueLesen();
      if (eintrag.art === "execution") {
        const idx = queue.findIndex((q) => q.art === "execution" && q.daten.id === eintrag.daten.id);
        if (idx >= 0) queue[idx] = eintrag;
        else queue.push(eintrag);
      } else {
        const idx = queue.findIndex((q) => q.art === "taskStatus" && q.daten.taskId === eintrag.daten.taskId);
        if (idx >= 0) {
          const bestehend = queue[idx] as { art: "taskStatus"; daten: TaskStatusDTO };
          if (eintrag.daten.updatedAt >= bestehend.daten.updatedAt) queue[idx] = eintrag;
        } else {
          queue.push(eintrag);
        }
      }
      schreiben(K.queue, queue);
    },

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
     * Entfernt die bestätigten Einträge — nur solange der aktuelle Eintrag mit
     * dem gesendeten identisch ist. Wurde derselbe Schlüssel während des Syncs
     * neu befüllt (Coalescing), bleibt er für den nächsten Sync erhalten (§9).
     */
    queueBestaetigteEntfernen(gesendet: QueueEintrag[]): void {
      if (gesendet.length === 0) return;
      const bestaetigt = new Set(gesendet.map(queueSignatur));
      schreiben(K.queue, this.queueLesen().filter((q) => !bestaetigt.has(queueSignatur(q))));
    },

    queueLeeren(): void {
      schreiben(K.queue, []);
    },

    /**
     * Der Server hat diese Execution-IDs als FREMD abgewiesen (DRK-285, 409):
     * sie gehören einer anderen Person und können hier nie gelingen. Raus aus
     * Queue, Fortschritt und Altbestand — sonst blockierten sie jeden weiteren
     * Sync (alles oder nichts) und blieben als fremde Einträge sichtbar.
     * Liefert, ob überhaupt etwas entfernt wurde (sonst kein erneuter Versuch).
     */
    fremdeEntfernen(ids: string[]): boolean {
      const fremd = new Set(ids);
      const queue = this.queueLesen();
      const rest = queue.filter((q) => !(q.art === "execution" && fremd.has(q.daten.id)));
      let entfernt = rest.length !== queue.length;
      if (entfernt) schreiben(K.queue, rest);

      const state = this.fortschrittStateLesen();
      const f = ohneIds(state.fortschritt, fremd);
      if (f.geaendert) {
        this.fortschrittSchreiben({ ...state, fortschritt: f.map });
        entfernt = true;
      }
      const alt = this.altbestandLesen();
      if (alt) {
        const a = ohneIds(alt, fremd);
        if (a.geaendert) {
          schreiben(K.altbestand, a.map);
          entfernt = true;
        }
      }
      return entfernt;
    },

    // ── lastSync ────────────────────────────────────────────────────────────
    lastSyncLesen(): string | null {
      return lesen<string | null>(K.lastSync, null);
    },

    lastSyncSchreiben(serverTime: string): void {
      schreiben(K.lastSync, serverTime);
    },

    // ── Altbestand (einmalige Migration, s. `altbestandUebernehmen`) ─────────
    altbestandLesen(): FortschrittMap | null {
      return lesen<FortschrittMap | null>(K.altbestand, null);
    },

    altbestandSchreiben(map: FortschrittMap): void {
      schreiben(K.altbestand, map);
    },

    // ── Reconciliation ──────────────────────────────────────────────────────
    /**
     * Baut aus einem autoritativen Server-Snapshot den lokalen Fortschritt neu
     * auf (Server ist autoritativ) und schreibt ihn (inkl. Benachrichtigung).
     * Universum = aktueller Katalog; effektive Zielanzahl =
     * `taskStatus.zielanzahl ?? task.zielanzahlDefault`; Tombstones zählen nicht.
     */
    snapshotAnwenden(
      snapshot: ProgressSnapshot,
      pending: { executions: ExecutionDTO[]; taskStatus: TaskStatusDTO[] } = { executions: [], taskStatus: [] },
    ): AppState {
      const katalog = katalogLesen();
      const statusByTask = new Map<string, TaskStatusDTO>();
      for (const s of snapshot.taskStatus) statusByTask.set(s.taskId, s);

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

      // Pending (noch unbestätigte) Mutationen ÜBER den Snapshot legen — lokale
      // Änderungen gewinnen, damit eine während des Syncs eingegangene Änderung
      // nicht kurz aus der UI verschwindet (§9).
      for (const e of pending.executions) execAufnehmen(e);
      for (const s of pending.taskStatus) statusByTask.set(s.taskId, s);

      // Lokal-only Executions nachqueuen (Spec §3 #4): eine Execution, die im
      // Fortschritt DIESES Besitzers (oder in seinem Altbestand) steht, aber WEDER
      // im Snapshot NOCH in der Queue auftaucht, wurde nie gepusht. Ein Tombstone
      // für dieselbe id STEHT im Snapshot — die id gilt dann als bekannt und wird
      // nicht erneut gequeut (kein Resurrect eines Cross-Device-Löschens).
      // Gehört eine so nachgequeute id in Wahrheit einer anderen Person (möglich
      // nur beim Altbestand), weist der Server sie ab und `fremdeEntfernen` räumt.
      // Altbestand wird dabei NUR gequeut, nicht angezeigt: er kann Namen der
      // vorigen Person tragen und erscheint erst, wenn der Server ihn für dieses
      // Konto angenommen hat (nächster Snapshot).
      const lokalerFortschritt = this.fortschrittLesen();
      const altbestand = this.altbestandLesen() ?? {};

      const bekannteIds = new Set<string>();
      for (const e of snapshot.executions) bekannteIds.add(e.id);
      for (const e of pending.executions) bekannteIds.add(e.id);
      for (const [quelle, anzeigen] of [[lokalerFortschritt, true], [altbestand, false]] as const) {
        for (const [taskId, f] of Object.entries(quelle)) {
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
            if (anzeigen) execAufnehmen(daten);
          }
        }
      }

      // Dieselbe Regel für TaskStatus: eine lokale Abweichung vom Katalog-Default,
      // zu der es WEDER im Snapshot NOCH in der Queue einen Eintrag gibt, wurde nie
      // gepusht. Ein bekannter taskId-Eintrag wird nicht überschrieben.
      const taskIdBekannt = new Set(statusByTask.keys());
      for (const t of katalog) {
        if (taskIdBekannt.has(t.id)) continue;
        const lokal = lokalerFortschritt[t.id];
        const eigener = statusWeichtAb(lokal, t);
        const f = eigener ? lokal : altbestand[t.id];
        if (!statusWeichtAb(f, t)) continue;
        const daten: TaskStatusDTO = {
          taskId: t.id,
          zielanzahl: f.zielanzahl,
          nichtAnwendbar: f.nichtAnwendbar,
          updatedAt: new Date().toISOString(),
        };
        this.queueAnfuegen({ art: "taskStatus", daten });
        if (eigener) statusByTask.set(t.id, daten);
      }
      // Der Altbestand steht jetzt vollständig in der Queue — er wird nicht mehr gebraucht.
      entfernen(K.altbestand);

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
        fortschritt[t.id] = { zielanzahl: ziel, durchfuehrungen, nichtAnwendbar: st?.nichtAnwendbar ?? false };
      }

      const state: AppState = { schemaVersion: SCHEMA_VERSION, fortschritt };
      this.fortschrittSchreiben(state);
      return state;
    },

    /** Entfernt alles Persönliche dieses Besitzers vom Gerät. */
    vergessen(): void {
      for (const basis of PERSOENLICHE_BASEN) entfernen(schluessel(basis, besitzer));
    },
  };
}

export type PersonenSpeicher = ReturnType<typeof personenSpeicher>;

export interface Konto {
  id: string;
  name: string;
}

/**
 * Übergibt den anonymen Speicher an `ziel` und leert ihn — ein VERSCHIEBEN,
 * kein Kopieren: danach gibt es ihn nicht mehr, ein späteres Konto B kann ihn
 * also nicht ein zweites Mal übernehmen (anders als der frühere, pro Teilnehmer
 * geführte Übernahme-Marker, bei dem jedes neue Konto denselben Speicher erbte).
 */
function anonymUebernehmen(ziel: PersonenSpeicher): void {
  const anon = personenSpeicher(ANONYM);
  const queue = anon.queueLesen();
  const anonFortschritt = anon.fortschrittLesen();
  const hatDurchfuehrungen = Object.values(anonFortschritt).some((f) => f.durchfuehrungen.length > 0);
  if (queue.length === 0 && !hatDurchfuehrungen) {
    anon.vergessen();
    return;
  }
  ziel.queueAnfuegenMehrere(queue);

  // Sichtbarer Stand: anonyme Durchführungen und die anonym gesetzten
  // Aufgaben-Status in den Fortschritt des Kontos legen, damit sie auch offline
  // sofort unter dem Konto erscheinen. Der nächste Sync macht daraus den Serverstand.
  const statusAusQueue = new Set(queue.filter((q) => q.art === "taskStatus").map((q) => q.daten.taskId));
  const state = ziel.fortschrittStateLesen();
  const map: FortschrittMap = { ...state.fortschritt };
  for (const [taskId, f] of Object.entries(anonFortschritt)) {
    const vorhanden = map[taskId];
    if (!vorhanden) {
      map[taskId] = f;
      continue;
    }
    const ids = new Set(vorhanden.durchfuehrungen.map((d) => d.id));
    map[taskId] = {
      ...vorhanden,
      ...(statusAusQueue.has(taskId) ? { zielanzahl: f.zielanzahl, nichtAnwendbar: f.nichtAnwendbar } : {}),
      durchfuehrungen: [...vorhanden.durchfuehrungen, ...f.durchfuehrungen.filter((d) => !ids.has(d.id))],
    };
  }
  ziel.fortschrittSchreiben({ schemaVersion: SCHEMA_VERSION, fortschritt: map });
  anon.vergessen();
}

/**
 * Einmalige Migration der Alt-Keys ohne Besitzer (uav-praxis und Suite vor
 * DRK-286) an das ERSTE Konto, das der Server nach dem Update bestätigt — also
 * an die Person, deren Cookie der Browser gerade trägt.
 *
 * Bewusste Entscheidung (im Ticket offen gelassen): nicht pauschal löschen —
 * dort kann offene, nie gesendete Arbeit liegen —, aber auch nicht als
 * sichtbaren Stand übernehmen, denn auf einem geteilten Gerät kann er Namen und
 * Einträge der vorigen Person tragen.
 *  - Die offene Queue geht in die Queue des Kontos (vor DRK-286 wäre sie ohnehin
 *    unter genau diesem Cookie gesendet worden).
 *  - Der Fortschritt wird NICHT angezeigt, sondern als Altbestand abgelegt;
 *    `snapshotAnwenden` queut nach dem ersten Sync daraus nur, was der Server
 *    für dieses Konto noch nicht kennt.
 *  - Was davon auf dem Server einer anderen Person gehört, weist er ab
 *    (DRK-285), und `fremdeEntfernen` verwirft es — es erreicht dieses Konto nie.
 *  - Danach sind die Alt-Keys weg; ein zweites Konto übernimmt nichts mehr.
 * Die Team-Vorbelegung (zwei Namen) ist keine offene Arbeit und fällt weg.
 */
function altbestandUebernehmen(ziel: PersonenSpeicher): void {
  const altQueue = lesen<QueueEintrag[] | null>(ALT_KEYS.queue, null);
  const altState = lesen<AppState | null>(ALT_KEYS.fortschritt, null);
  if (Array.isArray(altQueue) && altQueue.length > 0) ziel.queueAnfuegenMehrere(altQueue);
  if (altState?.fortschritt && Object.keys(altState.fortschritt).length > 0) {
    ziel.altbestandSchreiben({ ...(ziel.altbestandLesen() ?? {}), ...altState.fortschritt });
  }
  for (const k of Object.values(ALT_KEYS)) entfernen(k);
}

/**
 * Räumt die persönlichen Speicher ANDERER Konten ab, die nichts Offenes mehr
 * tragen: ihr Stand liegt vollständig auf dem Server und kommt beim nächsten
 * Login dieser Person von dort zurück. Wer noch offene Arbeit hat, bleibt
 * unangetastet — sie wird gesendet, sobald diese Person sich wieder anmeldet.
 */
function fremdeSpeicherAufraeumen(behalten: string): void {
  const besitzer = new Set<string>();
  for (const k of alleSchluessel()) {
    for (const basis of PERSOENLICHE_BASEN) {
      if (k.startsWith(`${basis}:`)) besitzer.add(k.slice(basis.length + 1));
    }
  }
  for (const b of besitzer) {
    if (b === behalten || b === ANONYM) continue;
    const s = personenSpeicher(b);
    if (s.queueLesen().length === 0 && s.altbestandLesen() == null) s.vergessen();
  }
}

export const localStore = {
  // ── Katalog (geräteweit, nicht persönlich) ────────────────────────────────
  tasksLesen(): TaskDTO[] | null {
    return lesen<TaskDTO[] | null>(KATALOG_KEY, null);
  },

  tasksSchreiben(tasks: TaskDTO[]): void {
    schreiben(KATALOG_KEY, tasks);
  },

  /** Effektiver Katalog für die UI: gecacht, sonst leer (Spec §2, kein Seed). */
  katalog(): TaskDTO[] {
    return katalogLesen();
  },

  /** Abonniert Fortschritt-Änderungen EINES Besitzers (z. B. nach Sync). */
  fortschrittAbonnieren(besitzer: string, listener: FortschrittListener): () => void {
    let set = fortschrittListener.get(besitzer);
    if (!set) {
      set = new Set();
      fortschrittListener.set(besitzer, set);
    }
    const eigene = set;
    eigene.add(listener);
    return () => {
      eigene.delete(listener);
    };
  },

  // ── Konto (DRK-286) ────────────────────────────────────────────────────────
  /**
   * Das zuletzt vom SERVER bestätigte Teilnehmerkonto dieses Browsers — die
   * Weiche, welcher persönliche Speicher gezeigt wird, solange `api.me()`
   * (offline) nicht antwortet. Keine Zugriffsentscheidung: gesendet wird immer
   * mit dem erwarteten Besitzer, und der Server weist einen Unterschied zum
   * Cookie ab (`konto_gewechselt`).
   */
  kontoLesen(): Konto | null {
    const k = lesen<Konto | null>(KONTO_KEY, null);
    return k && typeof k.id === "string" && k.id.length > 0 ? k : null;
  },

  /**
   * Der Server hat eine Identität bestätigt (`api.me()`). Für ein
   * Teilnehmerkonto: als Konto merken, Alt-Keys einmalig und anonyme Erfassung
   * übergeben, verwaiste fremde Speicher abräumen. Für anon/admin: kein Konto
   * mehr — offline wird dann nichts Persönliches einer Person mehr gezeigt.
   */
  kontoBestaetigt(identity: Identity): void {
    if (identity.kind !== "participant") {
      entfernen(KONTO_KEY);
      return;
    }
    schreiben(KONTO_KEY, { id: identity.id, name: identity.name } satisfies Konto);
    const ziel = personenSpeicher(identity.id);
    altbestandUebernehmen(ziel);
    anonymUebernehmen(ziel);
    fremdeSpeicherAufraeumen(identity.id);
  },

  /**
   * Nach jedem erfolgreichen Login und VOR dem Reload aufzurufen: der Browser
   * trägt jetzt ein anderes Cookie. Konto-Weiche und Identitäts-Cache des Tabs
   * verwerfen, damit der Reload nicht mit dem Stand der vorigen Person startet.
   */
  kontoWechselVorbereiten(): void {
    entfernen(KONTO_KEY);
    try {
      sessionStorage.removeItem(IDENTITY_SESSION_KEY);
    } catch {
      // nicht verfügbar — nichts zu tun
    }
  },
};

/**
 * Der Besitzer, dessen Speicher die App zeigt: das bestätigte Teilnehmerkonto;
 * solange nichts bestätigt ist (offline), das zuletzt bestätigte Konto dieses
 * Browsers; sonst die anonyme Erfassung. Eine bestätigte anon/admin-Identität
 * zeigt nie den Speicher einer Person.
 */
export function besitzerFuer(identity: Identity | null): string {
  if (identity?.kind === "participant") return identity.id;
  if (identity === null) return localStore.kontoLesen()?.id ?? ANONYM;
  return ANONYM;
}
