/**
 * Das Update unten rechts, auf jeder Seite (DRK-497). Bis dahin stand ein vorgemerktes Update nur
 * in der Karte „Einstellungen“, und die sieht nur, wer angemeldet ist; Herunterladen und
 * Installieren liefen unsichtbar, und die App startete ohne Vorwarnung neu.
 *
 * - `lauf === "laedt"`: Spinner. Der Updater lädt herunter und installiert (`Updatelauf` in
 *   `src-tauri/src/updater.rs`), danach startet die App neu.
 * - `lauf === "neustart"`: installiert, der Neustart wartet auf einen ruhigen Moment.
 * - sonst mit `update`: vorgemerkt, „steht an“.
 *
 * Die Bedingung im Text ist bewusst kürzer als in „Einstellungen“ (dort auch der Entwurf): Hier
 * steht, was jemand ohne Anmeldung dagegen tun kann. Die Anzeige ist reine Auskunft, ohne Knopf
 * und ohne Klickfläche (`pointer-events: none` in `app.css`); was darunter liegt, bleibt bedienbar.
 * Die Live-Region steht immer im DOM, damit ein Screenreader den Wechsel ansagt.
 */
import type { Status } from "../typen";
import { Zeichen } from "./Symbol";

const BEDINGUNG = "sobald niemand angemeldet ist und kein Einsatz aussteht";

export function UpdateAnzeige({ update, lauf }: { update: string | null; lauf: Status["updateLauf"] }) {
  const version = update !== null ? `Version ${update}. ` : "";
  let inhalt = null;
  if (lauf === "laedt") {
    inhalt = (
      <>
        <span className="update-spinner" aria-hidden="true" />
        <span className="update-text">
          <span className="update-titel">Update wird installiert</span>
          <span>{version}Die App startet danach neu.</span>
        </span>
      </>
    );
  } else if (lauf === "neustart") {
    inhalt = (
      <>
        <Zeichen name="info" />
        <span className="update-text">
          <span className="update-titel">Update installiert</span>
          <span>
            {version}Die App startet neu, {BEDINGUNG}.
          </span>
        </span>
      </>
    );
  } else if (update !== null) {
    inhalt = (
      <>
        <Zeichen name="herunterladen" />
        <span className="update-text">
          <span className="update-titel">Update auf {update} steht an</span>
          <span>Es wird installiert, {BEDINGUNG}.</span>
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
