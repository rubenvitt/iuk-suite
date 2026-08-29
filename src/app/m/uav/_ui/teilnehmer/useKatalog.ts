import { useEffect, useState } from "react";
import type { TaskDTO } from "../../_lib/typen";
import { api } from "../offline/client";
import { localStore } from "../offline/localStore";

/**
 * Liefert den Aufgabenkatalog offline-first: synchron sofort aus dem lokalen
 * Cache (bzw. leer, wenn noch nie geladen — Spec §2, kein Seed) und
 * aktualisiert ihn danach im Hintergrund per `GET /api/tasks`.
 *
 * Fehler (z. B. HTTP 401 im anonymen Modus, da `/api/tasks` eine Teilnehmer-/
 * Admin-Session verlangt, oder Offline) werden bewusst verschluckt: der zuletzt
 * gecachte Katalog bleibt aktiv — kein Spinner, kein Blank-State.
 *
 * Port aus uav-praxis/src/hooks/useKatalog.ts.
 */
export function useKatalog(): TaskDTO[] {
  const [katalog, setKatalog] = useState<TaskDTO[]>(() => localStore.katalog());

  useEffect(() => {
    let abgebrochen = false;
    api
      .getTasks()
      .then((tasks) => {
        if (abgebrochen || tasks.length === 0) return;
        localStore.tasksSchreiben(tasks);
        setKatalog(tasks);
      })
      .catch(() => {
        // 401 (anon) / Netzfehler / Server offline → Cache bleibt.
      });
    return () => {
      abgebrochen = true;
    };
  }, []);

  return katalog;
}
