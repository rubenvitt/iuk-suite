import { TokenRahmen } from "./TokenRahmen";

/**
 * DIE 404 DER TOKEN-ANSICHT (Entscheidung 4; Muster Zustand F in docs/design/feedback-oeffentliche-ansicht.md):
 * EIN Text für unbekannt, falsch geformt, abgelaufen, widerrufen und archiviert — nach außen kein Unterschied.
 * Kein Knopf, kein Link auf „/" (dort wartet eine Anmeldung, die der Empfänger nicht hat), nichts aus der Datenbank.
 */
export function TokenUngueltig() {
  return (
    <TokenRahmen>
      <section className="kp-token-ungueltig">
        <h1>Dieser Link gilt nicht (mehr).</h1>
        <p>Vielleicht ist er abgelaufen, widerrufen oder unvollständig kopiert. Bitte die Person, die ihn dir geschickt hat, um einen neuen.</p>
      </section>
    </TokenRahmen>
  );
}
