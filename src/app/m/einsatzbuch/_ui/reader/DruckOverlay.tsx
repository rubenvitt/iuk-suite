"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "antd";
import { PiPrinter } from "react-icons/pi";
import { reportBrowserExport } from "@/core/audit/browser";
import { bericht } from "../../_lib/kern/bericht";
import type { Block, Einsatz } from "../../_lib/kern/format";
import { zeitpunktText } from "../../_lib/kern/zeit";
import { Berichtsblatt } from "../../_lib/kern/ansichten/Berichtsblatt";
import { chipText, type Kettenzustand } from "../../_lib/kern/ansichten/modell";
import s from "./reader.module.css";

export interface DruckOverlayProps {
  block: Block;
  einsatz: Einsatz;
  kette: Kettenzustand;
  dateiname: string;
  bereitschaft: string;
  zeitzone: string;
  onSchliessen(): void;
}

/**
 * Das Berichtsblatt über der Seite, mit Steuerleiste. Als Portal an `body`,
 * weil die Druckregeln in `reader.module.css` jedes andere Kind von `body` ausblenden — ein
 * Overlay tief in der Suite-Hülle bliebe mit ihr unsichtbar (Falle 18: Portale treffen
 * Druckregeln unter einem Suite-Rahmen nicht, also steht die Regel am Overlay selbst). Die
 * A4-Seite kommt aus dem Kern-CSS des Berichtsblatts (`@page einsatzbericht`).
 */
export function DruckOverlay({ block, einsatz, kette, dateiname, bereitschaft, zeitzone, onSchliessen }: DruckOverlayProps) {
  // Einmal beim Öffnen festgehalten: das Blatt nennt den Zeitpunkt, zu dem es erzeugt wurde.
  const [erzeugt] = useState(() => zeitpunktText(new Date().toISOString(), zeitzone));
  const speichern = useRef<HTMLButtonElement | HTMLAnchorElement>(null);

  // Der Fokus gehört beim Öffnen in den Dialog; zurück setzt ihn der Aufrufer in `onSchliessen`.
  useEffect(() => { speichern.current?.focus(); }, []);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") onSchliessen(); };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [onSchliessen]);

  const daten = bericht(block, einsatz, {
    pruefung: `${chipText(kette)} (geprüft im Reader)`,
    quelle: `Einsatzbuch Reader, aus ${dateiname}`,
    erzeugt,
    zeitzone,
  });

  function drucken() {
    window.print();
    reportBrowserExport({ module: "einsatzbuch", format: "reader_druck", von: block.kopf.block, bis: block.kopf.block, anzahl: 1 });
  }

  return createPortal(
    <div className={s.druckOverlay} role="dialog" aria-modal="true" aria-label={`Einsatzbericht · ${einsatz.nummer}`}>
      <div className={s.steuer} data-druck-steuer="">
        <div className={s.steuerText}>
          <span className={s.steuerTitel}>{`Einsatzbericht · ${einsatz.nummer}`}</span>
          <span className={s.steuerHinweis}>Im Druckdialog „Als PDF speichern“ wählen.</span>
        </div>
        <Button onClick={onSchliessen}>Schließen</Button>
        <Button type="primary" icon={<PiPrinter aria-hidden />} onClick={drucken} ref={speichern}>Als PDF speichern</Button>
      </div>
      <div className={s.blattRahmen}>
        <Berichtsblatt daten={daten} bereitschaft={bereitschaft} />
      </div>
    </div>,
    document.body,
  );
}
