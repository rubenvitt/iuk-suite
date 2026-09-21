import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { randomId } from "@/core/zufallsId";
import type { TaskDTO } from "../../_lib/typen";
import { type AufgabenFortschritt, type Durchfuehrung, leererFortschritt } from "../offline/progress";
import { localStore, personenSpeicher } from "../offline/localStore";
import { syncEngine } from "../offline/syncEngine";

/**
 * Port aus uav-praxis/src/hooks/useFortschritt.ts. Unterschied zum Original:
 * kein `AuthContext` — der Besitzer des Speichers kommt als Parameter von
 * `TeilnehmerApp` (dort aus `api.me()` abgeleitet, siehe dortiger Kommentar
 * zum Offline-Fall).
 */

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

// Ein unbekannter (zu alter) Schema-Stand behält seinen Fortschritt, verliert
// aber nie mehr als das Schema-Feld — kein Katalog-Seed mehr, aus dem eine
// Basis gebaut werden könnte (Spec §2, Task 11).
function migrieren(state: AppState): AppState {
  return { schemaVersion: SCHEMA_VERSION, fortschritt: state.fortschritt ?? {} };
}

/**
 * NICHT `crypto.randomUUID()` direkt (Bug, gemessen per `e2e/uav.spec.ts`,
 * Check 7: `Uncaught TypeError: crypto.randomUUID is not a function`) — die
 * Funktion existiert nur im Secure Context, und `http://uav.localtest.me`
 * (wie jede LAN-IP im echten Einsatz) ist keiner. `randomId()` aus
 * `@/core/zufallsId` fällt in genau diesem Fall auf ein UUID-v4-förmiges
 * Ergebnis ohne `crypto.randomUUID` zurück (dieselbe Lösung, die `qr`
 * bereits für denselben Fall trägt).
 */
function neueId(): string {
  return randomId();
}

function jetztIso(): string {
  return new Date().toISOString();
}

type Stand = { besitzer: string; state: AppState; speicherfehler: boolean };

function standLesen(besitzer: string): Stand {
  return { besitzer, state: personenSpeicher(besitzer).fortschrittStateLesen(), speicherfehler: false };
}

/**
 * Fortschritt EINES Besitzers (DRK-286): `besitzer` ist die Teilnehmer-ID oder
 * `ANONYM` (`besitzerFuer` in `offline/localStore.ts`). Wechselt er, liest der
 * Hook den Speicher des neuen Besitzers neu — nichts vom vorigen bleibt im
 * State, und geschrieben wird immer nur unter dem Besitzer, zu dem der State
 * gehört. Die Übernahme anonymer Erfassung und der Alt-Keys macht
 * `localStore.kontoBestaetigt`, nicht dieser Hook.
 */
export function useFortschritt(katalog: TaskDTO[], besitzer: string) {
  const [stand, setStand] = useState<Stand>(() => standLesen(besitzer));
  // Besitzerwechsel: den State im selben Render auf den neuen Speicher setzen
  // (React-Muster „State aus vorigem Render anpassen"), statt einen Render mit
  // dem Stand der vorigen Person auszuliefern.
  let aktuell = stand;
  if (stand.besitzer !== besitzer) {
    aktuell = standLesen(besitzer);
    setStand(aktuell);
  }
  const state = aktuell.state;
  const speicherfehler = aktuell.speicherfehler;
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

  // Aktuellen Stand (mit Besitzer) für Event-Handler ohne Stale-Closure halten.
  const stateRef = useRef<{ besitzer: string; state: AppState }>({ besitzer, state: sicher });
  useEffect(() => {
    stateRef.current = { besitzer: aktuell.besitzer, state: sicher };
  }, [aktuell.besitzer, sicher]);

  /** Stand des aktuellen Besitzers — nie der eines vorigen (Ref hinkt einen Effekt nach). */
  const basis = useCallback((): AppState => {
    const ref = stateRef.current;
    return ref.besitzer === besitzer ? ref.state : personenSpeicher(besitzer).fortschrittStateLesen();
  }, [besitzer]);

  const setzen = useCallback(
    (next: AppState) => {
      const ok = personenSpeicher(besitzer).fortschrittSpeichern(next);
      stateRef.current = { besitzer, state: next };
      setStand({ besitzer, state: next, speicherfehler: !ok });
    },
    [besitzer],
  );

  // Neue Aufgaben aus dem Katalog (z. B. vom Admin angelegt) in den persistenten
  // Fortschritt nachziehen, damit Schreibvorgänge (`aendern`) für sie greifen.
  // Add-only: bestehender Fortschritt bleibt erhalten — auch für Aufgaben, die im
  // Katalog inaktiv/entfernt wurden, geht kein lokaler Stand verloren.
  useEffect(() => {
    const aktuellerStand = basis();
    const fehlend = katalog.filter((t) => !aktuellerStand.fortschritt[t.id]);
    if (fehlend.length === 0) return;
    const next = { ...aktuellerStand.fortschritt };
    for (const t of fehlend) next[t.id] = leererFortschritt(t.zielanzahlDefault);
    // Schreibt in den localStorage (externes System) und spiegelt das in den
    // State — dasselbe tat der Setter aus `useLocalStorage` hier vor DRK-286.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setzen({ ...aktuellerStand, fortschritt: next });
  }, [katalog, basis, setzen]);

  // Server-Pull/Reconciliation und Übernahme schreiben über den localStore und
  // benachrichtigen die Abonnenten GENAU DIESES Besitzers → neu rendern.
  useEffect(() => {
    return localStore.fortschrittAbonnieren(besitzer, (neu) => {
      stateRef.current = { besitzer, state: neu };
      setStand({ besitzer, state: neu, speicherfehler: false });
    });
  }, [besitzer]);

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
  // Identität gebunden (`syncEngine.start()` in `TeilnehmerApp.tsx`). Gequeut
  // wird in die Queue DES BESITZERS (DRK-286) — unbestätigt offline ist das der
  // anonyme Speicher bzw. der des zuletzt bestätigten Kontos.
  const execMutation = useCallback(
    (taskId: string, d: Durchfuehrung, geloescht: boolean) => {
      personenSpeicher(besitzer).queueAnfuegen({
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
    [besitzer],
  );

  // Spiegelt eine TaskStatus-Mutation (Zielanzahl/nicht-anwendbar) in die Queue.
  // Ebenfalls ohne `eingeloggterTeilnehmer`-Wächter — Begründung s. `execMutation`.
  const statusMutation = useCallback(
    (taskId: string, f: AufgabenFortschritt) => {
      personenSpeicher(besitzer).queueAnfuegen({
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
    [besitzer],
  );

  const aendern = useCallback(
    (id: string, fn: (f: AufgabenFortschritt) => AufgabenFortschritt) => {
      const aktuellerStand = basis();
      const vorher = aktuellerStand.fortschritt[id];
      if (!vorher) return vorher;
      const nachher = fn(vorher);
      setzen({ ...aktuellerStand, fortschritt: { ...aktuellerStand.fortschritt, [id]: nachher } });
      return nachher;
    },
    [basis, setzen],
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
      const entfernt = basis().fortschritt[id]?.durchfuehrungen.find((d) => d.id === eintragId);
      aendern(id, (f) => ({
        ...f,
        durchfuehrungen: f.durchfuehrungen.filter((d) => d.id !== eintragId),
      }));
      if (entfernt) execMutation(id, entfernt, true);
    },
    [aendern, basis, execMutation],
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
