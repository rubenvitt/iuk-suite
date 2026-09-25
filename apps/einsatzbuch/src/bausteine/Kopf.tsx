/**
 * Kopfzeile wie `SuiteKopf` der Vorlage (`components/verwaltung/shell/SuiteKopf.jsx`): 5 px
 * Markenstreifen, 64 px Leiste, links die Wortmarke EINSATZ+BUCH. Rechts — eingerichtet und ohne
 * Sitzung — der Knopf „Verwaltung · Anmelden“ (Vorlage Zeile 45, aus dem Fuß der Startseite
 * hierher gezogen: die Kopfzeile steht auf jeder Seite außer der Startseite selbst). Mit Sitzung
 * zeigt der Kopf stattdessen den Namen (führt zur Verwaltung) und „Sitzung sperren“ (Spec §4.4:
 * Sperren heißt Abmelden, Entscheidung 9 aus `kontext.md`). Dazu immer der Umschalter
 * Hell/Dunkel/Auto.
 */
import type { ThemaWahl } from "../stil/thema";
import type { SitzungInfo } from "../typen";
import { Knopf } from "./Knopf";
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

interface KopfProps {
  thema: ThemaWahl;
  beiThemaWechsel: () => void;
  eingerichtet: boolean;
  sitzung: SitzungInfo | null;
  beiAnmeldenKlick: () => void;
  beiVerwaltungKlick: () => void;
  /** In der Verwaltung steht „Sitzung sperren“ in deren Kopfzeile; hier nicht ein zweites Mal. */
  mitSperren?: boolean;
  beiSperren: () => void;
}

export function Kopf({ thema, beiThemaWechsel, eingerichtet, sitzung, beiAnmeldenKlick, beiVerwaltungKlick, mitSperren = true, beiSperren }: KopfProps) {
  const label = `Design: ${THEMA_TEXT[thema]}`;
  return (
    <div className="kopf">
      <div className="kopf-streifen" aria-hidden="true" />
      <header className="kopf-leiste">
        <strong className="wortmarke">
          EINSATZ<span className="wortmarke-akzent">BUCH</span>
        </strong>
        <div className="kopf-rechts">
          {sitzung ? (
            <>
              <button type="button" className="kopf-nutzer" onClick={beiVerwaltungKlick}>
                {sitzung.name}
              </button>
              {mitSperren ? <Knopf onClick={beiSperren}>Sitzung sperren</Knopf> : null}
            </>
          ) : eingerichtet ? (
            <Knopf onClick={beiAnmeldenKlick}>Verwaltung · Anmelden</Knopf>
          ) : null}
          <button type="button" className="rundknopf" aria-label={label} title={label} onClick={beiThemaWechsel}>
            <Zeichen name={THEMA_ZEICHEN[thema]} />
          </button>
        </div>
      </header>
    </div>
  );
}
