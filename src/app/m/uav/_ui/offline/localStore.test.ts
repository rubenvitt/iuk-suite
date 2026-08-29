/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { localStore } from "./localStore";

beforeEach(() => localStorage.clear());

describe("localStore — die Alt-Keys tragen den Umzug", () => {
  it("liest eine Queue, die die Alt-Anwendung unter drk-drohnen-sync-queue hinterlassen hat", () => {
    localStorage.setItem("drk-drohnen-sync-queue", JSON.stringify([
      { art: "execution", daten: { id: "alt-1", taskId: "1-1", datum: "2026-08-20", drohnensteuerer: "A", luftraumbeobachter: "B" } },
      { art: "taskStatus", daten: { taskId: "1-2", zielanzahl: 3, nichtAnwendbar: false, updatedAt: "2026-08-20T10:00:00.000Z" } },
    ]));
    const m = localStore.queueAlsSyncMutationen();
    expect(m.executions.map((e) => e.id)).toEqual(["alt-1"]);
    expect(m.taskStatus[0].zielanzahl).toBe(3);
  });
  it("schreibt unter den Alt-Keys, nicht unter neuen", () => {
    localStore.lastSyncSchreiben("2026-08-28T00:00:00.000Z");
    localStore.tasksSchreiben([]);
    expect(Object.keys(localStorage).sort()).toEqual(["drk-drohnen-katalog", "drk-drohnen-last-sync"]);
  });
  it("queueAnfuegen ersetzt eine Execution gleicher id und hält beim TaskStatus den jüngeren Stand", () => {
    localStore.queueAnfuegen({ art: "execution", daten: { id: "x", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" } });
    localStore.queueAnfuegen({ art: "execution", daten: { id: "x", taskId: "1-1", datum: "2026-08-02", drohnensteuerer: "", luftraumbeobachter: "" } });
    localStore.queueAnfuegen({ art: "taskStatus", daten: { taskId: "1-1", zielanzahl: 2, nichtAnwendbar: false, updatedAt: "2026-08-02T00:00:00.000Z" } });
    localStore.queueAnfuegen({ art: "taskStatus", daten: { taskId: "1-1", zielanzahl: 9, nichtAnwendbar: false, updatedAt: "2026-08-01T00:00:00.000Z" } });
    const q = localStore.queueLesen();
    expect(q).toHaveLength(2);
    expect(q.find((e) => e.art === "execution")?.daten).toMatchObject({ datum: "2026-08-02" });
    expect(q.find((e) => e.art === "taskStatus")?.daten).toMatchObject({ zielanzahl: 2 });
  });
  it("snapshotAnwenden: Tombstones löschen, pending gewinnt, Ziel mindestens 1", () => {
    localStore.tasksSchreiben([{ id: "1-1", teil: 1, nummer: "1.1", titel: "t", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 0, aktiv: true }]);
    const state = localStore.snapshotAnwenden(
      { executions: [{ id: "a", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" }, { id: "b", taskId: "1-1", datum: "2026-08-02", drohnensteuerer: "", luftraumbeobachter: "", deletedAt: "2026-08-03T00:00:00.000Z" }], taskStatus: [], serverTime: "2026-08-28T00:00:00.000Z" },
      { executions: [], taskStatus: [{ taskId: "1-1", zielanzahl: 0, nichtAnwendbar: false, updatedAt: "x" }] },
    );
    expect(state.fortschritt["1-1"].durchfuehrungen.map((d) => d.id)).toEqual(["a"]);
    expect(state.fortschritt["1-1"].zielanzahl).toBe(1);
  });
});
