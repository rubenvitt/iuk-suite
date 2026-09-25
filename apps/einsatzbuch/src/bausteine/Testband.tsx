/**
 * Dauerhaftes Band im Testbetrieb, über jeder Seite und nicht schließbar: Wer davor sitzt, soll
 * nie einen Testeinsatz für einen echten halten. Gestreift Gelb/Tinte, der Text auf eigener
 * heller Fläche, damit er auf den Streifen lesbar bleibt.
 */
export function Testband() {
  return (
    <div className="testband" role="status">
      <span className="testband-text">TESTBETRIEB — nichts hiervon ist ein echter Einsatz</span>
    </div>
  );
}
