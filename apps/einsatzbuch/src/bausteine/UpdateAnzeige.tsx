/**
 * Das Update unten rechts, auf jeder Seite (DRK-497). Bis dahin stand ein vorgemerktes Update nur
 * in der Karte „Einstellungen“, und die sieht nur, wer angemeldet ist; Herunterladen und
 * Installieren liefen unsichtbar, und die App startete ohne Vorwarnung neu.
 *
 * - `lauf === "laedt"`: Spinner. Der Updater lädt herunter (`Updatelauf` in
 *   `src-tauri/src/updater.rs`), auf jeder Seite.
 * - `lauf === "bereit"` oder `"neustart"`: „Update bereit“. Installiert und neu gestartet wird erst
 *   auf dem Startbildschirm oder beim Beenden; offene Eingaben bleiben unangetastet.
 * - sonst mit `update`: vorgemerkt, „steht an“.
 *
 * Nur Status, keine Erklärung (Projektregel: keine Hinweistexte in der App). Die Anzeige ist reine
 * Auskunft, ohne Knopf und ohne Klickfläche (`pointer-events: none` in `app.css`); was darunter
 * liegt, bleibt bedienbar. Die Live-Region steht immer im DOM, damit ein Screenreader den Wechsel
 * ansagt.
 */
import type { Status } from "../typen";
import { Zeichen } from "./Symbol";

export function UpdateAnzeige({ update, lauf }: { update: string | null; lauf: Status["updateLauf"] }) {
  const version = update !== null ? <span>Version {update}</span> : null;
  let inhalt = null;
  if (lauf === "laedt") {
    inhalt = (
      <>
        <span className="update-spinner" aria-hidden="true" />
        <span className="update-text">
          <span className="update-titel">Update wird geladen</span>
          {version}
        </span>
      </>
    );
  } else if (lauf === "bereit" || lauf === "neustart") {
    inhalt = (
      <>
        <Zeichen name="info" />
        <span className="update-text">
          <span className="update-titel">Update bereit</span>
          {version}
        </span>
      </>
    );
  } else if (update !== null) {
    inhalt = (
      <>
        <Zeichen name="herunterladen" />
        <span className="update-text">
          <span className="update-titel">Update auf {update} steht an</span>
        </span>
      </>
    );
  }
  return (
    <div role="status" className="update-anzeige-ort">
      {inhalt ? (
        <div className="update-anzeige" data-lauf={lauf ?? "vorgemerkt"}>
          {inhalt}
        </div>
      ) : null}
    </div>
  );
}
