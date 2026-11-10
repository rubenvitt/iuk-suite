import s from "./share.module.css";

/**
 * NOT-FOUND-GRENZE DER OEFFENTLICHEN FREIGABE (IDA-388). Faengt das `notFound()`
 * aus `page.tsx` fuer eine unbekannte Kennung. Vorher kam die allgemeine
 * 404-Seite der Suite mit „Zur Startseite" — und die fuehrte Empfaenger ohne
 * Konto auf die interne Anmeldung.
 *
 * Dieselbe Bauform wie der abgelaufene Link (`Zustandsseite` in `page.tsx`),
 * im selben Rahmen (`(oeffentlich-share)/layout.tsx`). Der Status bleibt 404,
 * und der Satz verraet nicht, ob es die Kennung je gab: „ungültig oder
 * abgelaufen" deckt beides (§7.4-Tabelle). Kein Weg zur Startseite.
 */
export default function FreigabeNichtGefunden() {
  return (
    <div data-testid="files-freigabe-unbekannt">
      <h1 className="fp-titel">Dateifreigabe</h1>
      <div className={s.warten}>
        <p className="fp-text">Dieser Link ist ungültig oder abgelaufen.</p>
      </div>
      <p className="fp-meta">Bitte wenden Sie sich an die Person, die Ihnen den Link gegeben hat.</p>
    </div>
  );
}
