"use client";

import { useMemo } from "react";
import type { TaskDTO } from "../../_lib/typen";
import { type AufgabenFortschritt, gesamtFortschritt, leererFortschritt } from "../offline/progress";
import { CodeHinweis } from "./CodeHinweis";
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
  /**
   * Ohne Code: der Katalog ist lesbar, alles Persönliche bleibt weg
   * (Betreiberentscheidung 2026-08-29, siehe `TeilnehmerApp.tsx`). Betrifft
   * hier die Fortschrittskarte und die Zähler an den Aufgabenzeilen — auf
   * einem geteilten Tablet gehörten sie sonst der zuletzt angemeldeten Person.
   */
  nurLesen?: boolean;
};

/**
 * Die feinere zweite Zahl der Fortschrittskarte: erfasste Durchführungen
 * gegen die Summe der Zielanzahlen.
 *
 * SIE DEUTET `gesamtFortschritt` NICHT UM und rührt es nicht an — an jener
 * Rechnung („eine Aufgabe zählt, wenn ihre Zielanzahl voll ist") hängen der
 * Verwaltungszweig und dessen Tests. Sie steht daneben, weil die grobe Zahl
 * allein lange 0 % zeigt, während jemand längst arbeitet: mit drei Aufgaben
 * springt sie in Drittelschritten, und wer 2 von 3 Durchführungen einer
 * Aufgabe erfasst hat, sieht ohne diese Zeile keinerlei Bewegung.
 *
 * Gedeckelt wie `aufgabenQuote`: mehr Durchführungen als das Ziel zählen nicht
 * über 100 %, sonst stünde „4 von 3". Nicht anwendbare Aufgaben bleiben außen
 * vor — genau wie in `gesamtFortschritt`.
 */
function durchfuehrungsStand(
  katalog: TaskDTO[],
  fortschritt: Record<string, AufgabenFortschritt>,
): { erfasst: number; noetig: number } {
  let erfasst = 0;
  let noetig = 0;
  for (const t of katalog) {
    const f = fortschritt[t.id];
    if (!f || f.nichtAnwendbar) continue;
    const ziel = Math.max(1, f.zielanzahl);
    noetig += ziel;
    erfasst += Math.min(ziel, f.durchfuehrungen.length);
  }
  return { erfasst, noetig };
}

/** Port aus uav-praxis/src/components/Dashboard.tsx (`onSelect` entfällt — TaskCard verlinkt selbst). */
export function Dashboard({ katalog, fortschritt, nurLesen = false }: Props) {
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
  const { erfasst, noetig } = durchfuehrungsStand(katalog, sichtbarerFortschritt);
  const durchfuehrungsProzent = noetig === 0 ? 0 : Math.round((erfasst / noetig) * 100);

  // Nur Teile mit mindestens einer Aufgabe: eine Überschrift über dem Nichts
  // („Teil 3 · Training von Einsatzszenarien" ohne eine einzige Zeile darunter)
  // sieht aus, als sei etwas nicht geladen.
  const teileMitAufgaben = TEILE.map(({ teil, titel }) => ({
    teil,
    titel,
    aufgaben: katalog.filter((a) => a.teil === teil),
  })).filter((t) => t.aufgaben.length > 0);

  return (
    <div>
      <header>
        <p className={styles.eyebrow}>Training · BOS</p>
        <h1 className={styles["kopf-titel"]}>Drohnen-Trainingsbegleiter</h1>
      </header>

      {nurLesen ? (
        <CodeHinweis />
      ) : (
      <section className={styles["fortschritt-karte"]} aria-label="Gesamtfortschritt">
        <div className={styles["fortschritt-zahl"]}>{prozent}%</div>
        <p className={styles["fortschritt-sub"]}>
          Gesamtfortschritt · {erledigt} von {gesamt} Aufgaben
        </p>
        <div className={styles.balken}>
          <div className={styles["balken-vor"]} style={{ width: `${durchfuehrungsProzent}%` }} />
          <div className={styles["balken-fuell"]} style={{ width: `${prozent}%` }} />
        </div>
        <p className={styles["fortschritt-legende"]}>
          {erfasst} von {noetig} Durchführungen erfasst
        </p>
      </section>
      )}

      {teileMitAufgaben.length === 0 ? (
        <p className={styles.leer}>
          <strong className={styles["leer-titel"]}>Noch keine Aufgaben</strong>
          Sobald deine Kursleitung Aufgaben freigibt und du einmal online warst, stehen sie hier —
          danach auch ohne Netz.
        </p>
      ) : (
        teileMitAufgaben.map(({ teil, titel, aufgaben }) => (
          <section key={teil} className={styles["teil-sektion"]}>
            <h2 className={styles["sektion-titel"]}>{titel}</h2>
            <div className={styles["aufgaben-liste"]}>
              {aufgaben.map((a) => (
                <TaskCard
                  key={a.id}
                  aufgabe={a}
                  // Wie in TeilnehmerApp/TaskDetail: ohne noUncheckedIndexedAccess
                  // sieht TypeScript den möglichen undefined-Zugriff nicht — ein
                  // Render-Fenster zwischen frisch geladenem Katalog und dem
                  // Fortschritt-Merge-Effekt reicht sonst für einen Absturz.
                  fortschritt={fortschritt[a.id] ?? leererFortschritt(a.zielanzahlDefault)}
                  nurLesen={nurLesen}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
