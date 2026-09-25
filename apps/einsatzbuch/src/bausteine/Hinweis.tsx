/**
 * Hinweis wie in der Vorlage (`components/verwaltung/hinweise/Hinweis.jsx`): Text mit 3 px Kante
 * auf Ampelfläche. `warn` statt eines roten Alerts, weil Suite-Rot die Primäraktion ist
 * (`docs/design/README.md`, „Rot: Chrome ja, Datenfläche nein“).
 *
 * Die Rolle folgt der Vorlage (`warn` → `alert`, `info` → `status`). `rolle="note"` ist für einen
 * Hinweis mit laufendem Inhalt, etwa einer Restzeit: In einer Live-Region würde jeder Takt neu
 * vorgelesen.
 */
import type { ReactNode } from "react";

export function Hinweis({
  ton = "info",
  rolle,
  children,
}: {
  ton?: "info" | "warn";
  rolle?: "alert" | "status" | "note";
  children: ReactNode;
}) {
  return (
    <div role={rolle ?? (ton === "warn" ? "alert" : "status")} className={`hinweis hinweis-${ton}`}>
      {children}
    </div>
  );
}
