import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Identity } from "../../_lib/sitzung";
import type { TaskDTO } from "../../_lib/typen";
import { type AufgabenFortschritt, type Durchfuehrung, leererFortschritt } from "../offline/progress";
import { localStore } from "../offline/localStore";
import { syncEngine } from "../offline/syncEngine";

/**
 * Port aus uav-praxis/src/hooks/useFortschritt.ts. Unterschied zum Original:
 * kein `AuthContext` — die Identität kommt als Parameter von `TeilnehmerApp`
 * (dort per `api.me()` ermittelt, siehe dortiger Kommentar zum Offline-Fall).
 */

const STORAGE_KEY = "drk-drohnen-fortschritt"; // Alt-Key — geteilt mit localStore.ts
const SCHEMA_VERSION = 1;

export type AppState = {
  schemaVersion: number;
  fortschritt: Record<string, AufgabenFortschritt>;
};

function lesenLocalStorage<T>(key: string, fallback: T): T {
  try {
    const roh = localStorage.getItem(key);
    if (roh == null) return fallback;
    return JSON.parse(roh) as T;
  } catch {
    return fallback;
  }
}

/**
 * Generischer localStorage-State — 1:1 aus uav-praxis/src/hooks/useLocalStorage.ts.
 * Hier statt in einer eigenen Datei, weil `DurchfuehrungForm` (Vorbelegung des
 * letzten Teams) derselbe kleine Hook genügt und der Plan keine eigene Datei
 * dafür vorsieht.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (next: T) => void, boolean] {
  const [wert, setWert] = useState<T>(() => lesenLocalStorage(key, initial));
  const [speicherfehler, setSpeicherfehler] = useState(false);

  useEffect(() => {
    let fehler = false;
    try {
      localStorage.setItem(key, JSON.stringify(wert));
    } catch {
      // Storage nicht verfügbar/voll: State bleibt im Speicher nutzbar.
      fehler = true;
    }
    // localStorage ist ein externes System; ob das Schreiben gelingt, lässt sich
    // erst nach dem Versuch (auch beim Mount) feststellen und wird hier als
    // Status zurückgemeldet. Der funktionale Update verhindert Extra-Renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeicherfehler((vorher) => (vorher === fehler ? vorher : fehler));
  }, [key, wert]);

  const setzen = useCallback((next: T) => setWert(next), []);
  return [wert, setzen, speicherfehler];
}

function initialerState(): AppState {
  return { schemaVersion: SCHEMA_VERSION, fortschritt: {} };
}

// Ein unbekannter (zu alter) Schema-Stand behält seinen Fortschritt, verliert
// aber nie mehr als das Schema-Feld — kein Katalog-Seed mehr, aus dem eine
// Basis gebaut werden könnte (Spec §2, Task 11).
function migrieren(state: AppState): AppState {
  return { schemaVersion: SCHEMA_VERSION, fortschritt: state.fortschritt ?? {} };
}

function neueId(): string {
  return crypto.randomUUID();
}

function jetztIso(): string {
  return new Date().toISOString();
}

// Stabiler Epoch-Zeitstempel für die einmalige Übernahme anonymer TaskStatus.
// Begründung (§9, last-write-wins): Der Server wendet TaskStatus strikt per
// `excluded.updated_at > task_status.updated_at` an und fügt nur dann ein neues
// Status-Row ein, wenn noch keines existiert. Mit einem Epoch-Stempel verliert
// die Übernahme JEDEN Konflikt gegen einen vorhandenen Server-Wert (= kein
// stilles Überschreiben von Werten anderer Geräte), füllt aber Lücken auf einem
// frischen Server-Konto. Echte spätere Änderungen tragen `jetztIso()` und
// schlagen den Epoch-Stempel zuverlässig (selbstkorrigierend).
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

// Default-Zielanzahl je Aufgabe aus dem (übergebenen) Katalog.
function zielDefaultsAus(katalog: TaskDTO[]): Record<string, number> {
  return Object.fromEntries(katalog.map((t) => [t.id, Math.max(1, t.zielanzahlDefault)]));
}

// Weicht der lokale TaskStatus vom Katalog-Default ab? Nur dann lohnt die Übernahme.
function statusWeichtAb(
  taskId: string,
  f: AufgabenFortschritt,
  zielDefaults: Record<string, number>,
): boolean {
  return f.nichtAnwendbar || f.zielanzahl !== (zielDefaults[taskId] ?? 1);
}

export function useFortschritt(katalog: TaskDTO[], identity: Identity | null) {
  const [state, setState, speicherfehler] = useLocalStorage<AppState>(STORAGE_KEY, initialerState());
  // Nur ältere Stände migrieren; einen unbekannten höheren Schema-Stand defensiv NICHT überschreiben.
  const sicher = state.schemaVersion < SCHEMA_VERSION ? migrieren(state) : state;

  // Garantiert synchron für jede Katalog-Aufgabe einen Fortschritt-Eintrag —
  // ohne auf den Merge-Effekt unten zu warten. Verhindert Render-Lücken
  // (undefined) in der Übersicht, falls der DB-Katalog Aufgaben enthält, die der
  // lokale Stand noch nicht kennt (frisch vom Admin angelegt).
  const fortschritt = useMemo(() => {
    const fehlend = katalog.filter((t) => !sicher.fortschritt[t.id]);
    if (fehlend.length === 0) return sicher.fortschritt;
    const map = { ...sicher.fortschritt };
    for (const t of fehlend) map[t.id] = leererFortschritt(t.zielanzahlDefault);
    return map;
  }, [sicher.fortschritt, katalog]);

  // Aktuellen Stand für Event-Handler/Effekte ohne Stale-Closure halten.
  // (Aktualisierung im Effekt, nicht während des Renderns.)
  const stateRef = useRef(sicher);
  useEffect(() => {
    stateRef.current = sicher;
  }, [sicher]);

  // Aktuellen Katalog stale-frei für die Übernahme bereithalten (gleiches Muster).
  const katalogRef = useRef(katalog);
  useEffect(() => {
    katalogRef.current = katalog;
  }, [katalog]);

  // Neue Aufgaben aus dem Katalog (z. B. vom Admin angelegt) in den persistenten
  // Fortschritt nachziehen, damit Schreibvorgänge (`aendern`) für sie greifen.
  // Add-only: bestehender Fortschritt bleibt erhalten — auch für Aufgaben, die im
  // Katalog inaktiv/entfernt wurden, geht kein lokaler Stand verloren.
  useEffect(() => {
    const map = stateRef.current.fortschritt;
    const fehlend = katalog.filter((t) => !map[t.id]);
    if (fehlend.length === 0) return;
    const next = { ...map };
    for (const t of fehlend) next[t.id] = leererFortschritt(t.zielanzahlDefault);
    setState({ ...stateRef.current, fortschritt: next });
  }, [katalog, setState]);

  // Server-Pull/Reconciliation (syncEngine schreibt den Fortschritt über den
  // localStore und benachrichtigt hier) → erneut lesen und neu rendern.
  useEffect(() => {
    return localStore.fortschrittAbonnieren((neu) => {
      setState(neu as AppState);
    });
  }, [setState]);

  // Anonym → eingeloggt: lokalen Fortschritt einmalig in die Queue übernehmen
  // und hochladen (Merge mit Server). Pro Teilnehmer genau einmal — der Marker
  // liegt persistent im localStore, damit Reloads/Mounts den Stand nicht erneut
  // hochladen (§9).
  useEffect(() => {
    if (identity?.kind !== "participant") return;
    const teilnehmerId = identity.id;
    if (localStore.uebernommenGesetzt(teilnehmerId)) return;
    localStore.uebernommenMarkieren(teilnehmerId);

    const zielDefaults = zielDefaultsAus(katalogRef.current);
    const aktuell = stateRef.current.fortschritt;
    for (const [taskId, f] of Object.entries(aktuell)) {
      for (const d of f.durchfuehrungen) {
        localStore.queueAnfuegen({
          art: "execution",
          daten: {
            id: d.id,
            taskId,
            datum: d.datum,
            drohnensteuerer: d.drohnensteuerer,
            luftraumbeobachter: d.luftraumbeobachter,
            deletedAt: null,
          },
        });
      }
      if (statusWeichtAb(taskId, f, zielDefaults)) {
        localStore.queueAnfuegen({
          art: "taskStatus",
          daten: {
            taskId,
            zielanzahl: f.zielanzahl,
            nichtAnwendbar: f.nichtAnwendbar,
            updatedAt: EPOCH_ISO,
          },
        });
      }
    }
    syncEngine.mutationGemeldet();
  }, [identity]);

  // Spiegelt eine Execution-Mutation (Upsert/Tombstone) in die Queue + triggert Sync.
  //
  // KEIN `eingeloggterTeilnehmer`-Wächter mehr (Reviewer-Fund, Fix-Runde 1):
  // eine Mutation, die entsteht, bevor `api.me()` eine Teilnehmer-Identität
  // bestätigt hat, ging sonst NIE in die Queue — und `snapshotAnwenden` baut
  // den Fortschritt beim nächsten Sync aus Snapshot ∪ Queue neu auf. Ohne
  // Queue-Eintrag verschwand die Erfassung dort endgültig (Spec §3 #4,
  // reproduziert mit einem alten Alt-Übernahme-Marker: die einmalige
  // Übernahme läuft dann gar nicht mehr, und nichts anderes hätte den
  // Eintrag je nachgeliefert). Der Sync-Lauf selbst bleibt an die bestätigte
  // Identität gebunden (`syncEngine.start()` in `TeilnehmerApp.tsx`) — Server-
  // Upserts sind über die Client-UUID idempotent, ein zu früh gequeuter
  // Eintrag ist also harmlos, auch wenn er erst nach einer späteren
  // Bestätigung tatsächlich gesendet wird.
  const execMutation = useCallback(
    (taskId: string, d: Durchfuehrung, geloescht: boolean) => {
      localStore.queueAnfuegen({
        art: "execution",
        daten: {
          id: d.id,
          taskId,
          datum: d.datum,
          drohnensteuerer: d.drohnensteuerer,
          luftraumbeobachter: d.luftraumbeobachter,
          deletedAt: geloescht ? jetztIso() : null,
        },
      });
      syncEngine.mutationGemeldet();
    },
    [],
  );

  // Spiegelt eine TaskStatus-Mutation (Zielanzahl/nicht-anwendbar) in die Queue.
  // Ebenfalls ohne `eingeloggterTeilnehmer`-Wächter — Begründung s. `execMutation`.
  const statusMutation = useCallback(
    (taskId: string, f: AufgabenFortschritt) => {
      localStore.queueAnfuegen({
        art: "taskStatus",
        daten: {
          taskId,
          zielanzahl: f.zielanzahl,
          nichtAnwendbar: f.nichtAnwendbar,
          updatedAt: jetztIso(),
        },
      });
      syncEngine.mutationGemeldet();
    },
    [],
  );

  const aendern = useCallback(
    (id: string, fn: (f: AufgabenFortschritt) => AufgabenFortschritt) => {
      const vorher = stateRef.current.fortschritt[id];
      if (!vorher) return vorher;
      const nachher = fn(vorher);
      setState({
        ...stateRef.current,
        fortschritt: { ...stateRef.current.fortschritt, [id]: nachher },
      });
      return nachher;
    },
    [setState],
  );

  const durchfuehrungHinzufuegen = useCallback(
    (id: string, eintrag: Omit<Durchfuehrung, "id">) => {
      const neu: Durchfuehrung = { ...eintrag, id: neueId() };
      aendern(id, (f) => ({ ...f, durchfuehrungen: [...f.durchfuehrungen, neu] }));
      execMutation(id, neu, false);
    },
    [aendern, execMutation],
  );

  const durchfuehrungEntfernen = useCallback(
    (id: string, eintragId: string) => {
      // Eintrag vor dem Entfernen erfassen, um Tombstone (mit Original-ID) zu bilden.
      const entfernt = stateRef.current.fortschritt[id]?.durchfuehrungen.find(
        (d) => d.id === eintragId,
      );
      aendern(id, (f) => ({
        ...f,
        durchfuehrungen: f.durchfuehrungen.filter((d) => d.id !== eintragId),
      }));
      if (entfernt) execMutation(id, entfernt, true);
    },
    [aendern, execMutation],
  );

  const zielanzahlSetzen = useCallback(
    (id: string, ziel: number) => {
      const nachher = aendern(id, (f) => ({
        ...f,
        zielanzahl: Math.max(1, Math.floor(ziel) || 1),
      }));
      if (nachher) statusMutation(id, nachher);
    },
    [aendern, statusMutation],
  );

  const nichtAnwendbarSetzen = useCallback(
    (id: string, wert: boolean) => {
      const nachher = aendern(id, (f) => ({ ...f, nichtAnwendbar: wert }));
      if (nachher) statusMutation(id, nachher);
    },
    [aendern, statusMutation],
  );

  return {
    speicherfehler,
    fortschritt,
    durchfuehrungHinzufuegen,
    durchfuehrungEntfernen,
    zielanzahlSetzen,
    nichtAnwendbarSetzen,
  };
}
