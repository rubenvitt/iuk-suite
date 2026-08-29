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

  it("ein lokal-only Eintrag (weder Snapshot noch Queue) übersteht snapshotAnwenden und landet in der Queue", () => {
    localStore.tasksSchreiben([{ id: "1-1", teil: 1, nummer: "1.1", titel: "t", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 0, aktiv: true }]);
    // Entstand, während die Teilnehmer-Identität noch nicht bestätigt war (oder
    // die Alt-App den Übernahme-Marker schon gesetzt hatte) — nie gepusht,
    // taucht deshalb weder im Snapshot noch in der Queue auf.
    localStore.fortschrittSchreiben({
      schemaVersion: 1,
      fortschritt: {
        "1-1": { zielanzahl: 2, nichtAnwendbar: false, durchfuehrungen: [{ id: "lokal-1", datum: "2026-08-15", drohnensteuerer: "A", luftraumbeobachter: "B" }] },
      },
    });

    const state = localStore.snapshotAnwenden(
      { executions: [], taskStatus: [], serverTime: "2026-08-28T00:00:00.000Z" },
      { executions: [], taskStatus: [] },
    );

    expect(state.fortschritt["1-1"].durchfuehrungen.map((d) => d.id)).toEqual(["lokal-1"]);
    const queue = localStore.queueLesen();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ art: "execution", daten: { id: "lokal-1", taskId: "1-1" } });
  });

  it("ein auf einem anderen Gerät gelöschter Eintrag verschwindet trotz lokalem Bestand (kein Resurrect)", () => {
    localStore.tasksSchreiben([{ id: "1-1", teil: 1, nummer: "1.1", titel: "t", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 0, aktiv: true }]);
    localStore.fortschrittSchreiben({
      schemaVersion: 1,
      fortschritt: {
        "1-1": { zielanzahl: 2, nichtAnwendbar: false, durchfuehrungen: [{ id: "b", datum: "2026-08-02", drohnensteuerer: "", luftraumbeobachter: "" }] },
      },
    });

    const state = localStore.snapshotAnwenden(
      { executions: [{ id: "b", taskId: "1-1", datum: "2026-08-02", drohnensteuerer: "", luftraumbeobachter: "", deletedAt: "2026-08-03T00:00:00.000Z" }], taskStatus: [], serverTime: "2026-08-28T00:00:00.000Z" },
      { executions: [], taskStatus: [] },
    );

    expect(state.fortschritt["1-1"].durchfuehrungen).toEqual([]);
    expect(localStore.queueLesen()).toEqual([]);
  });

  it("ein lokal-only Aufgabenstatus (weder Snapshot noch Queue) übersteht snapshotAnwenden und landet in der Queue", () => {
    localStore.tasksSchreiben([{ id: "1-1", teil: 1, nummer: "1.1", titel: "t", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 0, aktiv: true }]);
    // Zielanzahl 5 weicht vom Katalog-Default (2) ab — entstand, während die
    // Teilnehmer-Identität noch nicht bestätigt war, taucht deshalb weder im
    // Snapshot noch in der Queue auf.
    localStore.fortschrittSchreiben({
      schemaVersion: 1,
      fortschritt: { "1-1": { zielanzahl: 5, nichtAnwendbar: false, durchfuehrungen: [] } },
    });

    const state = localStore.snapshotAnwenden(
      { executions: [], taskStatus: [], serverTime: "2026-08-28T00:00:00.000Z" },
      { executions: [], taskStatus: [] },
    );

    expect(state.fortschritt["1-1"].zielanzahl).toBe(5);
    const queue = localStore.queueLesen();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ art: "taskStatus", daten: { taskId: "1-1", zielanzahl: 5 } });
  });
});
