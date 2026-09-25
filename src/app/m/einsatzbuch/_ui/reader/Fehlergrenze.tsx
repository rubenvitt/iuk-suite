"use client";

import { Component, type ReactNode } from "react";
import { Alert, Button } from "antd";
import { INHALT_BESCHAEDIGT } from "../../_lib/reader/oeffnen";

interface Props { children: ReactNode; onSchliessen(): void }

/**
 * Fängt einen Renderfehler in der geöffneten Datei ab. Die zod-Prüfung nach dem Entschlüsseln
 * soll alles abweisen, woran die Anzeige scheitern könnte — bleibt trotzdem etwas übrig, zeigt
 * der Reader denselben Hinweis wie bei einem beschädigten Inhalt und einen Weg zurück, statt
 * einer weißen Seite. Der Aufrufer setzt je geöffneter Datei einen neuen `key`, damit ein
 * neuer Versuch nicht im alten Fehlerzustand beginnt.
 *
 * Eine Klassenkomponente, weil nur `getDerivedStateFromError` Renderfehler fangen kann.
 */
export class Fehlergrenze extends Component<Props, { fehler: boolean }> {
  state = { fehler: false };

  static getDerivedStateFromError(): { fehler: boolean } {
    return { fehler: true };
  }

  render() {
    if (!this.state.fehler) return this.props.children;
    return (
      <div data-fehlergrenze="" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16 }}>
        <Alert type="warning" showIcon title={INHALT_BESCHAEDIGT} style={{ alignSelf: "stretch" }} />
        <Button onClick={this.props.onSchliessen}>Datei schließen</Button>
      </div>
    );
  }
}
