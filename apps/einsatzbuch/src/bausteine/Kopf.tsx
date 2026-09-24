/**
 * Kopfzeile wie `SuiteKopf` der Vorlage (`components/verwaltung/shell/SuiteKopf.jsx`), abgemeldet:
 * 5 px Markenstreifen, 64 px Leiste, links die Wortmarke EINSATZ+BUCH, rechts der Umschalter
 * Hell/Dunkel/Auto. Kein Anmelden-Knopf, die Verwaltung kommt später.
 */
import type { ThemaWahl } from "../stil/thema";
import { Zeichen, type ZeichenName } from "./Symbol";

const THEMA_TEXT: Record<ThemaWahl, string> = {
  auto: "Automatisch (folgt dem Gerät)",
  light: "Hell",
  dark: "Dunkel",
};

const THEMA_ZEICHEN: Record<ThemaWahl, ZeichenName> = {
  auto: "anzeige-auto",
  light: "anzeige-hell",
  dark: "anzeige-dunkel",
};

export function Kopf({ thema, beiThemaWechsel }: { thema: ThemaWahl; beiThemaWechsel: () => void }) {
  const label = `Design: ${THEMA_TEXT[thema]}`;
  return (
    <div className="kopf">
      <div className="kopf-streifen" aria-hidden="true" />
      <header className="kopf-leiste">
        <strong className="wortmarke">
          EINSATZ<span className="wortmarke-akzent">BUCH</span>
        </strong>
        <button type="button" className="rundknopf" aria-label={label} title={label} onClick={beiThemaWechsel}>
          <Zeichen name={THEMA_ZEICHEN[thema]} />
        </button>
      </header>
    </div>
  );
}
