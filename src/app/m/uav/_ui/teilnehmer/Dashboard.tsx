"use client";

import { useMemo } from "react";
import type { TaskDTO } from "../../_lib/typen";
import { type AufgabenFortschritt, gesamtFortschritt, leererFortschritt } from "../offline/progress";
import { TaskCard } from "./TaskCard";
import styles from "./uav.module.css";

const TEILE: { teil: 1 | 2 | 3; titel: string }[] = [
  { teil: 1, titel: "Teil 1 · Grundlegende Steuerung" },
  { teil: 2, titel: "Teil 2 · Sichere Steuerung in einsatznahen Situationen" },
  { teil: 3, titel: "Teil 3 · Training von Einsatzszenarien" },
];

type Props = {
  katalog: TaskDTO[];
  fortschritt: Record<string, AufgabenFortschritt>;
};

/** Port aus uav-praxis/src/components/Dashboard.tsx (`onSelect` entfällt — TaskCard verlinkt selbst). */
export function Dashboard({ katalog, fortschritt }: Props) {
  // Gesamtfortschritt nur über die aktuell sichtbaren Katalog-Aufgaben rechnen —
  // ein lokaler Stand für inzwischen deaktivierte/entfernte Aufgaben zählt nicht mit.
  const sichtbarerFortschritt = useMemo(() => {
    const map: Record<string, AufgabenFortschritt> = {};
    for (const t of katalog) {
      const f = fortschritt[t.id];
      if (f) map[t.id] = f;
    }
    return map;
  }, [katalog, fortschritt]);
  const { erledigt, gesamt } = gesamtFortschritt(sichtbarerFortschritt);
  const prozent = gesamt === 0 ? 0 : Math.round((erledigt / gesamt) * 100);

  return (
    <div>
      <header>
        <p className={styles.eyebrow}>Training · BOS</p>
        <h1 className={styles["kopf-titel"]}>Drohnen-Trainingsbegleiter</h1>
      </header>

      <section className={styles["fortschritt-karte"]} aria-label="Gesamtfortschritt">
        <div className={styles["fortschritt-zahl"]}>{prozent}%</div>
        <p className={styles["fortschritt-sub"]}>
          Gesamtfortschritt · {erledigt} von {gesamt} Aufgaben
        </p>
        <div className={styles.balken}>
          <div className={styles["balken-fuell"]} style={{ width: `${prozent}%` }} />
        </div>
      </section>

      {TEILE.map(({ teil, titel }) => (
        <section key={teil} className={styles["teil-sektion"]}>
          <h2 className={styles["sektion-titel"]}>{titel}</h2>
          <div className={styles["aufgaben-liste"]}>
            {katalog
              .filter((a) => a.teil === teil)
              .map((a) => (
                <TaskCard
                  key={a.id}
                  aufgabe={a}
                  // Wie in TeilnehmerApp/TaskDetail: ohne noUncheckedIndexedAccess
                  // sieht TypeScript den möglichen undefined-Zugriff nicht — ein
                  // Render-Fenster zwischen frisch geladenem Katalog und dem
                  // Fortschritt-Merge-Effekt reicht sonst für einen Absturz.
                  fortschritt={fortschritt[a.id] ?? leererFortschritt(a.zielanzahlDefault)}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
