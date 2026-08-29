/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { localStore } from "./localStore";
import { syncEngine } from "./syncEngine";
import { api, ApiError } from "./client";

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("syncEngine", () => {
  it("schickt die Queue, entfernt nur Bestätigtes, schreibt lastSync und wendet den Snapshot an", async () => {
    localStore.queueAnfuegen({ art: "execution", daten: { id: "q1", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" } });
    const spy = vi.spyOn(api, "sync").mockResolvedValue({ executions: [], taskStatus: [], serverTime: "2026-08-28T12:00:00.000Z" });
    await syncEngine.syncJetzt();
    expect(spy.mock.calls[0][0].executions.map((e) => e.id)).toEqual(["q1"]);
    expect(localStore.queueLesen()).toEqual([]);
    expect(localStore.lastSyncLesen()).toBe("2026-08-28T12:00:00.000Z");
    expect(syncEngine.statusLesen()).toBe("synced");
  });
  it("Netzfehler (status 0) → offline, Queue bleibt", async () => {
    localStore.queueAnfuegen({ art: "execution", daten: { id: "q1", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" } });
    vi.spyOn(api, "sync").mockRejectedValue(new ApiError(0, "network_error", "x"));
    await syncEngine.syncJetzt();
    expect(localStore.queueLesen()).toHaveLength(1);
    expect(syncEngine.statusLesen()).toBe("offline");
  });
  it("401 → fehler (nicht offline), Queue bleibt", async () => {
    vi.spyOn(api, "sync").mockRejectedValue(new ApiError(401, "unauthorized", "x"));
    await syncEngine.syncJetzt();
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
    localStore.fortschrittSchreiben({
      schemaVersion: 1,
      fortschritt: {
        "1-1": { zielanzahl: 1, nichtAnwendbar: false, durchfuehrungen: [{ id: "q1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" }] },
      },
    });
    localStore.queueAnfuegen({ art: "execution", daten: { id: "q1", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" } });
    vi.spyOn(api, "sync").mockResolvedValue({
      executions: [{ id: "q1", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" }],
      taskStatus: [],
      serverTime: "2026-08-28T12:00:00.000Z",
    });
    await syncEngine.syncJetzt();
    expect(localStore.queueLesen()).toEqual([]);
  });
});
