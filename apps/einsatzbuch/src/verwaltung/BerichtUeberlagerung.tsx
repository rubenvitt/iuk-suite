/**
 * Das Berichtsblatt am Rechner (Plan Stufe 6, Entscheidung 8) nach der Vorlage (`pdfOffen` in
 * `docs/design/einsatzbuch-v2/vorlage/Einsatzbuch v2.dc.html`): die geteilte `Berichtsblatt`
 * aus dem Kern mit Steuerleiste darüber, wie `DruckOverlay` im Reader der Suite
 * (`M/_ui/reader/DruckOverlay.tsx`).
 *
 * Als Portal direkt unter `body`: Die Druckregeln in `app.css` hängen an der eigenen Klasse
 * `.bericht-ueberlagerung` und blenden beim Druck jedes andere Kind von `body` aus — eine
 * Überlagerung tief im Baum der App bliebe mit ihm unsichtbar (Falle 18, `CLAUDE.md`). Die
 * A4-Seite ist die benannte `@page einsatzbericht` aus dem Kern-CSS des Blatts.
 *
 * Gedruckt wird über den Befehl `drucken` der Hülle (`WebviewWindow::print()`), nicht über
 * `window.print()`, das WKWebView nicht zuverlässig kennt.
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { bericht } from "@kern/bericht";
import { Berichtsblatt } from "@kern/ansichten/Berichtsblatt";
import { chipText, knotenFuer, type Kettenzustand } from "@kern/ansichten/modell";
import type { Block, Einsatz } from "@kern/format";
import { zeitpunktText } from "@kern/zeit";

import { Hinweis } from "../bausteine/Hinweis";
import { Knopf } from "../bausteine/Knopf";
import { befehle } from "../befehle";

export interface BerichtUeberlagerungProps {
  block: Block;
  einsatz: Einsatz;
  /** Letzte Kettenprüfung der Verwaltung; `null`, solange keine lief. */
  pruefung: Kettenzustand | null;
  bereitschaft: string;
  sitzungName: string;
  /** Zeitpunkt mit Offset, zu dem das Blatt erzeugt wurde (`Status.jetzt` beim Öffnen). */
  erzeugt: string;
  zeitzone: string;
  beiSchliessen: () => void;
}

export function BerichtUeberlagerung({ block, einsatz, pruefung, bereitschaft, sitzungName, erzeugt, zeitzone, beiSchliessen }: BerichtUeberlagerungProps) {
  const [fehler, setFehler] = useState<string | null>(null);
  const speichern = useRef<HTMLButtonElement>(null);

  // Der Fokus gehört beim Öffnen in die Überlagerung und kehrt beim Schließen zurück.
  useEffect(() => {
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    speichern.current?.focus();
    return () => vorher?.focus();
  }, []);

  const taste = useEffectEvent((ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    beiSchliessen();
  });

  useEffect(() => {
    const hoere = (ev: KeyboardEvent) => taste(ev);
    window.addEventListener("keydown", hoere);
    return () => window.removeEventListener("keydown", hoere);
  }, []);

  const kette: Kettenzustand = pruefung ?? { art: "ungeprueft" };
  // Wie der Reader (`gewaehlt.knoten === "geprueft"`): nur ein Block, den die Prüfung bestätigt hat.
  const unveraendert = knotenFuer(block.kopf.block, kette) === "geprueft";
  const daten = bericht(block, einsatz, {
    pruefung: kette.art === "intakt" ? `${chipText(kette)} (geprüft am Rechner)` : chipText(kette),
    quelle: `Einsatzbuch Verwaltung, ${sitzungName}`,
    erzeugt: zeitpunktText(erzeugt, zeitzone),
    zeitzone,
  });

  async function drucken() {
    setFehler(null);
    try {
      await befehle.drucken();
    } catch (e) {
      setFehler(typeof e === "string" ? e : String(e));
    }
  }

  return createPortal(
    <div className="bericht-ueberlagerung" role="dialog" aria-modal="true" aria-label={`Einsatzbericht · ${einsatz.nummer}`}>
      <div className="bericht-steuer">
        <div className="bericht-steuer-text">
          <span className="bericht-steuer-titel">{`Einsatzbericht · ${einsatz.nummer}`}</span>
          <span>Im Druckdialog „Als PDF speichern“ wählen.</span>
        </div>
        <Knopf onClick={beiSchliessen}>Schließen</Knopf>
        <Knopf ref={speichern} variante="primaer" zeichen="drucken" onClick={() => void drucken()}>
          Als PDF speichern
        </Knopf>
        {fehler ? (
          <div className="bericht-steuer-fehler">
            <Hinweis ton="warn">{fehler}</Hinweis>
          </div>
        ) : null}
      </div>
      <div className="bericht-rahmen">
        <Berichtsblatt daten={daten} bereitschaft={bereitschaft} unveraendert={unveraendert} />
      </div>
    </div>,
    document.body,
  );
}
