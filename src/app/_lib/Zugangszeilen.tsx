import type { Zugangsauskunft } from "./zugangsseite";
import styles from "../not-found.module.css";

/**
 * Die leisen Zeilen unter 404 und 403 (IDA-392): wen man fragt und mit welchem Konto man angemeldet ist.
 * Nur für Angemeldete; ohne Sitzung gibt es weder ein Konto noch einen Zugang, der fehlen könnte.
 *
 * `oderZugang` nur auf der 404: dort bleibt offen, ob die Seite fehlt oder der Zugang (die Riegel werfen
 * absichtlich `notFound()`). Der Satz nennt beide Möglichkeiten und verrät damit keine.
 */
export function Zugangszeilen({
  auskunft,
  oderZugang = false,
}: {
  auskunft: Zugangsauskunft;
  oderZugang?: boolean;
}) {
  if (auskunft.gruppen === null) return null;
  const { konto, ansprechpartner } = auskunft;
  const kontakt = ansprechpartner ? `Ansprechpartner: ${ansprechpartner}` : null;
  return (
    <div className={styles.zugang} data-testid="zugangszeilen">
      {oderZugang ? (
        <p data-testid="zugang-kontakt">
          {kontakt ? `Oder dir fehlt der Zugang. ${kontakt}` : "Oder dir fehlt der Zugang."}
        </p>
      ) : kontakt ? (
        <p data-testid="zugang-kontakt">{kontakt}</p>
      ) : null}
      {konto ? <p data-testid="zugang-konto">Angemeldet als {konto}</p> : null}
    </div>
  );
}
