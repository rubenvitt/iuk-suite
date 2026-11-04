"use client";

import { useEffect } from "react";

/**
 * Setzt den Dokumenttitel eines Druckblatts, damit „Als PDF speichern“ einen sprechenden Dateinamen vorschlägt
 * (`druckTitel` aus `./titel`). Ein Client-Effekt statt `generateMetadata`: der Titel kommt aus Daten, die die
 * Seite erst NACH ihren Riegeln lädt, und `generateMetadata` liefe parallel zu ihnen.
 *
 * `beforeprint` setzt ihn noch einmal, falls der Titel inzwischen überschrieben wurde; beim Verlassen kommt der
 * alte zurück (Überlagerungen wie der Bericht im Einsatzbuch-Reader).
 */
export function DruckTitel({ titel }: { titel: string }) {
  useEffect(() => {
    if (!titel) return;
    const vorher = document.title;
    const setze = () => { document.title = titel; };
    setze();
    window.addEventListener("beforeprint", setze);
    return () => {
      window.removeEventListener("beforeprint", setze);
      document.title = vorher;
    };
  }, [titel]);
  return null;
}
