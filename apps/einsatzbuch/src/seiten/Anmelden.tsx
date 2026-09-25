/**
 * Anmeldekarte der Verwaltung, nach `Einsatzbuch v2.dc.html` (Abschnitt „Anmeldung“, Zeile
 * ~292–306), und der Wartebildschirm während des offenen Browsers. Beide gehören zusammen: Die
 * Einrichtungsfrage zeigt nach ihrem eigenen Knopf denselben `Wartebildschirm` (`App.tsx` setzt
 * `wartetAuf` für `einrichten`, `anmelden` und `neu_einrichten` gleich um, denn alle drei warten
 * auf denselben Loopback-Rückruf und lassen sich mit demselben Befehl abbrechen).
 */
import { Karte } from "../bausteine/Karte";
import { Knopf } from "../bausteine/Knopf";

export function Wartebildschirm({ beiAbbrechen }: { beiAbbrechen: () => void }) {
  return (
    <main className="seite seite-schmal" data-screen-label="Anmeldung läuft">
      <Karte>
        <div className="stapel stapel-20">
          <div className="absatz">Anmeldung läuft — der Browser ist geöffnet. Melde dich dort an; danach geht es hier weiter.</div>
          <Knopf onClick={beiAbbrechen}>Abbrechen</Knopf>
        </div>
      </Karte>
    </main>
  );
}

interface AnmeldenProps {
  beiAnmelden: () => void;
  beiZurueck: () => void;
}

export function Anmelden({ beiAnmelden, beiZurueck }: AnmeldenProps) {
  return (
    <main className="seite seite-schmal" data-screen-label="Anmeldung">
      <Karte>
        <div className="stapel stapel-20">
          <div className="stapel stapel-8">
            <div className="kicker">Verwaltung</div>
            <h1 className="titel-karte">Anmelden, um Einsätze zu lesen</h1>
          </div>
          <div className="absatz">
            Nur für die Leitung. Nach der Anmeldung werden die versiegelten Einsätze auf diesem Rechner für deine Sitzung entschlüsselt.
          </div>
          <Knopf variante="primaer" className="volle-breite" onClick={beiAnmelden}>
            Mit Pocket ID anmelden
          </Knopf>
          <Knopf variante="text" zeichen="pfeil-links" className="volle-breite" onClick={beiZurueck}>
            Zurück zur Erfassung
          </Knopf>
        </div>
      </Karte>
    </main>
  );
}
