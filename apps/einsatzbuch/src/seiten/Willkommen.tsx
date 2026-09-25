/**
 * Startseite, nach `Einsatzbuch v2.dc.html` (Abschnitt `istStart`, Zeile ~45). Der Fuß zeigt —
 * eingerichtet und ohne Sitzung — „Verwaltung · Anmelden“ (Vorlage-Wortlaut, `zumLogin`); mit
 * Sitzung stattdessen den Namen als Weg zurück zur Verwaltung. Im Testbetrieb kommt zusätzlich
 * „Testbetrieb beenden“ dazu (kein Vorlagen-Pendant, Bedienung des Offline-Testrechners). Enter
 * und Leertaste hört die App selbst ab (`App.tsx`).
 */
import { Zeichen } from "../bausteine/Symbol";
import type { SitzungInfo } from "../typen";

interface WillkommenProps {
  bereitschaft: string | null;
  test: boolean;
  eingerichtet: boolean;
  sitzung: SitzungInfo | null;
  beiOeffnen: () => void;
  beiTestEnde: () => void;
  beiAnmeldenKlick: () => void;
  beiVerwaltungKlick: () => void;
}

export function Willkommen({
  bereitschaft,
  test,
  eingerichtet,
  sitzung,
  beiOeffnen,
  beiTestEnde,
  beiAnmeldenKlick,
  beiVerwaltungKlick,
}: WillkommenProps) {
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
        <div className="willkommen-fuss-rechts">
          {sitzung ? (
            <button type="button" className="umrissknopf" onClick={beiVerwaltungKlick}>
              {sitzung.name}
            </button>
          ) : eingerichtet ? (
            <button type="button" className="umrissknopf" onClick={beiAnmeldenKlick}>
              Verwaltung · Anmelden
            </button>
          ) : null}
          {test ? (
            <button type="button" className="umrissknopf" onClick={beiTestEnde}>
              Testbetrieb beenden
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
