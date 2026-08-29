"use client";

import { useEffect, useState } from "react";
import { syncEngine, type SyncStatus as SyncStatusWert } from "../offline/syncEngine";
import styles from "./uav.module.css";

const STATUS_TEXT: Record<SyncStatusWert, string> = {
  online: "Online",
  offline: "Offline — Änderungen werden gespeichert",
  syncing: "Synchronisiere …",
  synced: "Synchronisiert",
  fehler: "Sync fehlgeschlagen — wird wiederholt",
};

/** Port aus dem `SyncIndikator` in uav-praxis/src/pages/TeilnehmerApp.tsx — als eigene Komponente. */
export function SyncStatus() {
  const [status, setStatus] = useState<SyncStatusWert>(() => syncEngine.statusLesen());
  useEffect(() => syncEngine.abonnieren(setStatus), []);
  return (
    <div
      className={`${styles["sync-indikator"]} ${styles[`sync-${status}`] ?? ""}`}
      role="status"
      aria-live="polite"
    >
      <span className={styles["sync-punkt"]} aria-hidden="true" />
      {STATUS_TEXT[status]}
    </div>
  );
}
