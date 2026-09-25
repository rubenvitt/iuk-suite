/**
 * Seite während der Änderungsfrist, nach `Einsatzbuch v2.dc.html` (Abschnitt `istFrist`). Die
 * Restzeit zählt die App lokal herunter; entschieden wird in Rust.
 */
import { Karte } from "../bausteine/Karte";
import { Knopf } from "../bausteine/Knopf";
import { zusammenfassung } from "../logik/formular";
import type { Ausstehend, Stammdatenpaket } from "../typen";

interface FristProps {
  ausstehend: Ausstehend;
  paket: Stammdatenpaket;
  restText: string;
  /** 0 bis 100, Anteil der verbleibenden Frist. */
  restProzent: number;
  beiAendern: () => void;
  beiVersiegeln: () => void;
}

export function Frist({ ausstehend, paket, restText, restProzent, beiAendern, beiVersiegeln }: FristProps) {
  return (
    <main className="seite seite-schmal" data-screen-label="Frist">
      <Karte>
        <div className="stapel stapel-20">
          <div className="kicker">Abgesendet · noch änderbar</div>
          <div className="frist-uhr">
            <div className="frist-rest">{restText}</div>
            <div className="frist-rest-text">bis zur Versiegelung</div>
          </div>
          <div className="frist-balken" aria-hidden="true">
            <div className="frist-balken-fuellung" style={{ width: `${restProzent}%` }} />
          </div>
          <div className="frist-text">
            Danach wird der Einsatz verschlüsselt, an die Einsatzkette angehängt und ist hier nicht mehr einsehbar — auch nicht für dich. Nur die
            Verwaltung kann ihn nach der Anmeldung lesen.
          </div>
          <div className="reihe-umbruch reihe-12">
            <Knopf zeichen="stift" onClick={beiAendern}>
              Angaben ändern
            </Knopf>
            <Knopf variante="primaer" zeichen="schluessel" onClick={beiVersiegeln}>
              Jetzt versiegeln
            </Knopf>
          </div>
        </div>
      </Karte>
      <Karte titel="Zusammenfassung">
        <div className="stapel">
          {zusammenfassung(ausstehend.entwurf, paket).map((z) => (
            <div key={z.k} className="zusammenfassung-zeile">
              <div className="zusammenfassung-k">{z.k}</div>
              <div className="zusammenfassung-v">{z.v}</div>
            </div>
          ))}
        </div>
      </Karte>
    </main>
  );
}
