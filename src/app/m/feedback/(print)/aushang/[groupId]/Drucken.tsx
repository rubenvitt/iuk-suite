"use client";

import { useEffect } from "react";
import { Button } from "antd";

/**
 * DER DRUCKANSTOSS (Entwurf §3.5).
 *
 * Zwei Wege zum selben Ziel, und beide werden gebraucht:
 *
 * 1. Beim Mount `window.print()` — wer „Aushang drucken" im Cockpit tippt, will
 *    drucken und nicht eine Seite lesen. Der neue Tab öffnet direkt den Dialog.
 * 2. Ein Knopf, weil Schritt 1 abgebrochen werden kann (Papier nachlegen,
 *    falscher Drucker) und der Tab dann ohne Ausweg dastünde.
 *
 * `className="noprint"`: der Knopf darf nicht auf dem Blatt landen. Er ist damit
 * das einzige Element der Seite, das die Druckregeln ausblenden.
 *
 * Absichtlich OHNE Verzögerung/`onload`-Kunststücke: der Dialog braucht das
 * Bild nicht — der Browser druckt erst, wenn er die Seite fertig hat, und ein
 * `setTimeout` wäre eine geratene Zahl, die auf langsamen Geräten falsch ist.
 */
export function Drucken() {
  useEffect(() => {
    window.print();
  }, []);

  return (
    <div className="noprint fb-aushang-drucken">
      <Button onClick={() => window.print()}>Drucken</Button>
    </div>
  );
}
