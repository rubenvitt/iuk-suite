/**
 * Bestätigung nach dem Versiegeln, nach `Einsatzbuch v2.dc.html` (Abschnitt `istVersiegelt`):
 * Vorgänger und neuer Block mit den ersten acht Hex-Zeichen, dazu der Zeitpunkt in der
 * Suite-Zone der Einrichtung.
 */
import { zeitpunktText } from "@kern/zeit";

import { Hinweis } from "../bausteine/Hinweis";
import { Knopf } from "../bausteine/Knopf";
import { Zeichen } from "../bausteine/Symbol";
import type { Versiegelung } from "../typen";

interface VersiegeltProps {
  versiegelung: Versiegelung;
  zeitzone: string | null;
  verfallen: boolean;
  beiFertig: () => void;
}

/** Ohne bekannte Zone (nicht eingerichtet) oder bei unlesbarem Wert bleibt der Zeitpunkt, wie Rust ihn schrieb. */
function versiegeltText(versiegelt: string, zeitzone: string | null): string {
  if (!zeitzone) return versiegelt;
  try {
    return zeitpunktText(versiegelt, zeitzone);
  } catch {
    return versiegelt;
  }
}

export function Versiegelt({ versiegelung: v, zeitzone, verfallen, beiFertig }: VersiegeltProps) {
  return (
    <main className="seite seite-schmal seite-mittig" data-screen-label="Versiegelt">
      <div className="siegel-kreis">
        <Zeichen name="schluessel" groesse={36} />
      </div>
      <div className="stapel stapel-8 mittig">
        <h1 className="titel">Einsatz versiegelt</h1>
        <div className="versiegelt-text">
          Die Angaben sind verschlüsselt auf diesem Rechner gespeichert und an die Einsatzkette angehängt. Hier sind sie nicht mehr abrufbar.
        </div>
      </div>
      {verfallen ? (
        <div className="volle-breite">
          <Hinweis ton="warn">
            Deine letzten Änderungen wurden nicht übernommen — die Frist war abgelaufen. Versiegelt ist der zuletzt abgesendete Stand.
          </Hinweis>
        </div>
      ) : null}
      <div className="kettenglieder">
        <div className="kettenglied kettenglied-alt">
          <div className="kicker">Block {v.block - 1}</div>
          <div className="hash">#{v.prev.slice(0, 8)}</div>
        </div>
        <div className="kettenglied-verbindung">
          <Zeichen name="verketten" groesse={20} />
        </div>
        <div className="kettenglied kettenglied-neu">
          <div className="kicker kicker-ok">Block {v.block} · neu</div>
          <div className="hash">#{v.hash.slice(0, 8)}</div>
        </div>
      </div>
      <div className="neben">Versiegelt am {versiegeltText(v.versiegelt, zeitzone)}</div>
      <Knopf variante="primaer" zeichen="plus" className="knopf-breit" onClick={beiFertig}>
        Neuen Einsatz erfassen
      </Knopf>
    </main>
  );
}
