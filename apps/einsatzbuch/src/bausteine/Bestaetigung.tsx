/**
 * Eigener Bestätigungsdialog für endgültige Schritte (heute: „Testbetrieb beenden“). Er liegt im
 * Baum der App statt in einem Portal. Der Fokus springt beim Öffnen auf „Abbrechen“, damit ein
 * versehentliches Enter nichts löscht, und kehrt beim Schließen zum auslösenden Knopf zurück.
 * Solange er offen ist, bleibt der Fokus darin: Tab und Umschalt+Tab kreisen über seine Knöpfe,
 * auch wenn der Fokus vorher außerhalb lag. Escape und ein Klick auf den Hintergrund brechen ab,
 * Escape auch dann, wenn der Fokus gerade nicht im Dialog steht.
 */
import { useEffect, useEffectEvent, useId, useRef } from "react";

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
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    abbrechen.current?.focus();
    return () => vorher?.focus();
  }, []);

  const taste = useEffectEvent((ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      beiAbbruch();
      return;
    }
    if (ev.key !== "Tab" || !dialog.current) return;
    const ziele = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled)"));
    const erstes = ziele[0];
    const letztes = ziele[ziele.length - 1];
    if (!erstes || !letztes) return;
    const aktiv = document.activeElement;
    const drinnen = aktiv instanceof Node && dialog.current.contains(aktiv);
    if (ev.shiftKey && (!drinnen || aktiv === erstes)) {
      ev.preventDefault();
      letztes.focus();
    } else if (!ev.shiftKey && (!drinnen || aktiv === letztes)) {
      ev.preventDefault();
      erstes.focus();
    }
  });

  useEffect(() => {
    const hoere = (ev: KeyboardEvent) => taste(ev);
    window.addEventListener("keydown", hoere);
    return () => window.removeEventListener("keydown", hoere);
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
        ref={dialog}
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
