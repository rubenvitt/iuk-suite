/**
 * Eigener Bestätigungsdialog für endgültige Schritte (heute: „Testbetrieb beenden“). Er liegt im
 * Baum der App statt in einem Portal. Der Fokus springt beim Öffnen auf „Abbrechen“, damit ein
 * versehentliches Enter nichts löscht, und kehrt beim Schließen zum auslösenden Knopf zurück.
 * Escape und ein Klick auf den Hintergrund brechen ab.
 */
import { useEffect, useId, useRef } from "react";

import { Knopf } from "./Knopf";

interface BestaetigungProps {
  titel: string;
  text: string;
  bestaetigen: string;
  beiBestaetigung: () => void;
  beiAbbruch: () => void;
}

export function Bestaetigung({ titel, text, bestaetigen, beiBestaetigung, beiAbbruch }: BestaetigungProps) {
  const titelId = useId();
  const textId = useId();
  const abbrechen = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    abbrechen.current?.focus();
    return () => vorher?.focus();
  }, []);

  return (
    <div
      className="modal-grund"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) beiAbbruch();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        aria-describedby={textId}
        className="modal"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            beiAbbruch();
          }
        }}
      >
        <h2 id={titelId} className="modal-titel">
          {titel}
        </h2>
        <p id={textId} className="modal-text">
          {text}
        </p>
        <div className="modal-knoepfe">
          <Knopf ref={abbrechen} onClick={beiAbbruch}>
            Abbrechen
          </Knopf>
          <Knopf variante="gefahr" onClick={beiBestaetigung}>
            {bestaetigen}
          </Knopf>
        </div>
      </div>
    </div>
  );
}
