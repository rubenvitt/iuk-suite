/**
 * Fehlerseite, wenn sich die Datenbank beim Start nicht öffnen ließ (`status.startfehler`). Sie
 * bietet bewusst keinen Einrichtungsweg und keinen Knopf, der schreibt: Rust lehnt dann ohnehin
 * jeden schreibenden Befehl ab, und eine neue Einrichtung verdeckte die kaputte Datei.
 */
export function Startfehler({ fehler }: { fehler: string }) {
  return (
    <main className="seite seite-schmal" data-screen-label="Startfehler">
      <div className="stapel stapel-16">
        <h1 className="titel">Die Datenbank dieses Rechners lässt sich nicht öffnen</h1>
        <div className="fehlertext">{fehler}</div>
        <div className="absatz">Bitte wende dich an die Verwaltung. Es wird nichts versiegelt, bis das behoben ist.</div>
      </div>
    </main>
  );
}
