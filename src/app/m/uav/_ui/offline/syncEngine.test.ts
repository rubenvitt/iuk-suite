/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ANONYM, personenSpeicher } from "./localStore";

const P = personenSpeicher("p1");
import { syncEngine } from "./syncEngine";
import { api, ApiError } from "./client";

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("syncEngine", () => {
  it("schickt die Queue, entfernt nur Bestätigtes, schreibt lastSync und wendet den Snapshot an", async () => {
    P.queueAnfuegen({ art: "execution", daten: { id: "q1", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" } });
    const spy = vi.spyOn(api, "sync").mockResolvedValue({ executions: [], taskStatus: [], serverTime: "2026-08-28T12:00:00.000Z" });
    await syncEngine.syncJetzt("p1");
    expect(spy.mock.calls[0][0].executions.map((e) => e.id)).toEqual(["q1"]);
    expect(P.queueLesen()).toEqual([]);
    expect(P.lastSyncLesen()).toBe("2026-08-28T12:00:00.000Z");
    expect(syncEngine.statusLesen()).toBe("synced");
  });
  it("Netzfehler (status 0) → offline, Queue bleibt", async () => {
    P.queueAnfuegen({ art: "execution", daten: { id: "q1", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" } });
    vi.spyOn(api, "sync").mockRejectedValue(new ApiError(0, "network_error", "x"));
    await syncEngine.syncJetzt("p1");
    expect(P.queueLesen()).toHaveLength(1);
    expect(syncEngine.statusLesen()).toBe("offline");
  });
  it("401 → fehler (nicht offline), Queue bleibt", async () => {
    vi.spyOn(api, "sync").mockRejectedValue(new ApiError(401, "unauthorized", "x"));
    await syncEngine.syncJetzt("p1");
    expect(syncEngine.statusLesen()).toBe("fehler");
  });

  // Reviewer-Fund, Fix-Runde 1: `snapshotAnwenden`s neue Nachqueue-Logik für
  // lokal-only Executions darf eine bereits erfolgreich gepushte Execution
  // NICHT jeden Zyklus erneut queuen — `sync()` liefert serverseitig immer den
  // VOLLEN Bestand (verifiziert in `_lib/queries.ts#fortschritt`, kein Delta
  // über `since`), die soeben gesendete Execution taucht also im Snapshot
  // wieder auf und gilt damit als "bekannt". Ohne diese Prüfung bliebe die
  // Queue nie leer, solange der lokale Fortschritt den Eintrag noch führt.
  it("eine erfolgreich gepushte Execution bleibt draußen, obwohl sie lokal weiter im Fortschritt steht", async () => {
    P.fortschrittSchreiben({
      schemaVersion: 1,
      fortschritt: {
        "1-1": { zielanzahl: 1, nichtAnwendbar: false, durchfuehrungen: [{ id: "q1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" }] },
      },
    });
    P.queueAnfuegen({ art: "execution", daten: { id: "q1", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" } });
    vi.spyOn(api, "sync").mockResolvedValue({
      executions: [{ id: "q1", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" }],
      taskStatus: [],
      serverTime: "2026-08-28T12:00:00.000Z",
    });
    await syncEngine.syncJetzt("p1");
    expect(P.queueLesen()).toEqual([]);
  });

  // Reviewer-Fund, Fix-Runde 2: `mutationGemeldet()` hatte keinen `aktiv`-
  // Wächter. Eine Mutation vor bestätigter Identität (bevor `TeilnehmerApp`
  // `syncEngine.start()` je aufgerufen hat) löste trotzdem nach ~2s einen
  // echten `POST /api/sync` aus — 401, und der SyncStatus-Chip zeigte „Sync
  // fehlgeschlagen" schon auf dem Anmelde-Hinweis-Bildschirm.
  it("mutationGemeldet() vor start() löst keinen Sync aus", async () => {
    syncEngine.stop(); // sicherstellen: nicht aktiv, unabhängig von der Testreihenfolge
    const spy = vi.spyOn(api, "sync");
    vi.useFakeTimers();
    try {
      syncEngine.mutationGemeldet();
      await vi.advanceTimersByTimeAsync(2100);
    } finally {
      vi.useRealTimers();
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("syncEngine — Besitzerbindung (DRK-286) und fremde IDs (DRK-285)", () => {
  const e = (id: string) => ({ id, taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" });

  it("sendet den erwarteten Besitzer mit und sendet für den anonymen Speicher nie", async () => {
    const spy = vi.spyOn(api, "sync").mockResolvedValue({ executions: [], taskStatus: [], serverTime: "t" });
    await syncEngine.syncJetzt("p1");
    expect(spy.mock.calls[0][0].teilnehmerId).toBe("p1");
    await syncEngine.syncJetzt(ANONYM);
    await syncEngine.syncJetzt(null);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("409 fremde_durchfuehrung: die genannten IDs fliegen raus, der Rest wird erneut gesendet", async () => {
    P.queueAnfuegen({ art: "execution", daten: e("fremd") });
    P.queueAnfuegen({ art: "execution", daten: e("eigen") });
    const spy = vi.spyOn(api, "sync")
      .mockRejectedValueOnce(new ApiError(409, "fremde_durchfuehrung", "x", ["fremd"]))
      .mockResolvedValue({ executions: [e("eigen")], taskStatus: [], serverTime: "t" });
    const stop = syncEngine.start("p1");
    try {
      await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(P.queueLesen()).toEqual([]));
    } finally {
      stop();
    }
    expect(spy.mock.calls[1][0].executions.map((x) => x.id)).toEqual(["eigen"]);
  });

  it("409 konto_gewechselt: Queue bleibt, die App wird benachrichtigt", async () => {
    P.queueAnfuegen({ art: "execution", daten: e("eigen") });
    vi.spyOn(api, "sync").mockRejectedValue(new ApiError(409, "konto_gewechselt", "x"));
    const beiWechsel = vi.fn();
    const stop = syncEngine.start("p1", beiWechsel);
    try {
      await vi.waitFor(() => expect(beiWechsel).toHaveBeenCalledTimes(1));
    } finally {
      stop();
    }
    expect(P.queueLesen()).toHaveLength(1);
  });

  it("eine verspätete Antwort landet im Speicher des Besitzers, für den sie angefragt wurde", async () => {
    P.queueAnfuegen({ art: "execution", daten: e("a-1") });
    let loesen: (v: { executions: ReturnType<typeof e>[]; taskStatus: []; serverTime: string }) => void = () => {};
    vi.spyOn(api, "sync").mockImplementationOnce(() => new Promise((r) => { loesen = r; }));
    const lauf = syncEngine.syncJetzt("p1");
    // Inzwischen: Wechsel auf p2.
    const stop = syncEngine.start("p2");
    stop();
    loesen({ executions: [e("a-1")], taskStatus: [], serverTime: "t" });
    await lauf;
    expect(P.queueLesen()).toEqual([]);
    expect(P.lastSyncLesen()).toBe("t");
    expect(personenSpeicher("p2").lastSyncLesen()).toBeNull();
    expect(personenSpeicher("p2").fortschrittLesen()).toEqual({});
  });
});
