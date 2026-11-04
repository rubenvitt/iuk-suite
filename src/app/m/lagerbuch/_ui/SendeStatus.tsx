"use client";

import type { Entwurf } from "@/core/entwurf/useEntwurf";
import { useEntwurfMeldung } from "@/core/entwurf/useEntwurfMeldung";
import s from "./helfer.module.css";

/**
 * DIE STATUSZEILE EINER WARTENDEN SENDUNG auf den Helfer-Strecken — IDA-358.
 *
 * Sie ersetzt das frühere „Keine Verbindung. Die Buchung wurde nicht
 * gespeichert.": seit `core/entwurf` stimmt der Satz nicht mehr, die Buchung
 * liegt auf dem Gerät und wird von selbst erneut versucht. Der Wortlaut kommt
 * aus dem Kern (`entwurfMeldung`), damit „nicht gesendet" in jedem Modul gleich
 * aussieht; hier steht nur das Markup der Helferflächen (antd gibt es dort nicht).
 *
 * „Nicht gesendet" ist ein Fehler und trägt Rot (Falle 3); „Wird gesendet …"
 * (nur nach einem Neuladen mit liegender Sendung) und „Eingaben
 * wiederhergestellt" sind neutral. Letzteres nur mit `verwerfbar` — wo die
 * Eingabe eine Zahl am Stepper ist, sieht man sie ohnehin, und die Zeile wäre
 * nach jeder Buchung mit gewählter Charge ein Rauschen.
 */
export function SendeStatus({ entwurf, rolle, verwerfbar = false }: {
  entwurf: Omit<Entwurf<unknown>, "sende">;
  rolle: string;
  verwerfbar?: boolean;
}) {
  const m = useEntwurfMeldung(entwurf);
  if (!m || (m.art === "wiederhergestellt" && !verwerfbar)) return null;
  return (
    <span
      className={`${s.chip} ${m.art === "nicht-gesendet" ? s.rot : s.grau} ${s.rueckmeldung}`}
      data-rolle={rolle}
      data-art={m.art}
      role="status"
    >
      {m.text}
      {m.art === "wiederhergestellt" && (
        <>
          {" "}
          <button
            type="button"
            className={s.entwurfVerwerfen}
            onClick={entwurf.verwerfen}
            data-rolle="entwurf-verwerfen"
          >
            Neu beginnen
          </button>
        </>
      )}
      {m.art === "nicht-gesendet" && (
        <>
          {" "}
          <button
            type="button"
            className={s.entwurfVerwerfen}
            onClick={entwurf.jetztSenden}
            data-rolle="entwurf-jetzt-senden"
          >
            Jetzt senden
          </button>
        </>
      )}
    </span>
  );
}
