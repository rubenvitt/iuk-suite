"use client";

import { useEffect, useState } from "react";
import { syncEngine, type SyncStatus as SyncStatusWert } from "../offline/syncEngine";
import styles from "./uav.module.css";

const STATUS_TEXT: Record<SyncStatusWert, string> = {
  online: "Wieder online",
  offline: "Offline — Änderungen werden gespeichert",
  syncing: "Synchronisiere …",
  synced: "Synchronisiert",
  fehler: "Sync fehlgeschlagen — wird wiederholt",
};

/** Wie lange die Erfolgsmeldung nach einer Störung stehen bleibt. */
const BESTAETIGUNG_MS = 6000;

/**
 * Der Sync-Chip — Port aus dem `SyncIndikator` in
 * uav-praxis/src/pages/TeilnehmerApp.tsx, mit einer Änderung: er zeigt sich
 * nur noch, wenn er etwas zu sagen hat.
 *
 * VORHER STAND DAUERHAFT „Synchronisiert" AM UNTEREN BILDRAND. Das war zweimal
 * falsch: es ist der Normalfall (und damit keine Meldung, sondern Lärm), und
 * der Chip liegt `position: fixed` über dem Inhalt — auf der Aufgabenseite
 * verdeckte er beim Scrollen Einträge der Durchführungsliste. Die 96px
 * Bodenpolster von `.app` helfen nur am Seitenende, nicht mittendrin.
 *
 * SICHTBAR IST ER JETZT BEI: „Offline" und „Sync fehlgeschlagen" — den beiden
 * Zuständen, die jemanden etwas angehen —, und danach für die Dauer der
 * Erholung, bis die Bestätigung „Synchronisiert" nach {@link BESTAETIGUNG_MS}
 * verschwindet. Wer nie offline war, sieht ihn nie: ein Sync alle 60 Sekunden
 * ist kein Ereignis.
 *
 * DIE HÜLLE BLEIBT IMMER IM DOM. Eine Live-Region, die erst mit ihrem Text
 * entsteht, sagt nichts an — Screenreader lesen Änderungen INNERHALB einer
 * bereits vorhandenen Region vor.
 */
export function SyncStatus() {
  const [anzeige, setAnzeige] = useState<SyncStatusWert | null>(null);

  useEffect(() => {
    // `stoerung` steht im Effekt und nicht im State: es steuert keine
    // Darstellung, sondern nur die Frage „gab es etwas, dessen Ende eine
    // Bestätigung verdient" — ein Render dafür wäre einer zu viel.
    let stoerung = false;
    let uhr: ReturnType<typeof setTimeout> | null = null;
    const abbestellen = syncEngine.abonnieren((status) => {
      if (uhr) {
        clearTimeout(uhr);
        uhr = null;
      }
      if (status === "offline" || status === "fehler") {
        stoerung = true;
        setAnzeige(status);
        return;
      }
      if (!stoerung) {
        setAnzeige(null);
        return;
      }
      if (status === "synced") {
        stoerung = false;
        setAnzeige("synced");
        uhr = setTimeout(() => setAnzeige(null), BESTAETIGUNG_MS);
        return;
      }
      // „Wieder online" / „Synchronisiere …" während der Erholung: sichtbar
      // lassen, sonst blinkt der Chip zwischen Störung und Bestätigung weg.
      setAnzeige(status);
    });
    return () => {
      if (uhr) clearTimeout(uhr);
      abbestellen();
    };
  }, []);

  return (
    <div role="status" aria-live="polite">
      {anzeige && (
        <div className={`${styles["sync-indikator"]} ${styles[`sync-${anzeige}`] ?? ""}`}>
          <span className={styles["sync-punkt"]} aria-hidden="true" />
          {STATUS_TEXT[anzeige]}
        </div>
      )}
    </div>
  );
}
