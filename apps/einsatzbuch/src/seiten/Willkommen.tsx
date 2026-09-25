/**
 * Startseite, nach `Einsatzbuch v2.dc.html` (Abschnitt `istStart`). Statt „Verwaltung · Anmelden“
 * steht im Fuß nur im Testbetrieb „Testbetrieb beenden“; Anmeldung und Verwaltung kommen später.
 * Enter und Leertaste hört die App selbst ab (`App.tsx`).
 */
import { Zeichen } from "../bausteine/Symbol";

interface WillkommenProps {
  bereitschaft: string | null;
  test: boolean;
  beiOeffnen: () => void;
  beiTestEnde: () => void;
}

export function Willkommen({ bereitschaft, test, beiOeffnen, beiTestEnde }: WillkommenProps) {
  return (
    <div className="willkommen" data-screen-label="Willkommen">
      <div className="willkommen-mitte">
        <div className="willkommen-marke">
          <div className="willkommen-balken" aria-hidden="true" />
          <h1 className="willkommen-titel">EINSATZBUCH</h1>
          {bereitschaft ? <div className="willkommen-bereitschaft">{bereitschaft}</div> : null}
        </div>
        {/* Der Startknopf ist der eine Zweck dieser Seite, deshalb bekommt er den Fokus. */}
        <button type="button" className="startknopf" autoFocus onClick={beiOeffnen}>
          Einsatz öffnen
          <Zeichen name="pfeil-rechts" groesse={24} />
        </button>
        <div className="willkommen-tasten">
          <kbd className="taste">Enter</kbd> oder <kbd className="taste">Leertaste</kbd> öffnet direkt das Formular
        </div>
      </div>
      <div className="willkommen-fuss">
        <div className="willkommen-hinweis">
          <Zeichen name="schluessel" />
          Verschlüsselt und nur auf diesem Rechner gespeichert
        </div>
        {test ? (
          <button type="button" className="umrissknopf" onClick={beiTestEnde}>
            Testbetrieb beenden
          </button>
        ) : null}
      </div>
    </div>
  );
}
