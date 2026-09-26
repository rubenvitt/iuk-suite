/**
 * Fehlergrenze um die Verwaltung. Sie zeigt Klartext aus Blöcken, die nicht nur dieser Rechner
 * geschrieben hat (Wiederherstellung aus einer Sicherung). Ein Wert, an dem ein Formatierer
 * scheitert (etwa ein ungültiges Datum), soll keine weiße Seite hinterlassen. Stattdessen steht
 * ein Hinweis mit „Sitzung sperren“ da. Kopf und Erfassung liegen außerhalb und bleiben bedienbar.
 *
 * Die Meldung des Fehlers erscheint bewusst nicht: Sie kann den Klartext zitieren, und die Grenze
 * hält ihn sonst über die Sperre hinaus im Zustand fest (Review Focus 5). Zurückgesetzt wird die
 * Grenze nicht hier, sondern durch den Wechsel der Seite: Die Sperre hängt sie mit der Verwaltung ab.
 *
 * React kennt Fehlergrenzen nur als Klassenkomponente.
 */
import { Component, type ReactNode } from "react";

import { Hinweis } from "./Hinweis";
import { Knopf } from "./Knopf";

interface FehlergrenzeProps {
  beiSperren: () => void;
  children: ReactNode;
}

export class Fehlergrenze extends Component<FehlergrenzeProps, { gescheitert: boolean }> {
  state = { gescheitert: false };

  static getDerivedStateFromError(): { gescheitert: boolean } {
    return { gescheitert: true };
  }

  render(): ReactNode {
    if (!this.state.gescheitert) return this.props.children;
    return (
      <main className="seite seite-schmal" data-screen-label="Fehler">
        <div className="stapel stapel-16">
          <Hinweis ton="warn">Diese Ansicht ließ sich nicht anzeigen. Sperr die Sitzung und melde dich neu an.</Hinweis>
          <div>
            <Knopf variante="primaer" zeichen="schluessel" onClick={this.props.beiSperren}>
              Sitzung sperren
            </Knopf>
          </div>
        </div>
      </main>
    );
  }
}
