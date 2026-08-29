import type { SyncRequest } from "../../_lib/typen";
import { api, ApiError } from "./client";
import { localStore } from "./localStore";

/**
 * Push/Pull-Sync gegen `/api/sync` (§9):
 *  - Push: in der Queue gesammelte Execution-/TaskStatus-Mutationen,
 *  - Pull: autoritativer Server-Snapshot → lokale Reconciliation,
 *  - Online-Erkennung (`navigator.onLine` + online/offline-Events),
 *  - Debounce nach Mutation (~2s) und periodisches Intervall (~60s),
 *  - Status-Subscription (`'online' | 'offline' | 'syncing' | 'synced' | 'fehler'`).
 *
 * Bei Netzfehlern bleibt die Engine still: Queue wird behalten, später erneut
 * versucht. Die Queue wird erst nach erfolgreichem Sync geleert.
 */
export type SyncStatus = "online" | "offline" | "syncing" | "synced" | "fehler";

type StatusListener = (status: SyncStatus) => void;

const DEBOUNCE_MS = 2000;
const INTERVALL_MS = 60_000;

function online(): boolean {
  // In Nicht-Browser-Umgebungen (Tests) als online behandeln.
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

class SyncEngine {
  private status: SyncStatus = online() ? "online" : "offline";
  private listener = new Set<StatusListener>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private laeuft = false;
  private erneutAnfordern = false;
  private aktiv = false;
  private readonly onOnline = () => {
    this.setzeStatus("online");
    void this.triggerSync();
  };
  private readonly onOffline = () => this.setzeStatus("offline");

  // ── Status ──────────────────────────────────────────────────────────────────
  statusLesen(): SyncStatus {
    return this.status;
  }

  abonnieren(listener: StatusListener): () => void {
    this.listener.add(listener);
    listener(this.status);
    return () => this.listener.delete(listener);
  }

  private setzeStatus(status: SyncStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const l of this.listener) l(status);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  /** Startet Trigger (online-Events, Intervall) und einen ersten Sync. */
  start(): () => void {
    if (this.aktiv) return () => this.stop();
    this.aktiv = true;
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onOnline);
      window.addEventListener("offline", this.onOffline);
    }
    this.setzeStatus(online() ? "online" : "offline");
    this.intervalTimer = setInterval(() => {
      void this.triggerSync();
    }, INTERVALL_MS);
    void this.triggerSync();
    return () => this.stop();
  }

  stop(): void {
    this.aktiv = false;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onOnline);
      window.removeEventListener("offline", this.onOffline);
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Nach einer Mutation aufzurufen: debounced einen Sync (~2s).
   *
   * Reviewer-Fund (Fix-Runde 2): ohne den `aktiv`-Wächter löste eine Mutation
   * VOR `start()` — also vor einer bestätigten Teilnehmer-Identität
   * (`TeilnehmerApp.tsx` startet die Engine erst dann) — nach der Debounce-
   * Zeit trotzdem einen echten `POST /api/sync` aus. Das Ergebnis war ein
   * 401 und der `SyncStatus`-Chip zeigte „Sync fehlgeschlagen" schon auf dem
   * Anmelde-Hinweis-Bildschirm. Ungefährlich für die Queue selbst (die Sweep-
   * Logik in `localStore.queueAnfuegen` läuft unabhängig davon weiter) —
   * `start()` stößt beim Aktivieren ohnehin sofort `triggerSync()` an, ein
   * bereits gequeuter Eintrag geht also nicht verloren, nur der verfrühte
   * Versuch entfällt.
   */
  mutationGemeldet(): void {
    if (!this.aktiv) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.triggerSync();
    }, DEBOUNCE_MS);
  }

  // ── Sync ─────────────────────────────────────────────────────────────────────
  /**
   * Stößt einen Sync-Durchlauf an. Mehrere parallele Aufrufe werden serialisiert
   * (ein laufender Sync; ein nachfolgender wird einmal nachgeholt).
   */
  async triggerSync(): Promise<void> {
    if (this.laeuft) {
      this.erneutAnfordern = true;
      return;
    }
    this.laeuft = true;
    try {
      await this.syncJetzt();
    } finally {
      this.laeuft = false;
      if (this.erneutAnfordern) {
        this.erneutAnfordern = false;
        void this.triggerSync();
      }
    }
  }

  /**
   * Führt genau EINEN Push+Pull aus: schiebt die Queue, wendet den autoritativen
   * Snapshot lokal an (Reconciliation), leert die Queue, setzt `lastSync`.
   * Bei Offline/Netzfehler still bleiben (Queue behalten).
   */
  async syncJetzt(): Promise<void> {
    if (!online()) {
      this.setzeStatus("offline");
      return;
    }
    // Momentaufnahme der Queue, die tatsächlich gepusht wird. Nach Erfolg werden
    // NUR diese bestätigten Einträge entfernt — Mutationen, die während des
    // laufenden Syncs neu in die Queue kommen, bleiben erhalten (§9).
    const gesendet = localStore.queueLesen();
    const { executions, taskStatus } = localStore.queueAlsSyncMutationen();
    const req: SyncRequest = {
      since: localStore.lastSyncLesen(),
      executions,
      taskStatus,
    };

    this.setzeStatus("syncing");
    try {
      const snapshot = await api.sync(req);
      // Erst nach Erfolg: bestätigte Queue-Einträge entfernen (nur unveränderte),
      // lastSync setzen, dann den autoritativen Snapshot anwenden.
      localStore.queueBestaetigteEntfernen(gesendet);
      localStore.lastSyncSchreiben(snapshot.serverTime);
      // Server autoritativ, ABER die noch in der Queue verbliebenen (während des
      // Syncs eingegangenen, noch unbestätigten) Mutationen ÜBER den Snapshot
      // legen, damit eine frische lokale Änderung nicht kurzzeitig aus der UI
      // verschwindet (echter Merge statt reines Replace, §9).
      const pending = localStore.queueAlsSyncMutationen();
      localStore.snapshotAnwenden(snapshot, pending);
      this.setzeStatus("synced");
    } catch (e) {
      // Netz-/Server-Fehler: Queue behalten, später erneut.
      if (e instanceof ApiError && e.status === 0) {
        this.setzeStatus("offline");
      } else {
        this.setzeStatus("fehler");
      }
    }
  }
}

export const syncEngine = new SyncEngine();
