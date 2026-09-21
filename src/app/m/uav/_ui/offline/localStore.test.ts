/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { ANONYM, besitzerFuer, localStore, personenSpeicher } from "./localStore";

const P = personenSpeicher("p1");

beforeEach(() => localStorage.clear());

describe("localStore — persönlicher Speicher je Besitzer", () => {
  it("schreibt unter Schlüsseln MIT Besitzer, der Katalog bleibt geräteweit", () => {
    P.lastSyncSchreiben("2026-08-28T00:00:00.000Z");
    localStore.tasksSchreiben([]);
    expect(Object.keys(localStorage).sort()).toEqual(["drk-drohnen-katalog", "drk-drohnen-last-sync:p1"]);
  });
  it("queueAnfuegen ersetzt eine Execution gleicher id und hält beim TaskStatus den jüngeren Stand", () => {
    P.queueAnfuegen({ art: "execution", daten: { id: "x", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "", luftraumbeobachter: "" } });
    P.queueAnfuegen({ art: "execution", daten: { id: "x", taskId: "1-1", datum: "2026-08-02", drohnensteuerer: "", luftraumbeobachter: "" } });
    P.queueAnfuegen({ art: "taskStatus", daten: { taskId: "1-1", zielanzahl: 2, nichtAnwendbar: false, updatedAt: "2026-08-02T00:00:00.000Z" } });
    P.queueAnfuegen({ art: "taskStatus", daten: { taskId: "1-1", zielanzahl: 9, nichtAnwendbar: false, updatedAt: "2026-08-01T00:00:00.000Z" } });
    const q = P.queueLesen();
    expect(q).toHaveLength(2);
    expect(q.find((e) => e.art === "execution")?.daten).toMatchObject({ datum: "2026-08-02" });
    expect(q.find((e) => e.art === "taskStatus")?.daten).toMatchObject({ zielanzahl: 2 });
  });
  it("snapshotAnwenden: Tombstones löschen, pending gewinnt, Ziel mindestens 1", () => {
    localStore.tasksSchreiben([{ id: "1-1", teil: 1, nummer: "1.1", titel: "t", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 0, aktiv: true }]);
    const state = P.snapshotAnwenden(
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
    P.fortschrittSchreiben({
      schemaVersion: 1,
      fortschritt: {
        "1-1": { zielanzahl: 2, nichtAnwendbar: false, durchfuehrungen: [{ id: "lokal-1", datum: "2026-08-15", drohnensteuerer: "A", luftraumbeobachter: "B" }] },
      },
    });

    const state = P.snapshotAnwenden(
      { executions: [], taskStatus: [], serverTime: "2026-08-28T00:00:00.000Z" },
      { executions: [], taskStatus: [] },
    );

    expect(state.fortschritt["1-1"].durchfuehrungen.map((d) => d.id)).toEqual(["lokal-1"]);
    const queue = P.queueLesen();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ art: "execution", daten: { id: "lokal-1", taskId: "1-1" } });
  });

  it("ein auf einem anderen Gerät gelöschter Eintrag verschwindet trotz lokalem Bestand (kein Resurrect)", () => {
    localStore.tasksSchreiben([{ id: "1-1", teil: 1, nummer: "1.1", titel: "t", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 0, aktiv: true }]);
    P.fortschrittSchreiben({
      schemaVersion: 1,
      fortschritt: {
        "1-1": { zielanzahl: 2, nichtAnwendbar: false, durchfuehrungen: [{ id: "b", datum: "2026-08-02", drohnensteuerer: "", luftraumbeobachter: "" }] },
      },
    });

    const state = P.snapshotAnwenden(
      { executions: [{ id: "b", taskId: "1-1", datum: "2026-08-02", drohnensteuerer: "", luftraumbeobachter: "", deletedAt: "2026-08-03T00:00:00.000Z" }], taskStatus: [], serverTime: "2026-08-28T00:00:00.000Z" },
      { executions: [], taskStatus: [] },
    );

    expect(state.fortschritt["1-1"].durchfuehrungen).toEqual([]);
    expect(P.queueLesen()).toEqual([]);
  });

  it("ein lokal-only Aufgabenstatus (weder Snapshot noch Queue) übersteht snapshotAnwenden und landet in der Queue", () => {
    localStore.tasksSchreiben([{ id: "1-1", teil: 1, nummer: "1.1", titel: "t", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 0, aktiv: true }]);
    // Zielanzahl 5 weicht vom Katalog-Default (2) ab — entstand, während die
    // Teilnehmer-Identität noch nicht bestätigt war, taucht deshalb weder im
    // Snapshot noch in der Queue auf.
    P.fortschrittSchreiben({
      schemaVersion: 1,
      fortschritt: { "1-1": { zielanzahl: 5, nichtAnwendbar: false, durchfuehrungen: [] } },
    });

    const state = P.snapshotAnwenden(
      { executions: [], taskStatus: [], serverTime: "2026-08-28T00:00:00.000Z" },
      { executions: [], taskStatus: [] },
    );

    expect(state.fortschritt["1-1"].zielanzahl).toBe(5);
    const queue = P.queueLesen();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ art: "taskStatus", daten: { taskId: "1-1", zielanzahl: 5 } });
  });
});

const KAT = [{ id: "1-1", teil: 1 as const, nummer: "1.1", titel: "t", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 0, aktiv: true }];
const ex = (id: string, name = "") => ({ id, taskId: "1-1", datum: "2026-08-01", drohnensteuerer: name, luftraumbeobachter: "" });
const leererSnapshot = { executions: [], taskStatus: [], serverTime: "2026-09-21T00:00:00.000Z" };

describe("Konto-Bindung (DRK-286)", () => {
  it("Altbestand ohne Besitzer: Queue geht an das erste bestätigte Konto, der Fortschritt wird NICHT angezeigt, die Alt-Keys verschwinden", () => {
    localStore.tasksSchreiben(KAT);
    localStorage.setItem("drk-drohnen-sync-queue", JSON.stringify([{ art: "execution", daten: ex("alt-offen", "Alt Offen") }]));
    localStorage.setItem("drk-drohnen-fortschritt", JSON.stringify({ schemaVersion: 1, fortschritt: { "1-1": { zielanzahl: 2, nichtAnwendbar: false, durchfuehrungen: [ex("alt-lokal", "Alt Lokal")] } } }));
    localStorage.setItem("drk-drohnen-uebernommen", JSON.stringify(["x"]));
    localStorage.setItem("df:letztes-team", JSON.stringify({ drohnensteuerer: "Vorige", luftraumbeobachter: "Person" }));

    localStore.kontoBestaetigt({ kind: "participant", id: "p1", name: "P" });

    expect(P.queueLesen().map((q) => (q.daten as { id: string }).id)).toEqual(["alt-offen"]);
    expect(P.fortschrittLesen()).toEqual({});
    for (const k of ["drk-drohnen-sync-queue", "drk-drohnen-fortschritt", "drk-drohnen-uebernommen", "df:letztes-team"]) expect(localStorage.getItem(k)).toBeNull();

    // Erst nach dem ersten Sync: was der Server nicht kennt, wird nachgequeut.
    P.queueLeeren();
    const state = P.snapshotAnwenden(leererSnapshot);
    expect(P.queueLesen().map((q) => (q.daten as { id: string }).id)).toEqual(["alt-lokal"]);
    // Gequeut, aber NICHT angezeigt — erst ein Snapshot, der ihn enthält, zeigt ihn.
    expect(state.fortschritt["1-1"].durchfuehrungen).toEqual([]);
    expect(P.altbestandLesen()).toBeNull();

    // Ein zweites Konto übernimmt nichts mehr.
    localStore.kontoBestaetigt({ kind: "participant", id: "p2", name: "Q" });
    expect(personenSpeicher("p2").queueLesen()).toEqual([]);
    expect(personenSpeicher("p2").fortschrittLesen()).toEqual({});
  });

  it("anonyme Erfassung wird VERSCHOBEN, nicht kopiert — genau ein Konto bekommt sie", () => {
    const anon = personenSpeicher(ANONYM);
    anon.queueAnfuegen({ art: "execution", daten: ex("anon-1", "Otto") });
    anon.fortschrittSchreiben({ schemaVersion: 1, fortschritt: { "1-1": { zielanzahl: 2, nichtAnwendbar: false, durchfuehrungen: [ex("anon-1", "Otto")] } } });

    localStore.kontoBestaetigt({ kind: "participant", id: "p1", name: "P" });
    expect(P.queueLesen()).toHaveLength(1);
    expect(P.fortschrittLesen()["1-1"].durchfuehrungen.map((d) => d.drohnensteuerer)).toEqual(["Otto"]);
    expect(anon.queueLesen()).toEqual([]);

    localStore.kontoBestaetigt({ kind: "participant", id: "p2", name: "Q" });
    expect(personenSpeicher("p2").queueLesen()).toEqual([]);
  });

  it("räumt fremde Speicher ohne offene Arbeit ab, behält die mit offener Arbeit", () => {
    const erledigt = personenSpeicher("fertig");
    erledigt.fortschrittSchreiben({ schemaVersion: 1, fortschritt: { "1-1": { zielanzahl: 2, nichtAnwendbar: false, durchfuehrungen: [ex("f-1", "Fertig")] } } });
    erledigt.lastSyncSchreiben("2026-09-01T00:00:00.000Z");
    const offen = personenSpeicher("offen");
    offen.queueAnfuegen({ art: "execution", daten: ex("o-1", "Offen") });

    localStore.kontoBestaetigt({ kind: "participant", id: "p1", name: "P" });
    expect(Object.keys(localStorage).filter((k) => k.endsWith(":fertig"))).toEqual([]);
    expect(offen.queueLesen()).toHaveLength(1);
    expect(localStore.kontoLesen()).toEqual({ id: "p1", name: "P" });

    localStore.kontoBestaetigt({ kind: "anon" });
    expect(localStore.kontoLesen()).toBeNull();
  });

  it("besitzerFuer: bestätigtes Konto, sonst offline das zuletzt bestätigte, sonst anonym — nie eine Person für anon/admin", () => {
    expect(besitzerFuer(null)).toBe(ANONYM);
    localStore.kontoBestaetigt({ kind: "participant", id: "p1", name: "P" });
    expect(besitzerFuer(null)).toBe("p1");
    expect(besitzerFuer({ kind: "participant", id: "p2", name: "Q" })).toBe("p2");
    expect(besitzerFuer({ kind: "anon" })).toBe(ANONYM);
    localStore.kontoWechselVorbereiten();
    expect(besitzerFuer(null)).toBe(ANONYM);
  });

  it("fremdeEntfernen nimmt abgewiesene IDs aus Queue, Fortschritt und Altbestand", () => {
    P.queueAnfuegen({ art: "execution", daten: ex("fremd") });
    P.queueAnfuegen({ art: "execution", daten: ex("eigen") });
    P.fortschrittSchreiben({ schemaVersion: 1, fortschritt: { "1-1": { zielanzahl: 2, nichtAnwendbar: false, durchfuehrungen: [ex("fremd"), ex("eigen")] } } });
    P.altbestandSchreiben({ "1-1": { zielanzahl: 2, nichtAnwendbar: false, durchfuehrungen: [ex("fremd")] } });
    expect(P.fremdeEntfernen(["fremd"])).toBe(true);
    expect(P.queueLesen().map((q) => (q.daten as { id: string }).id)).toEqual(["eigen"]);
    expect(P.fortschrittLesen()["1-1"].durchfuehrungen.map((d) => d.id)).toEqual(["eigen"]);
    expect(P.altbestandLesen()!["1-1"].durchfuehrungen).toEqual([]);
    expect(P.fremdeEntfernen(["fremd"])).toBe(false);
  });
});
