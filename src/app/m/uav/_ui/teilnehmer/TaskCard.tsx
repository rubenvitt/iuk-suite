"use client";

import Link from "next/link";
import type { TaskDTO } from "../../_lib/typen";
import { type AufgabenFortschritt, aufgabenStatus } from "../offline/progress";
import styles from "./uav.module.css";

type Props = {
  aufgabe: TaskDTO;
  fortschritt: AufgabenFortschritt;
};

/**
 * Port aus uav-praxis/src/components/TaskCard.tsx — der TanStack-Router-
 * `onClick`/`navigate` wird zu einem echten `next/link` mit der äußeren
 * Pfadform (`/aufgabe?id=…`, niemals `/m/uav/…`).
 */
export function TaskCard({ aufgabe, fortschritt }: Props) {
  const status = aufgabenStatus(fortschritt);
  return (
    <Link
      href={`/aufgabe?id=${encodeURIComponent(aufgabe.id)}`}
      className={`${styles["aufgabe-zeile"]} ${styles[`status-${status}`] ?? ""}`}
    >
      <span className={styles["aufgabe-nummer"]}>{aufgabe.nummer}</span>
      <span className={styles["aufgabe-titel"]}>{aufgabe.titel}</span>
      {status === "erledigt" ? (
        <span className={`${styles["aufgabe-badge"]} ${styles["badge-erledigt"]}`}>erledigt</span>
      ) : status === "nicht-anwendbar" ? (
        <span className={`${styles["aufgabe-badge"]} ${styles["badge-na"]}`}>nicht anwendbar</span>
      ) : (
        <span className={`${styles["aufgabe-badge"]} ${styles["badge-zaehler"]}`}>
          {fortschritt.durchfuehrungen.length} / {fortschritt.zielanzahl}
        </span>
      )}
    </Link>
  );
}
